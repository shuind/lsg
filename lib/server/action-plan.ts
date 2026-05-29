import fs from "fs/promises"
import path from "path"
import type { ActionNode } from "@/lib/mock-data"
import type { LlmAction } from "@/lib/server/llm"
import { writeBookFile, readBookFile } from "@/lib/server/book-store"
import { getConfig, callChatCompletion } from "@/lib/server/llm"
import { generateSystemCheckReport, type SystemCheckType } from "@/lib/server/system-check-service"
import { getBookDir } from "@/lib/server/paths"

// ─── Intent Parsing ───────────────────────────────────────────

interface ParsedIntent {
  type:
    | "gender" | "relationship" | "character_create" | "character_update"
    | "world_update" | "chapter_check"
    | "foreshadowing_add" | "foreshadowing_payoff" | "event_record"
    | "timeline_event_add" | "character_position_update" | "chapter_summary_update"
    | "reader_knowledge_update" | "emotion_debt_add" | "emotion_debt_payoff"
    | "banned_pattern_add" | "quality_rule_update" | "system_check"
  event?: string
  character?: string
  target?: string
  charA?: string
  charB?: string
  relationship?: string
  name?: string
  fields?: { gender?: string; age?: string; identity?: string; summary?: string }
  field?: string
  value?: string
  fileHint?: string
  section?: string
  content?: string
  chapterHint?: string
  checkGoal?: string
  // phase 14 fields
  title?: string
  importance?: "普通" | "关键" | "转折"
  time?: string
  characters?: string[]
  position?: string
  chapter?: string
  summary?: string
  item?: string
  readerKnows?: boolean
  characterKnows?: string
  promise?: string
  note?: string
  pattern?: string
  reason?: string
  rule?: string
  detail?: string
  targets?: string[]
  checkType?: SystemCheckType
}

const GENDER_RE = /把\s*(.+?)\s*(?:改|换|变成?)\s*(男|女)\s*(?:的|生)?/
const REL_RE = /把\s*(.+?)\s*(?:和|跟|与)\s*(.+?)\s*(?:的)?关系\s*(?:改|换|变成?)\s*(敌对|盟友|同门|师徒|恋人|朋友|陌生人)/
const CHAR_CREATE_RE = /(?:新建|创建|新增)\s*(?:一个|一名)?\s*(?:人物|角色)\s*(?:叫|名叫)?\s*(\S+)/
const CHAR_UPDATE_RE = /(?:把|将)?\s*(\S+)\s*(?:的)?\s*(性别|年龄|身份|外貌|性格|背景|目标|备注)\s*(?:改|换|变成?)\s*(\S+)/
const WORLD_UPDATE_RE = /(?:在世界观里|世界观)\s*(?:增加|新增|添加|修改)\s*(?:一个|一条)?\s*(\S+)/
const CHAPTER_CHECK_RE = /(?:检查|扫描|查看)\s*(第.{1,3}章|.+?章)\s*(?:有没有|是否存在|是否)\s*(.+)/

// ── Phase 14 regexes ──
const FORESHADOW_ADD_RE = /(?:记录|添加|埋设|埋下)\s*(?:一个)?\s*伏笔\s*(?:叫|名为|：|:)?\s*(\S+)/
const FORESHADOW_PAYOFF_RE = /(?:回收|兑现|揭晓)\s*(?:一个)?\s*伏笔\s*(?:叫|名为|：|:)?\s*(\S+)/
const EVENT_RECORD_RE = /(?:记录|新增|添加)\s*(?:一个)?\s*(?:关键)?\s*事件\s*(?:叫|名为|：|:)?\s*(\S+)/
const TIMELINE_ADD_RE = /(?:在)?\s*时间线\s*(?:里|上)?\s*(?:添加|新增|记录)\s*(?:：|:)?\s*(\S+)/
const CHAR_POS_RE = /(?:把|将)?\s*(\S+)\s*(?:的)?\s*(?:位置|所在)\s*(?:改|更新|变成?|移到)\s*(\S+)/
const CHAPTER_SUM_RE = /(?:更新|补充|添加)\s*(第.{1,3}章|.+?章)\s*(?:的)?\s*摘要\s*(?:：|:)?\s*(.*)/
const READER_KNOW_RE = /(?:读者|大家)\s*(已经|不|还)?\s*(?:知道|了解)\s*(\S+)/
const EMOTION_ADD_RE = /(?:记录|种下|添加)\s*(?:一个)?\s*(?:情绪|情感|读者)\s*(?:期待|债务|承诺)\s*(?:：|:)?\s*(\S+)/
const EMOTION_PAYOFF_RE = /(?:兑现|实现|满足)\s*(?:一个)?\s*(?:情绪|情感|读者)\s*(?:期待|债务|承诺)\s*(?:：|:)?\s*(\S+)/
const BANNED_ADD_RE = /(?:禁止|避免|不要)\s*(?:使用|出现|写)?\s*(\S+)/
const QUALITY_RULE_RE = /(?:设定|设置|添加)\s*(?:一个)?\s*(?:写作|质量)?\s*规则\s*(?:：|:)?\s*(\S+)/
const SYSTEM_CHECK_RE = /(?:系统|全局|整体)\s*(?:一致性)?\s*(?:检查|扫描|审查)/
const FSCHECK_RE = /检查\s*(?:伏笔|埋设)\s*(?:有没有|是否)\s*(忘记|遗漏|未)?\s*回收/
const TLCHECK_RE = /检查\s*(?:时间线|时间)\s*(?:有没有|是否)\s*(矛盾|冲突|错乱)/
const POSCHECK_RE = /检查\s*(\S+?)\s*(?:的)?\s*位置\s*(?:有没有|是否|是否)\s*(混乱|矛盾|冲突|错乱)/
const READERCHECK_RE = /检查\s*(?:读者|信息差|爽点|情绪|期待|债务)\s*(?:有没有|是否)\s*(问题|混乱|遗漏|兑现)/
const QUALCHECK_RE = /检查\s*(?:有没有|是否)\s*(?:用了|使用了|出现|违反)\s*(禁止项|质量|规则|风格)/

export function parseIntent(text: string): ParsedIntent | null {
  const m1 = text.match(GENDER_RE)
  if (m1) {
    return { type: "gender", character: m1[1].trim(), target: m1[2] }
  }
  const m2 = text.match(REL_RE)
  if (m2) {
    return { type: "relationship", charA: m2[1].trim(), charB: m2[2].trim(), relationship: m2[3] }
  }
  const m3 = text.match(CHAR_CREATE_RE)
  if (m3) {
    return { type: "character_create", name: m3[1].trim() }
  }
  const m4 = text.match(CHAR_UPDATE_RE)
  if (m4) {
    return { type: "character_update", character: m4[1].trim(), field: m4[2], value: m4[3].trim() }
  }
  const m5 = text.match(WORLD_UPDATE_RE)
  if (m5) {
    return { type: "world_update", fileHint: m5[1].trim(), content: m5[1].trim() }
  }
  const m6 = text.match(CHAPTER_CHECK_RE)
  if (m6) {
    return { type: "chapter_check", chapterHint: m6[1].trim(), checkGoal: m6[2].trim() }
  }
  // phase 14
  const m7 = text.match(FORESHADOW_ADD_RE)
  if (m7) {
    return { type: "foreshadowing_add", name: m7[1].trim(), content: text }
  }
  const m8 = text.match(FORESHADOW_PAYOFF_RE)
  if (m8) {
    return { type: "foreshadowing_payoff", name: m8[1].trim() }
  }
  const m9 = text.match(EVENT_RECORD_RE)
  if (m9) {
    return { type: "event_record", title: m9[1].trim(), content: text }
  }
  const m10 = text.match(TIMELINE_ADD_RE)
  if (m10) {
    return { type: "timeline_event_add", time: m10[1].trim(), event: text }
  }
  const m11 = text.match(CHAR_POS_RE)
  if (m11) {
    return { type: "character_position_update", character: m11[1].trim(), position: m11[2].trim() }
  }
  const m12 = text.match(CHAPTER_SUM_RE)
  if (m12) {
    return { type: "chapter_summary_update", chapter: m12[1].trim(), summary: m12[2].trim() || text }
  }
  const m13 = text.match(READER_KNOW_RE)
  if (m13) {
    return { type: "reader_knowledge_update", item: m13[2].trim(), readerKnows: m13[1] !== "不" }
  }
  const m14 = text.match(EMOTION_ADD_RE)
  if (m14) {
    return { type: "emotion_debt_add", promise: m14[1].trim() }
  }
  const m15 = text.match(EMOTION_PAYOFF_RE)
  if (m15) {
    return { type: "emotion_debt_payoff", promise: m15[1].trim() }
  }
  const m16 = text.match(BANNED_ADD_RE)
  if (m16) {
    return { type: "banned_pattern_add", pattern: m16[1].trim() }
  }
  const m17 = text.match(QUALITY_RULE_RE)
  if (m17) {
    return { type: "quality_rule_update", rule: m17[1].trim() }
  }
  // specific check types
  const m18a = text.match(FSCHECK_RE)
  if (m18a) {
    return { type: "system_check", checkGoal: "检查伏笔回收情况", checkType: "foreshadowing" }
  }
  const m18b = text.match(TLCHECK_RE)
  if (m18b) {
    return { type: "system_check", checkGoal: "检查时间线一致性", checkType: "timeline" }
  }
  const m18c = text.match(POSCHECK_RE)
  if (m18c) {
    return { type: "system_check", checkGoal: `检查${m18c[1]}的位置一致性`, target: m18c[1].trim(), checkType: "character_position" }
  }
  const m18d = text.match(READERCHECK_RE)
  if (m18d) {
    return { type: "system_check", checkGoal: "检查读者体验一致性", checkType: "reader_experience" }
  }
  const m18e = text.match(QUALCHECK_RE)
  if (m18e) {
    return { type: "system_check", checkGoal: "检查写作质量约束", checkType: "quality" }
  }
  const m18 = text.match(SYSTEM_CHECK_RE)
  if (m18) {
    return { type: "system_check", checkGoal: "系统一致性检查" }
  }
  return null
}

const REL_MAP: Record<string, string> = {
  敌对: "hostile",
  盟友: "ally",
  同门: "sibling",
  师徒: "master",
  恋人: "lover",
  朋友: "friend",
  陌生人: "stranger",
}

// ─── Action Plan Generation ───────────────────────────────────

let idCounter = 0

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`
}

export function generateActionPlan(intents: ParsedIntent[]): ActionNode[] {
  const leaves: ActionNode[] = intents.map((intent) => {
    if (intent.type === "gender") {
      const name = intent.character!
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `${name} · 性别 → ${intent.target}`,
        scopePath: `人物设定/${name}.md`,
        operation: "update" as const,
        diff: `性别: → ${intent.target}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "relationship") {
      const a = intent.charA!
      const b = intent.charB!
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `关系：${a} ↔ ${b} → ${intent.relationship}`,
        scopePath: "关系图谱.json",
        operation: "update" as const,
        diff: `${a}_${b}: → ${intent.relationship}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "character_create") {
      const name = intent.name!
      const fieldsPreview = intent.fields
        ? Object.entries(intent.fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ")
        : ""
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `新建人物：${name}`,
        scopePath: `人物设定/${name}.md`,
        operation: "create" as const,
        diff: fieldsPreview ? `创建人物 ${name}\n${fieldsPreview}` : `创建人物 ${name}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "character_update") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `${intent.character} · ${intent.field} → ${intent.value}`,
        scopePath: `人物设定/${intent.character}.md`,
        operation: "update" as const,
        diff: `${intent.field}: → ${intent.value}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "world_update") {
      const sectionPreview = intent.section || "补充设定"
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `世界观：${intent.fileHint}`,
        scopePath: `世界观/${intent.fileHint}.md`,
        operation: "update" as const,
        diff: `${sectionPreview}: ${(intent.content || "").slice(0, 80)}`,
        status: "pending" as const,
      }
    }
    // chapter_check
    if (intent.type === "chapter_check") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `检查：${intent.chapterHint}`,
        scopePath: `章节正文/${intent.chapterHint}.md`,
        operation: "check" as const,
        diff: `检查目标: ${intent.checkGoal}`,
        status: "pending" as const,
      }
    }
    // ── Phase 14 ──
    if (intent.type === "foreshadowing_add") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `伏笔：${intent.name}`,
        scopePath: "剧情管理/伏笔清单.md",
        operation: "update" as const,
        diff: `添加伏笔 ${intent.name}: ${(intent.content || "").slice(0, 80)}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "foreshadowing_payoff") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `回收伏笔：${intent.name}`,
        scopePath: "剧情管理/伏笔清单.md",
        operation: "update" as const,
        diff: `回收伏笔 ${intent.name}${intent.note ? ": " + intent.note : ""}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "event_record") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `事件：${intent.title}`,
        scopePath: "剧情管理/关键事件.md",
        operation: "update" as const,
        diff: `${intent.importance || "普通"}事件 ${intent.title}: ${(intent.content || "").slice(0, 80)}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "timeline_event_add") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `时间线：${intent.time}`,
        scopePath: "状态追踪/时间线.md",
        operation: "update" as const,
        diff: `${intent.time}: ${(intent.event || "").slice(0, 80)}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "character_position_update") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `${intent.character} 位置 → ${intent.position}`,
        scopePath: "状态追踪/角色位置.md",
        operation: "update" as const,
        diff: `${intent.character}: → ${intent.position}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "chapter_summary_update") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `摘要：${intent.chapter}`,
        scopePath: `章节摘要/${intent.chapter}.md`,
        operation: "update" as const,
        diff: `更新摘要: ${(intent.summary || "").slice(0, 80)}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "reader_knowledge_update") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `信息差：${intent.item}`,
        scopePath: "读者体验/信息差.md",
        operation: "update" as const,
        diff: `${intent.item}: 读者${intent.readerKnows ? "已知" : "未知"}${intent.characterKnows ? ", " + intent.characterKnows + "已知" : ""}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "emotion_debt_add") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `情绪期待：${intent.promise}`,
        scopePath: "读者体验/情绪账户.md",
        operation: "update" as const,
        diff: `种下期待: ${intent.promise}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "emotion_debt_payoff") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `兑现期待：${intent.promise}`,
        scopePath: "读者体验/情绪账户.md",
        operation: "update" as const,
        diff: `兑现期待: ${intent.promise}${intent.note ? ": " + intent.note : ""}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "banned_pattern_add") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `禁止项：${intent.pattern}`,
        scopePath: "写作约束/禁止项.md",
        operation: "update" as const,
        diff: `禁止: ${intent.pattern}${intent.reason ? " — " + intent.reason : ""}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "quality_rule_update") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `质量规则：${intent.rule}`,
        scopePath: "写作约束/质量约束.md",
        operation: "update" as const,
        diff: `规则: ${intent.rule}${intent.detail ? " — " + intent.detail : ""}`,
        status: "pending" as const,
      }
    }
    if (intent.type === "system_check") {
      const ct = intent.checkType || "foreshadowing"
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `系统检查：${intent.checkGoal}`,
        scopePath: "检查报告",
        operation: "check" as const,
        diff: `检查目标: ${intent.checkGoal}\n检查类型: ${ct}${intent.target ? `\n检查对象: ${intent.target}` : ""}`,
        status: "pending" as const,
      }
    }
    // fallback for unmatched
    return {
      id: makeId("leaf"),
      level: "leaf" as const,
      label: `检查：${(intent as ParsedIntent).chapterHint ?? "未知"}`,
      scopePath: `章节正文/${(intent as ParsedIntent).chapterHint ?? "未知"}.md`,
      operation: "check" as const,
      diff: `检查目标: ${(intent as ParsedIntent).checkGoal ?? "未知"}`,
      status: "pending" as const,
    }
  })

  if (leaves.length === 0) return []

  return [
    {
      id: makeId("root"),
      level: "root",
      label: "修改设定",
      impact: { files: leaves.length, chapters: 0, entities: intents.length },
      status: "pending",
      children: leaves,
    },
  ]
}

export function generateActionPlanFromLlmActions(actions: LlmAction[]): ActionNode[] {
  if (actions.length === 0) return []

  // ── Step 1: Convert each action to a leaf node ──
  function actionToLeaf(action: LlmAction): ActionNode {
    const base = { id: makeId("leaf"), level: "leaf" as const, status: "pending" as const }

    switch (action.type) {
      case "gender_change":
        return { ...base, label: `${action.character} · 性别 → ${action.target}`, scopePath: `人物设定/${action.character}.md`, operation: "update", diff: `**性别**　→ ${action.target}` }
      case "relationship_change":
        return { ...base, label: `关系：${action.charA} ↔ ${action.charB} → ${action.relationship}`, scopePath: "关系图谱.json", operation: "update", diff: `${action.charA}_${action.charB}: → ${action.relationship}` }
      case "character_create": {
        const fields = action.fields
        const lines = [
          fields?.gender && `**性别**　${fields.gender}`,
          fields?.age && `**年龄**　${fields.age}`,
          fields?.identity && `**身份**　${fields.identity}`,
          fields?.summary && `\n${fields.summary}`,
        ].filter(Boolean).join("\n")
        return { ...base, label: `新建人物：${action.name}`, scopePath: `人物设定/${action.name}.md`, operation: "create", diff: lines || `创建人物 ${action.name}` }
      }
      case "character_update":
        return { ...base, label: `${action.character} · ${action.field} → ${action.value}`, scopePath: `人物设定/${action.character}.md`, operation: "update", diff: `**${action.field}**　→ ${action.value}` }
      case "world_update":
        return { ...base, label: `世界观：${action.fileHint}`, scopePath: `世界观/${action.fileHint}.md`, operation: "update", diff: `${action.section || "补充设定"}\n${action.content.slice(0, 120)}` }
      case "chapter_check":
        return { ...base, label: `检查：${action.chapterHint}`, scopePath: `章节正文/${action.chapterHint}.md`, operation: "check", diff: `检查目标: ${action.checkGoal}${action.target ? `\n检查对象: ${action.target}` : ""}` }
      case "foreshadowing_add":
        return { ...base, label: `埋设伏笔：${action.name}`, scopePath: "剧情管理/伏笔清单.md", operation: "update", diff: `${action.name}${action.chapter ? `（${action.chapter}）` : ""}\n${action.content.slice(0, 120)}` }
      case "foreshadowing_payoff":
        return { ...base, label: `回收伏笔：${action.name}`, scopePath: "剧情管理/伏笔清单.md", operation: "update", diff: `${action.name}${action.chapter ? `（${action.chapter}）` : ""}${action.note ? "\n" + action.note : ""}` }
      case "event_record":
        return { ...base, label: `事件：${action.title}`, scopePath: "剧情管理/关键事件.md", operation: "update", diff: `[${action.importance || "普通"}] ${action.title}\n${action.content.slice(0, 120)}` }
      case "timeline_event_add":
        return { ...base, label: `时间线：${action.time}`, scopePath: "状态追踪/时间线.md", operation: "update", diff: `**${action.time}**　${action.event.slice(0, 120)}${action.characters?.length ? `\n涉及: ${action.characters.join("、")}` : ""}` }
      case "character_position_update":
        return { ...base, label: `${action.character} → ${action.position}`, scopePath: "状态追踪/角色位置.md", operation: "update", diff: `**${action.character}**　→ ${action.position}${action.chapter ? `（${action.chapter}）` : ""}` }
      case "chapter_summary_update":
        return { ...base, label: `摘要：${action.chapter}`, scopePath: `章节摘要/${action.chapter}.md`, operation: "update", diff: action.summary.slice(0, 120) }
      case "reader_knowledge_update":
        return { ...base, label: `信息差：${action.item}`, scopePath: "读者体验/信息差.md", operation: "update", diff: `**${action.item}**　读者${action.readerKnows ? "已知" : "未知"}${action.characterKnows ? `，${action.characterKnows}已知` : ""}` }
      case "emotion_debt_add":
        return { ...base, label: `情绪期待：${action.promise}`, scopePath: "读者体验/情绪账户.md", operation: "update", diff: `**${action.promise}**${action.chapter ? `（${action.chapter}种下）` : ""}　⏳待兑现` }
      case "emotion_debt_payoff":
        return { ...base, label: `兑现期待：${action.promise}`, scopePath: "读者体验/情绪账户.md", operation: "update", diff: `**${action.promise}**　✅已兑现${action.chapter ? `（${action.chapter}）` : ""}${action.note ? "：" + action.note : ""}` }
      case "banned_pattern_add":
        return { ...base, label: `禁止项：${action.pattern}`, scopePath: "写作约束/禁止项.md", operation: "update", diff: `**${action.pattern}**${action.reason ? "：" + action.reason : ""}` }
      case "quality_rule_update":
        return { ...base, label: `质量规则：${action.rule}`, scopePath: "写作约束/质量约束.md", operation: "update", diff: `**${action.rule}**${action.detail ? "：" + action.detail : ""}` }
      case "system_check":
        return { ...base, label: `系统检查：${action.checkGoal}`, scopePath: "检查报告", operation: "check", diff: `检查类型: ${action.checkType || "foreshadowing"}${action.targets ? `\n检查对象: ${action.targets.join(",")}` : ""}` }
    }
  }

  // ── Step 2: Group actions by system category ──
  const groups = new Map<string, ActionNode[]>()

  const GROUP_MAP: Record<string, string> = {
    gender_change: "人物系统",
    relationship_change: "人物系统",
    character_create: "人物系统",
    character_update: "人物系统",
    character_position_update: "人物系统",
    world_update: "世界观",
    chapter_check: "章节",
    chapter_summary_update: "章节",
    foreshadowing_add: "剧情管理",
    foreshadowing_payoff: "剧情管理",
    event_record: "剧情管理",
    emotion_debt_add: "剧情管理",
    emotion_debt_payoff: "剧情管理",
    timeline_event_add: "状态追踪",
    reader_knowledge_update: "状态追踪",
    banned_pattern_add: "写作约束",
    quality_rule_update: "写作约束",
    system_check: "系统检查",
  }

  for (const action of actions) {
    const leaf = actionToLeaf(action)
    const group = GROUP_MAP[action.type] ?? "其他"
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(leaf)
  }

  // ── Step 3: Build tree ──
  const systemNodes: ActionNode[] = []
  let totalFiles = 0

  for (const [label, leaves] of groups) {
    const scopePaths = new Set(leaves.map((l) => l.scopePath).filter(Boolean))
    totalFiles += scopePaths.size
    systemNodes.push({
      id: makeId("sys"),
      level: "system",
      label,
      impact: { files: scopePaths.size, chapters: 0, entities: leaves.length },
      status: "pending",
      children: leaves,
    })
  }

  return [
    {
      id: makeId("root"),
      level: "root",
      label: "修改设定",
      impact: { files: totalFiles, chapters: 0, entities: actions.length },
      status: "pending",
      children: systemNodes,
    },
  ]
}

// ─── Pending Plan Storage ─────────────────────────────────────

function planPath(bookId: string): string {
  return path.join(getBookDir(bookId), "pending-action-plan.json")
}

export async function savePendingPlan(bookId: string, plan: ActionNode[]): Promise<void> {
  const filePath = planPath(bookId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(plan, null, 2), "utf-8")
}

export async function loadPendingPlan(bookId: string): Promise<ActionNode[]> {
  try {
    const raw = await fs.readFile(planPath(bookId), "utf-8")
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ─── Node Tree Operations ─────────────────────────────────────

function findNode(tree: ActionNode[], id: string): ActionNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

function collectLeaves(node: ActionNode): ActionNode[] {
  if (!node.children || node.children.length === 0) return [node]
  return node.children.flatMap(collectLeaves)
}

function updateNodeStatus(tree: ActionNode[], id: string, status: ActionNode["status"]): ActionNode[] {
  return tree.map((node) => {
    if (node.id === id) return { ...node, status }
    if (node.children) return { ...node, children: updateNodeStatus(node.children, id, status) }
    return node
  })
}

function removeNodeFromTree(tree: ActionNode[], id: string): ActionNode[] {
  return tree
    .filter((n) => n.id !== id)
    .map((n) => (n.children ? { ...n, children: removeNodeFromTree(n.children, id) } : n))
}

// ─── File Execution Helpers ───────────────────────────────────

const GENDER_LINE_RE = /(\*\*性别\*\*)\s*　?.*/

async function executeGenderChange(bookId: string, name: string, target: string): Promise<void> {
  const filePath = `人物设定/${name}.md`
  let content = await readBookFile(bookId, filePath)
  if (!content) {
    content = `# ${name}\n\n**性别**　${target}\n`
  } else if (GENDER_LINE_RE.test(content)) {
    content = content.replace(GENDER_LINE_RE, `$1　${target}`)
  } else {
    content = content.replace(/^#\s+.+$/m, `$&\n\n**性别**　${target}`)
  }
  await writeBookFile(bookId, filePath, content)
}

async function executeRelationshipChange(
  bookId: string,
  charA: string,
  charB: string,
  relationship: string,
): Promise<void> {
  const filePath = "关系图谱.json"
  const raw = await readBookFile(bookId, filePath)
  let data: Record<string, string> = {}
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = {}
  }

  const key = `${charA}_${charB}`
  const altKey = `${charB}_${charA}`
  if (key in data) {
    data[key] = REL_MAP[relationship] ?? relationship
  } else if (altKey in data) {
    data[altKey] = REL_MAP[relationship] ?? relationship
  } else {
    data[key] = REL_MAP[relationship] ?? relationship
  }

  await writeBookFile(bookId, filePath, JSON.stringify(data, null, 2) + "\n")
}

async function executeCharacterCreate(
  bookId: string,
  name: string,
  diff: string,
): Promise<void> {
  const filePath = `人物设定/${name}.md`
  const existing = await readBookFile(bookId, filePath)

  if (!existing) {
    // extract fields from diff if present
    const genderMatch = diff.match(/gender:\s*(\S+)/)
    const ageMatch = diff.match(/age:\s*(\S+)/)
    const identityMatch = diff.match(/identity:\s*(\S+)/)
    const summaryMatch = diff.match(/summary:\s*(.+)/)

    const gender = genderMatch?.[1] ?? "未定"
    const age = ageMatch?.[1] ?? "未定"
    const identity = identityMatch?.[1] ?? "未定"
    const summary = summaryMatch?.[1] ?? "（待补充）"

    const content = `# ${name}

**性别**　${gender}
**年龄**　${age}
**身份**　${identity}

## 人物小传

${summary}

## 核心目标

（待补充）

## 关联人物

（待补充）
`
    await writeBookFile(bookId, filePath, content)
  } else {
    // file exists — append supplementary section
    const supplement = `\n\n## 补充设定\n\n${diff.replace(/^创建人物\s*\S+\s*\n?/, "")}\n`
    await writeBookFile(bookId, filePath, existing + supplement)
  }
}

async function executeCharacterUpdate(
  bookId: string,
  character: string,
  field: string,
  value: string,
): Promise<void> {
  const filePath = `人物设定/${character}.md`
  let content = await readBookFile(bookId, filePath)

  if (!content) {
    // create basic file with the field
    const metaFields: Record<string, string> = { 性别: "未定", 年龄: "未定", 身份: "未定" }
    if (field in metaFields) metaFields[field] = value
    content = `# ${character}

**性别**　${metaFields.性别}
**年龄**　${metaFields.年龄}
**身份**　${metaFields.身份}

## 人物小传

（待补充）

## 核心目标

（待补充）

## 关联人物

（待补充）
`
    await writeBookFile(bookId, filePath, content)
    return
  }

  // try to replace meta line (性别/年龄/身份)
  const metaRe = new RegExp(`(\\*\\*${field}\\*\\*)\\s*　?.*`)
  if (metaRe.test(content) && (field === "性别" || field === "年龄" || field === "身份")) {
    content = content.replace(metaRe, `$1　${value}`)
    await writeBookFile(bookId, filePath, content)
    return
  }

  // try to replace section ## {field}
  const sectionRe = new RegExp(`(##\\s*${field}[\\s\\S]*?)(?=##\\s|$)`)
  if (sectionRe.test(content)) {
    content = content.replace(sectionRe, `## ${field}\n\n${value}\n`)
    await writeBookFile(bookId, filePath, content)
    return
  }

  // fallback: append new section
  content += `\n\n## ${field}\n\n${value}\n`
  await writeBookFile(bookId, filePath, content)
}

async function executeWorldUpdate(
  bookId: string,
  fileHint: string,
  section: string | undefined,
  content: string,
): Promise<void> {
  // find matching file in 世界观/
  const worldDir = path.join(getBookDir(bookId), "世界观")
  let targetFile = `${fileHint}.md`

  try {
    const entries = await fs.readdir(worldDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue
      if (entry.name.includes(fileHint)) {
        targetFile = entry.name
        break
      }
    }
  } catch {
    // directory may not exist yet
  }

  const filePath = `世界观/${targetFile}`
  let existing = await readBookFile(bookId, filePath)

  if (!existing) {
    // create new file
    const sectionTitle = section || "补充设定"
    existing = `# ${fileHint}\n\n## ${sectionTitle}\n\n${content}\n`
    await writeBookFile(bookId, filePath, existing)
    return
  }

  if (section) {
    // try to find and append to existing section
    const sectionRe = new RegExp(`(##\\s*${section}[\\s\\S]*?)(?=##\\s|$)`)
    if (sectionRe.test(existing)) {
      existing = existing.replace(sectionRe, `$1\n${content}\n`)
    } else {
      existing += `\n\n## ${section}\n\n${content}\n`
    }
  } else {
    // append to end with a generic section
    existing += `\n\n## 补充设定\n\n${content}\n`
  }

  await writeBookFile(bookId, filePath, existing)
}

async function executeChapterCheck(
  bookId: string,
  chapterHint: string,
  target: string | undefined,
  checkGoal: string,
): Promise<void> {
  // find the chapter file
  const chapterDir = path.join(getBookDir(bookId), "章节正文")
  let chapterPath: string | null = null
  let chapterContent = ""

  try {
    const entries = await fs.readdir(chapterDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue
      if (entry.name.includes(chapterHint)) {
        chapterPath = `章节正文/${entry.name}`
        chapterContent = (await readBookFile(bookId, chapterPath)) ?? ""
        break
      }
    }
  } catch {
    // directory may not exist
  }

  // read target character file if specified
  let targetContent = ""
  if (target) {
    targetContent = (await readBookFile(bookId, `人物设定/${target}.md`)) ?? ""
  }

  // try LLM for a real check report
  const config = getConfig()
  let reportBody = ""

  if (config && chapterContent) {
    try {
      const messages = [
        {
          role: "system" as const,
          content: "你是一个小说设定一致性检查助手。根据提供的章节内容和设定信息，生成简洁的检查报告。只输出报告文本，不要输出 JSON 或 markdown 代码块。",
        },
        {
          role: "user" as const,
          content: `## 检查目标\n${checkGoal}\n\n## 章节内容\n${chapterContent.slice(-3000)}\n\n${target ? `## 相关设定\n${targetContent.slice(0, 2000)}` : ""}\n\n请列出可能的设定冲突或不一致之处。如果没有发现冲突，说明"未发现明显冲突"。`,
        },
      ]
      reportBody = (await callChatCompletion(config, messages, { temperature: 0.3, maxTokens: 800 })).content
    } catch {
      reportBody = ""
    }
  }

  // fallback report
  if (!reportBody) {
    const checkedFiles = [chapterPath, target ? `人物设定/${target}.md` : null].filter(Boolean)
    reportBody = `## 已检查文件\n\n${checkedFiles.map((f) => `- ${f}`).join("\n")}\n\n## 结果\n\n（请人工确认以上文件内容是否一致）`
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const reportName = `${timestamp}-${chapterHint}.md`
  const report = `# 检查报告：${chapterHint}

检查目标：${checkGoal
}
检查时间：${new Date().toLocaleString("zh-CN")}

${reportBody}
`

  await writeBookFile(bookId, `检查报告/${reportName}`, report)
}

// ── Phase 14 execution functions ──

async function appendOrCreate(bookId: string, filePath: string, appendContent: string): Promise<void> {
  const existing = await readBookFile(bookId, filePath)
  if (existing) {
    await writeBookFile(bookId, filePath, existing.trimEnd() + "\n" + appendContent + "\n")
  } else {
    await writeBookFile(bookId, filePath, appendContent + "\n")
  }
}

async function executeForeshadowingAdd(bookId: string, name: string, content: string, chapter?: string): Promise<void> {
  const entry = `- **${name}**${chapter ? `（${chapter}）` : ""}：${content}　⬜待回收`
  await appendOrCreate(bookId, "剧情管理/伏笔清单.md", entry)
}

async function executeForeshadowingPayoff(bookId: string, name: string, chapter?: string, note?: string): Promise<void> {
  const filePath = "剧情管理/伏笔清单.md"
  let existing = await readBookFile(bookId, filePath) ?? ""
  // try to mark existing entry as paid off
  const re = new RegExp(`(- \\*\\*${name}\\*\\*.*?)　⬜待回收`)
  if (re.test(existing)) {
    existing = existing.replace(re, `$1　✅已回收${chapter ? `（${chapter}）` : ""}${note ? "：" + note : ""}`)
    await writeBookFile(bookId, filePath, existing)
  } else {
    const entry = `- **${name}**${chapter ? `（${chapter}）` : ""}　✅已回收${note ? "：" + note : ""}`
    await appendOrCreate(bookId, filePath, entry)
  }
}

async function executeEventRecord(bookId: string, title: string, content: string, importance?: string): Promise<void> {
  const entry = `### ${title}${importance ? ` [${importance}]` : ""}\n\n${content}`
  await appendOrCreate(bookId, "剧情管理/关键事件.md", entry)
}

async function executeTimelineEventAdd(bookId: string, time: string, event: string, characters?: string[]): Promise<void> {
  const charStr = characters && characters.length > 0 ? `（${characters.join("、")}）` : ""
  const entry = `- **${time}**：${event}${charStr}`
  await appendOrCreate(bookId, "状态追踪/时间线.md", entry)
}

async function executeCharacterPositionUpdate(bookId: string, character: string, position: string, chapter?: string): Promise<void> {
  const entry = `- **${character}**：${position}${chapter ? `（${chapter}）` : ""}`
  await appendOrCreate(bookId, "状态追踪/角色位置.md", entry)
}

async function executeChapterSummaryUpdate(bookId: string, chapter: string, summary: string): Promise<void> {
  const filePath = `章节摘要/${chapter}.md`
  const content = `# ${chapter} 摘要\n\n${summary}\n`
  await writeBookFile(bookId, filePath, content)
}

async function executeReaderKnowledgeUpdate(bookId: string, item: string, readerKnows: boolean, characterKnows?: string): Promise<void> {
  const status = readerKnows ? "读者已知" : "读者未知"
  const charStr = characterKnows ? `，${characterKnows}已知` : ""
  const entry = `- **${item}**：${status}${charStr}`
  await appendOrCreate(bookId, "读者体验/信息差.md", entry)
}

async function executeEmotionDebtAdd(bookId: string, promise: string, chapter?: string): Promise<void> {
  const entry = `- **${promise}**${chapter ? `（${chapter}种下）` : ""}　⏳待兑现`
  await appendOrCreate(bookId, "读者体验/情绪账户.md", entry)
}

async function executeEmotionDebtPayoff(bookId: string, promise: string, chapter?: string, note?: string): Promise<void> {
  const filePath = "读者体验/情绪账户.md"
  let existing = await readBookFile(bookId, filePath) ?? ""
  const re = new RegExp(`(- \\*\\*${promise}\\*\\*.*?)　⏳待兑现`)
  if (re.test(existing)) {
    existing = existing.replace(re, `$1　✅已兑现${chapter ? `（${chapter}）` : ""}${note ? "：" + note : ""}`)
    await writeBookFile(bookId, filePath, existing)
  } else {
    const entry = `- **${promise}**${chapter ? `（${chapter}）` : ""}　✅已兑现${note ? "：" + note : ""}`
    await appendOrCreate(bookId, filePath, entry)
  }
}

async function executeBannedPatternAdd(bookId: string, pattern: string, reason?: string): Promise<void> {
  const entry = `- **${pattern}**${reason ? "：" + reason : ""}`
  await appendOrCreate(bookId, "写作约束/禁止项.md", entry)
}

async function executeQualityRuleUpdate(bookId: string, rule: string, detail?: string): Promise<void> {
  const entry = `- **${rule}**${detail ? "：" + detail : ""}`
  await appendOrCreate(bookId, "写作约束/质量约束.md", entry)
}

async function executeSystemCheck(
  bookId: string,
  checkGoal: string,
  checkType: SystemCheckType = "foreshadowing",
  target?: string,
): Promise<void> {
  const result = await generateSystemCheckReport({
    bookId,
    checkType,
    target,
    goal: checkGoal,
  })

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  await writeBookFile(bookId, `检查报告/${timestamp}-${checkType}.md`, result.content)
}

// ─── Confirm / Abandon ────────────────────────────────────────

export async function confirmNode(
  bookId: string,
  nodeId: string,
): Promise<{ success: boolean; plan: ActionNode[] }> {
  let plan = await loadPendingPlan(bookId)
  const node = findNode(plan, nodeId)
  if (!node) return { success: false, plan }

  const leaves = collectLeaves(node)
  for (const leaf of leaves) {
    if (leaf.status === "done" || !leaf.scopePath) continue

    if (leaf.operation === "create" && leaf.scopePath.startsWith("人物设定/")) {
      const nameMatch = leaf.scopePath.match(/人物设定\/(.+)\.md/)
      if (nameMatch) {
        await executeCharacterCreate(bookId, nameMatch[1], leaf.diff ?? "")
      }
    } else if (leaf.operation === "check" && leaf.scopePath === "检查报告") {
      // system_check
      const goalMatch = leaf.diff?.match(/检查目标:\s*(.+)/)
      const typeMatch = leaf.diff?.match(/检查类型:\s*(\S+)/)
      const targetMatch = leaf.diff?.match(/检查对象:\s*(.+)/)
      const checkType = (typeMatch?.[1] as SystemCheckType) || "foreshadowing"
      const target = targetMatch?.[1]?.trim()
      await executeSystemCheck(bookId, goalMatch?.[1] ?? "系统一致性检查", checkType, target)
    } else if (leaf.operation === "check") {
      const chapterMatch = leaf.scopePath.match(/章节正文\/(.+)\.md/)
      const goalMatch = leaf.diff?.match(/检查目标:\s*(.+)/)
      const targetMatch = leaf.diff?.match(/检查目标:.*?(?:关于|针对|涉及)\s*(\S+)/)
      if (chapterMatch) {
        await executeChapterCheck(
          bookId,
          chapterMatch[1],
          targetMatch?.[1],
          goalMatch?.[1] ?? "检查设定一致性",
        )
      }
    } else if (leaf.operation === "update") {
      const isGender =
        leaf.scopePath.startsWith("人物设定/") &&
        leaf.scopePath.endsWith(".md") &&
        leaf.diff?.includes("性别")
      const isWorldUpdate = leaf.scopePath.startsWith("世界观/")
      const isCharUpdate = leaf.scopePath.startsWith("人物设定/") && !isGender && leaf.diff?.includes("→")
      const isRel = leaf.scopePath === "关系图谱.json"

      if (isGender) {
        const nameMatch = leaf.scopePath.match(/人物设定\/(.+)\.md/)
        const targetMatch = leaf.diff?.match(/→\s*(男|女)/)
        if (nameMatch && targetMatch) {
          await executeGenderChange(bookId, nameMatch[1], targetMatch[1])
        }
      } else if (isRel) {
        const relMatch = leaf.diff?.match(/(.+?)_(.+?):\s*→\s*(.+)/)
        if (relMatch) {
          await executeRelationshipChange(bookId, relMatch[1], relMatch[2], relMatch[3])
        }
      } else if (isCharUpdate) {
        const nameMatch = leaf.scopePath.match(/人物设定\/(.+)\.md/)
        const fieldMatch = leaf.diff?.match(/(.+?):\s*→\s*(.+)/)
        if (nameMatch && fieldMatch) {
          await executeCharacterUpdate(bookId, nameMatch[1], fieldMatch[1].trim(), fieldMatch[2].trim())
        }
      } else if (isWorldUpdate) {
        const hintMatch = leaf.scopePath.match(/世界观\/(.+)\.md/)
        const sectionMatch = leaf.diff?.match(/(.+?):\s*(.+)/)
        if (hintMatch) {
          await executeWorldUpdate(
            bookId,
            hintMatch[1],
            sectionMatch?.[1]?.trim(),
            sectionMatch?.[2]?.trim() ?? leaf.diff ?? "",
          )
        }
      } else if (leaf.scopePath === "剧情管理/伏笔清单.md") {
        const payoffMatch = leaf.diff?.match(/回收伏笔\s*(\S+)/)
        if (payoffMatch) {
          const noteMatch = leaf.diff?.match(/回收伏笔\s*\S+:\s*(.+)/)
          await executeForeshadowingPayoff(bookId, payoffMatch[1], undefined, noteMatch?.[1])
        } else {
          const addMatch = leaf.diff?.match(/添加伏笔\s*(\S+?):\s*(.+)/)
          if (addMatch) {
            await executeForeshadowingAdd(bookId, addMatch[1], addMatch[2])
          }
        }
      } else if (leaf.scopePath === "剧情管理/关键事件.md") {
        const eventMatch = leaf.diff?.match(/(?:普通|关键|转折)?事件\s*(\S+?):\s*(.+)/)
        if (eventMatch) {
          const impMatch = leaf.diff?.match(/(普通|关键|转折)/)
          await executeEventRecord(bookId, eventMatch[1], eventMatch[2], impMatch?.[1])
        }
      } else if (leaf.scopePath === "状态追踪/时间线.md") {
        const tlMatch = leaf.diff?.match(/(\S+?):\s*(.+)/)
        if (tlMatch) {
          await executeTimelineEventAdd(bookId, tlMatch[1], tlMatch[2])
        }
      } else if (leaf.scopePath === "状态追踪/角色位置.md") {
        const posMatch = leaf.diff?.match(/(\S+?):\s*→\s*(.+)/)
        if (posMatch) {
          await executeCharacterPositionUpdate(bookId, posMatch[1], posMatch[2])
        }
      } else if (leaf.scopePath.startsWith("章节摘要/")) {
        const chMatch = leaf.scopePath.match(/章节摘要\/(.+)\.md/)
        const sumMatch = leaf.diff?.match(/更新摘要:\s*(.+)/)
        if (chMatch && sumMatch) {
          await executeChapterSummaryUpdate(bookId, chMatch[1], sumMatch[1])
        }
      } else if (leaf.scopePath === "读者体验/信息差.md") {
        const knowMatch = leaf.diff?.match(/(\S+?):\s*读者(已知|未知)/)
        if (knowMatch) {
          const charKnowMatch = leaf.diff?.match(/,\s*(\S+)已知/)
          await executeReaderKnowledgeUpdate(bookId, knowMatch[1], knowMatch[2] === "已知", charKnowMatch?.[1])
        }
      } else if (leaf.scopePath === "读者体验/情绪账户.md") {
        const payMatch = leaf.diff?.match(/兑现期待:\s*(\S+)/)
        if (payMatch) {
          const noteMatch = leaf.diff?.match(/兑现期待:\s*\S+:\s*(.+)/)
          await executeEmotionDebtPayoff(bookId, payMatch[1], undefined, noteMatch?.[1])
        } else {
          const addMatch = leaf.diff?.match(/种下期待:\s*(\S+)/)
          if (addMatch) {
            await executeEmotionDebtAdd(bookId, addMatch[1])
          }
        }
      } else if (leaf.scopePath === "读者体验/爽点债务.md") {
        const payMatch = leaf.diff?.match(/兑现期待:\s*(\S+)/)
        if (payMatch) {
          await executeEmotionDebtPayoff(bookId, payMatch[1])
        } else {
          const addMatch = leaf.diff?.match(/种下期待:\s*(\S+)/)
          if (addMatch) {
            await executeEmotionDebtAdd(bookId, addMatch[1])
          }
        }
      } else if (leaf.scopePath === "写作约束/禁止项.md") {
        const banMatch = leaf.diff?.match(/禁止:\s*(\S+)/)
        if (banMatch) {
          const reasonMatch = leaf.diff?.match(/禁止:\s*\S+\s*—\s*(.+)/)
          await executeBannedPatternAdd(bookId, banMatch[1], reasonMatch?.[1])
        }
      } else if (leaf.scopePath === "写作约束/质量约束.md") {
        const ruleMatch = leaf.diff?.match(/规则:\s*(\S+)/)
        if (ruleMatch) {
          const detailMatch = leaf.diff?.match(/规则:\s*\S+\s*—\s*(.+)/)
          await executeQualityRuleUpdate(bookId, ruleMatch[1], detailMatch?.[1])
        }
      }
    }

    plan = updateNodeStatus(plan, leaf.id, "done")
  }

  plan = updateNodeStatus(plan, nodeId, "done")
  await savePendingPlan(bookId, plan)
  return { success: true, plan }
}

export async function abandonNode(
  bookId: string,
  nodeId: string,
): Promise<{ success: boolean; plan: ActionNode[] }> {
  let plan = await loadPendingPlan(bookId)
  if (!findNode(plan, nodeId)) return { success: false, plan }
  plan = removeNodeFromTree(plan, nodeId)
  await savePendingPlan(bookId, plan)
  return { success: true, plan }
}

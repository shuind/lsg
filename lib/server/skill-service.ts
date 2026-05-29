import fs from "fs/promises"
import path from "path"
import type { Skill } from "@/lib/types"
import { readBookFile, getBookFileMtime } from "@/lib/server/book-store"
import { getBookDir } from "@/lib/server/paths"

const SOURCE_FILE = "创作指南.md"
const SUMMARY_FILE = "skills/style_guide_summary.md"
const META_FILE = "skills/style_guide.skill.json"

const SUMMARY_MAX_CHARS = 500

const KEYWORD_LINES = ["文风", "语感", "禁忌", "人物", "结构", "节奏", "偏好", "塑造", "风格", "写法"]

// ─── Paths ────────────────────────────────────────────────────

function metaPath(bookId: string): string {
  return path.join(getBookDir(bookId), META_FILE)
}

// ─── Metadata I/O ─────────────────────────────────────────────

async function readMeta(bookId: string): Promise<Skill | null> {
  try {
    const raw = await fs.readFile(metaPath(bookId), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function writeMeta(skill: Skill): Promise<void> {
  await fs.mkdir(path.dirname(metaPath(skill.bookId!)), { recursive: true })
  await fs.writeFile(metaPath(skill.bookId!), JSON.stringify(skill, null, 2), "utf-8")
}

// ─── Summary Generation (rule-based, no LLM) ─────────────────

function generateSummary(content: string): string {
  if (!content.trim()) {
    return "# 创作指南摘要\n\n（创作指南为空,请在工作台编辑创作指南.md）\n"
  }

  const lines = content.split("\n")
  const picked: string[] = []
  let inKeywordSection = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (inKeywordSection && picked.length > 0 && picked[picked.length - 1] !== "") {
        picked.push("")
      }
      continue
    }

    // headings: always include h1/h2, skip h3+
    if (/^#{1,2}\s/.test(trimmed)) {
      picked.push(trimmed)
      inKeywordSection = KEYWORD_LINES.some((kw) => trimmed.includes(kw))
      continue
    }

    // lines in keyword-matching sections
    if (inKeywordSection) {
      picked.push(trimmed)
      continue
    }

    // lines containing keywords anywhere
    if (KEYWORD_LINES.some((kw) => trimmed.includes(kw))) {
      picked.push(trimmed)
    }
  }

  // if nothing picked, take first few non-empty lines
  if (picked.filter((l) => l.trim()).length === 0) {
    const fallback = lines.filter((l) => l.trim()).slice(0, 8)
    picked.push(...fallback)
  }

  // build output, truncate to SUMMARY_MAX_CHARS
  let output = "# 创作指南摘要\n\n"
  for (const line of picked) {
    const next = line === "" ? "\n" : line + "\n"
    if (output.length + next.length > SUMMARY_MAX_CHARS) break
    output += next
  }

  return output.trimEnd() + "\n"
}

// ─── Public API ───────────────────────────────────────────────

export async function getStyleGuideSkill(bookId: string): Promise<{ skill: Skill; summary: string }> {
  let skill = await readMeta(bookId)

  // check if source file is newer
  const sourceMtime = await getBookFileMtime(bookId, SOURCE_FILE)
  const dirty = !skill || sourceMtime > skill.lastSourceModified

  if (!skill) {
    skill = {
      id: `skill-style-${bookId}`,
      type: "style_guide",
      scope: "book",
      bookId,
      sourceFile: SOURCE_FILE,
      summaryFile: SUMMARY_FILE,
      summaryTokenCount: 0,
      lastSourceModified: sourceMtime,
      lastSummaryGenerated: "",
      dirty,
    }
  } else {
    skill.dirty = dirty
  }

  const summary = await readStyleGuideSummary(bookId)
  return { skill, summary }
}

export async function readStyleGuideSummary(bookId: string): Promise<string> {
  const content = await readBookFile(bookId, SUMMARY_FILE)
  return content ?? ""
}

export async function refreshStyleGuideSummary(bookId: string): Promise<{ skill: Skill; summary: string }> {
  const sourceContent = await readBookFile(bookId, SOURCE_FILE)
  const sourceMtime = await getBookFileMtime(bookId, SOURCE_FILE)

  const summary = generateSummary(sourceContent ?? "")

  // write summary file (goes through normal file write, not writeBookFile, to avoid ledger noise)
  const summaryAbs = path.join(getBookDir(bookId), SUMMARY_FILE)
  await fs.mkdir(path.dirname(summaryAbs), { recursive: true })
  await fs.writeFile(summaryAbs, summary, "utf-8")

  // estimate token count (rough: 1 token ≈ 1.5 Chinese chars)
  const charCount = summary.length
  const tokenCount = Math.ceil(charCount / 1.5)

  let skill = await readMeta(bookId)
  if (!skill) {
    skill = {
      id: `skill-style-${bookId}`,
      type: "style_guide",
      scope: "book",
      bookId,
      sourceFile: SOURCE_FILE,
      summaryFile: SUMMARY_FILE,
      summaryTokenCount: tokenCount,
      lastSourceModified: sourceMtime,
      lastSummaryGenerated: new Date().toISOString(),
      dirty: false,
    }
  } else {
    skill.summaryTokenCount = tokenCount
    skill.lastSourceModified = sourceMtime
    skill.lastSummaryGenerated = new Date().toISOString()
    skill.dirty = false
  }

  await writeMeta(skill)
  return { skill, summary }
}

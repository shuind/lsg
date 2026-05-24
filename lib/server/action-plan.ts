import fs from "fs/promises"
import path from "path"
import type { ActionNode } from "@/lib/mock-data"
import type { LlmAction } from "@/lib/server/llm"
import { writeBookFile, readBookFile } from "@/lib/server/book-store"

const DATA_DIR = path.join(process.cwd(), "data", "books")

// ─── Intent Parsing ───────────────────────────────────────────

interface ParsedIntent {
  type: "gender" | "relationship"
  character?: string
  target?: string
  charA?: string
  charB?: string
  relationship?: string
}

const GENDER_RE = /把\s*(.+?)\s*(?:改|换|变成?)\s*(男|女)\s*(?:的|生)?/
const REL_RE = /把\s*(.+?)\s*(?:和|跟|与)\s*(.+?)\s*(?:的)?关系\s*(?:改|换|变成?)\s*(敌对|盟友|同门|师徒|恋人|朋友|陌生人)/

export function parseIntent(text: string): ParsedIntent | null {
  const m1 = text.match(GENDER_RE)
  if (m1) {
    return { type: "gender", character: m1[1].trim(), target: m1[2] }
  }
  const m2 = text.match(REL_RE)
  if (m2) {
    return { type: "relationship", charA: m2[1].trim(), charB: m2[2].trim(), relationship: m2[3] }
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
  const leaves: ActionNode[] = actions.map((action) => {
    if (action.type === "gender_change") {
      return {
        id: makeId("leaf"),
        level: "leaf" as const,
        label: `${action.character} · 性别 → ${action.target}`,
        scopePath: `人物设定/${action.character}.md`,
        operation: "update" as const,
        diff: `性别: → ${action.target}`,
        status: "pending" as const,
      }
    }
    return {
      id: makeId("leaf"),
      level: "leaf" as const,
      label: `关系：${action.charA} ↔ ${action.charB} → ${action.relationship}`,
      scopePath: "关系图谱.json",
      operation: "update" as const,
      diff: `${action.charA}_${action.charB}: → ${action.relationship}`,
      status: "pending" as const,
    }
  })

  if (leaves.length === 0) return []

  return [
    {
      id: makeId("root"),
      level: "root",
      label: "修改设定",
      impact: { files: leaves.length, chapters: 0, entities: actions.length },
      status: "pending",
      children: leaves,
    },
  ]
}

// ─── Pending Plan Storage ─────────────────────────────────────

function planPath(bookId: string): string {
  return path.join(DATA_DIR, bookId, "pending-action-plan.json")
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

    if (leaf.operation === "update") {
      const isGender =
        leaf.scopePath.startsWith("人物设定/") &&
        leaf.scopePath.endsWith(".md") &&
        leaf.diff?.includes("性别")
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

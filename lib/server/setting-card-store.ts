import fs from "fs/promises"
import path from "path"
import type { SettingCard } from "@/lib/types"
import { getBookDir } from "@/lib/server/paths"

async function readMdFiles(dir: string): Promise<{ name: string; content: string }[]> {
  try {
    const entries = await fs.readdir(dir)
    const files: { name: string; content: string }[] = []
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue
      try {
        const content = await fs.readFile(path.join(dir, entry), "utf-8")
        files.push({ name: entry.replace(/\.md$/, ""), content })
      } catch {
        // skip unreadable
      }
    }
    return files
  } catch {
    return []
  }
}

function extractSummary(content: string, maxLen = 120): string {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("---"))
  const text = lines.join(" ").replace(/\*\*|__|\*|_/g, "")
  return text.slice(0, maxLen).trim() || "（暂无摘要）"
}

function extractMetaField(content: string, field: string): string | undefined {
  const re = new RegExp(`\\*\\*${field}\\*\\*[ 　]*(.+)`, "m")
  const match = content.match(re)
  return match ? match[1].trim().replace(/\s+.*$/, "") : undefined
}

function isRuleFile(name: string, content: string): boolean {
  if (/规则|体系|法则|循环|心法/.test(name)) return true
  if (/规则|体系|法则|循环|心法/.test(content.slice(0, 200))) return true
  return false
}

export async function listSettingCards(bookId: string): Promise<SettingCard[]> {
  const bookDir = getBookDir(bookId)
  const cards: SettingCard[] = []
  let idx = 0

  // character cards
  const characters = await readMdFiles(path.join(bookDir, "人物设定"))
  for (const f of characters) {
    const meta: Record<string, string> = {}
    const gender = extractMetaField(f.content, "性别")
    const identity = extractMetaField(f.content, "身份")
    const age = extractMetaField(f.content, "年龄")
    if (gender) meta["性别"] = gender
    if (identity) meta["身份"] = identity
    if (age) meta["年龄"] = age

    cards.push({
      id: `sc-${++idx}`,
      category: "character",
      name: f.name,
      summary: extractSummary(f.content),
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    })
  }

  // world/place/rule cards
  const world = await readMdFiles(path.join(bookDir, "世界观"))
  for (const f of world) {
    cards.push({
      id: `sc-${++idx}`,
      category: isRuleFile(f.name, f.content) ? "rule" : "place",
      name: f.name,
      summary: extractSummary(f.content),
    })
  }

  return cards
}

import fs from "fs/promises"
import path from "path"
import type { Book, BookTreeNode } from "@/lib/types"
import { markDirty } from "@/lib/server/dirty-index"
import { appendLedgerEntry } from "@/lib/server/ledger"

const DATA_DIR = path.join(process.cwd(), "data", "books")

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function dirExists(dir: string) {
  try {
    const stat = await fs.stat(dir)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}

export async function listBooks(): Promise<Book[]> {
  if (!(await dirExists(DATA_DIR))) return []

  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true })
  const books: Book[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const bookJsonPath = path.join(DATA_DIR, entry.name, "book.json")
    if (!(await fileExists(bookJsonPath))) continue

    try {
      const raw = await fs.readFile(bookJsonPath, "utf-8")
      const meta = JSON.parse(raw)
      books.push({
        id: meta.id ?? entry.name,
        title: meta.title ?? entry.name,
        createdAt: meta.createdAt ?? "",
        updatedAt: meta.updatedAt ?? "",
        rootPath: entry.name,
      })
    } catch {
      // skip broken book.json
    }
  }

  return books.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getBook(bookId: string): Promise<Book | null> {
  const bookDir = path.join(DATA_DIR, bookId)
  const bookJsonPath = path.join(bookDir, "book.json")
  if (!(await fileExists(bookJsonPath))) return null

  try {
    const raw = await fs.readFile(bookJsonPath, "utf-8")
    const meta = JSON.parse(raw)
    return {
      id: meta.id ?? bookId,
      title: meta.title ?? bookId,
      createdAt: meta.createdAt ?? "",
      updatedAt: meta.updatedAt ?? "",
      rootPath: bookId,
    }
  } catch {
    return null
  }
}

export async function createBook(title: string): Promise<Book> {
  const now = new Date().toISOString()
  const id = `${slugify(title)}-${Date.now().toString(36)}`
  const bookDir = path.join(DATA_DIR, id)

  await ensureDir(path.join(bookDir, "人物设定"))
  await ensureDir(path.join(bookDir, "世界观"))
  await ensureDir(path.join(bookDir, "章节大纲"))
  await ensureDir(path.join(bookDir, "章节正文"))
  await ensureDir(path.join(bookDir, "skills"))

  const bookMeta = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
  }
  await fs.writeFile(path.join(bookDir, "book.json"), JSON.stringify(bookMeta, null, 2), "utf-8")
  await fs.writeFile(path.join(bookDir, "创作指南.md"), `# 创作指南\n\n（请在此写下你的写作偏好与风格要求）\n`, "utf-8")
  await fs.writeFile(path.join(bookDir, "关系图谱.json"), "{}\n", "utf-8")
  await fs.writeFile(path.join(bookDir, "ledger.jsonl"), "", "utf-8")
  await fs.writeFile(path.join(bookDir, "messages.jsonl"), "", "utf-8")

  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    rootPath: id,
  }
}

export async function getBookTree(bookId: string): Promise<BookTreeNode[]> {
  const bookDir = path.join(DATA_DIR, bookId)
  if (!(await dirExists(bookDir))) return []

  async function walk(dir: string, relativePath: string): Promise<BookTreeNode[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const nodes: BookTreeNode[] = []

    for (const entry of entries) {
      if (entry.name === "book.json") continue
      const absPath = path.join(dir, entry.name)
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        const children = await walk(absPath, relPath)
        nodes.push({
          id: relPath,
          name: entry.name,
          path: relPath,
          type: "directory",
          children,
        })
      } else {
        const stat = await fs.stat(absPath)
        nodes.push({
          id: relPath,
          name: entry.name,
          path: relPath,
          type: "file",
          updatedAt: stat.mtime.toISOString(),
        })
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return walk(bookDir, "")
}

export async function readBookFile(bookId: string, filePath: string): Promise<string | null> {
  const absPath = path.join(DATA_DIR, bookId, filePath)
  // security: prevent path traversal
  const resolved = path.resolve(absPath)
  const bookDir = path.resolve(DATA_DIR, bookId)
  if (!resolved.startsWith(bookDir)) return null

  try {
    return await fs.readFile(resolved, "utf-8")
  } catch {
    return null
  }
}

export async function getBookFileMtime(bookId: string, filePath: string): Promise<string> {
  const absPath = path.join(DATA_DIR, bookId, filePath)
  const resolved = path.resolve(absPath)
  const bookDir = path.resolve(DATA_DIR, bookId)
  if (!resolved.startsWith(bookDir)) return new Date().toISOString()

  try {
    const stat = await fs.stat(resolved)
    return stat.mtime.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

export async function writeBookFile(bookId: string, filePath: string, content: string): Promise<boolean> {
  const absPath = path.join(DATA_DIR, bookId, filePath)
  const resolved = path.resolve(absPath)
  const bookDir = path.resolve(DATA_DIR, bookId)
  if (!resolved.startsWith(bookDir)) return false

  // read before snapshot (skip for ledger itself to avoid noise)
  const isLedgerFile = filePath === "ledger.jsonl"
  let beforeSnapshot: string | undefined
  if (!isLedgerFile) {
    try {
      beforeSnapshot = await fs.readFile(resolved, "utf-8")
    } catch {
      // file may not exist yet
    }
  }

  await ensureDir(path.dirname(resolved))
  await fs.writeFile(resolved, content, "utf-8")

  // mark dirty
  await markDirty(bookId, filePath).catch(() => {})

  // update book updatedAt
  try {
    const bookJsonPath = path.join(bookDir, "book.json")
    const raw = await fs.readFile(bookJsonPath, "utf-8")
    const meta = JSON.parse(raw)
    meta.updatedAt = new Date().toISOString()
    await fs.writeFile(bookJsonPath, JSON.stringify(meta, null, 2), "utf-8")
  } catch {
    // ignore
  }

  // append ledger entry (skip for ledger.jsonl to avoid recursion)
  if (!isLedgerFile) {
    await appendLedgerEntry(bookId, {
      actor: "user",
      action: "write_file",
      targetPath: filePath,
      beforeSnapshot,
      afterSnapshot: content,
      summary: `手动保存 ${filePath}`,
    }).catch(() => {})
  }

  return true
}

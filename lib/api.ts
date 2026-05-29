// 后端接口层 - 优先调用真实 API,失败时回退 mock
import {
  type Book,
  type Chapter,
  type Message,
  type ActionNode,
  type SettingCard,
  type WorkbenchGroup,
  type WorkbenchFile,
  mockBooks,
  mockChapters,
  mockMessages,
  mockActionTree,
  mockSettingCards,
  mockWorkbenchTree,
  mockFileContent,
} from "./mock-data"
import type { LedgerEntry, RetrievedContext, Skill } from "./types"

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms))

function relativeTime(iso: string): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "昨日"
  return `${days}d`
}

// === 书籍 ===
export async function listBooks(): Promise<Book[]> {
  try {
    const res = await fetch("/api/books", { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) throw new Error("empty")
    return data.map((b: { id: string; title: string; updatedAt: string }) => ({
      id: b.id,
      title: b.title,
      updatedAt: relativeTime(b.updatedAt),
    }))
  } catch {
    await delay()
    return mockBooks
  }
}

export async function createBook(title?: string): Promise<Book> {
  try {
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title ?? "未命名书籍" }),
    })
    if (!res.ok) throw new Error("api failed")
    const b = await res.json()
    return { id: b.id, title: b.title, updatedAt: "刚刚" }
  } catch {
    await delay()
    return { id: `b${Date.now()}`, title: title ?? "未命名", updatedAt: "刚刚" }
  }
}

export async function renameBook(bookId: string, title: string): Promise<Book | null> {
  try {
    const res = await fetch(`/api/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error("api failed")
    const b = await res.json()
    return { id: b.id, title: b.title, updatedAt: relativeTime(b.updatedAt) }
  } catch {
    return null
  }
}

// === 初始化(合并请求) ===
export async function initBook(bookId: string): Promise<{
  chapters: Chapter[]
  messages: Message[]
  plan: ActionNode[]
  cards: SettingCard[]
}> {
  try {
    const res = await fetch(`/api/books/${bookId}/init`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return {
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
      plan: Array.isArray(data.plan) ? data.plan : [],
      cards: Array.isArray(data.cards) ? data.cards : [],
    }
  } catch {
    await delay()
    return {
      chapters: mockChapters.filter((c) => c.bookId === bookId),
      messages: mockMessages,
      plan: mockActionTree,
      cards: mockSettingCards,
    }
  }
}

// === 章节 ===
export async function listChapters(bookId: string): Promise<Chapter[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return mockChapters.filter((c) => c.bookId === bookId)
  }
}

export async function createChapter(bookId: string, title?: string): Promise<Chapter> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    const idx =
      mockChapters.filter((c) => c.bookId === bookId).reduce((m, c) => Math.max(m, c.index), 0) + 1
    return {
      id: `c${Date.now()}`,
      bookId,
      title: title ?? `第${idx}章 · 未命名`,
      index: idx,
      wordCount: 0,
      status: "draft",
      path: `章节正文/${title ?? `第${idx}章 · 未命名`}.md`,
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function getChapter(bookId: string, chapterId: string): Promise<{ id: string; title: string; content: string; updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return {
      id: chapterId,
      title: mockChapters.find((c) => c.id === chapterId)?.title ?? "",
      content: "",
      updatedAt: new Date().toISOString(),
    }
  }
}

export async function saveChapter(bookId: string, chapterId: string, content: string): Promise<{ updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    console.log("[mock] saveChapter", chapterId, content.length)
    return { updatedAt: new Date().toISOString() }
  }
}

// === 对话 ===
export async function listMessages(bookId: string): Promise<Message[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/messages`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return mockMessages
  }
}

export async function sendMessage(
  bookId: string,
  content: string,
): Promise<{ message: Message; plan: ActionNode[] }> {
  try {
    const res = await fetch(`/api/books/${bookId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return { message: data.message, plan: data.plan ?? [] }
  } catch {
    await delay(400)
    return {
      message: {
        id: `m${Date.now()}`,
        role: "assistant",
        content: "已收到,正在意图分析...",
        createdAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      },
      plan: mockActionTree,
    }
  }
}

// === ActionPlan ===
export async function getActionPlan(bookId: string): Promise<ActionNode[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/action-plan`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return mockActionTree
  }
}

export async function confirmAction(bookId: string, nodeId: string): Promise<ActionNode[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/action-plan/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return data.plan ?? []
  } catch {
    await delay()
    return []
  }
}

export async function abandonAction(bookId: string, nodeId: string): Promise<ActionNode[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/action-plan/abandon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return data.plan ?? []
  } catch {
    await delay()
    return []
  }
}

// === 设定卡片 ===
export async function listSettingCards(bookId: string): Promise<SettingCard[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/setting-cards`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return mockSettingCards
  }
}

// === 试写沙盒 ===
export async function generateDraft(bookId: string, chapterId: string, prompt?: string): Promise<string> {
  try {
    const res = await fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(chapterId)}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return data.draft ?? "（试写）生成失败，请重试。"
  } catch {
    await delay(600)
    return "（试写）夜色压得人心头发沉。林晓提着剑,沿着回廊往内堂走去,廊下的灯一盏一盏地灭。"
  }
}

// === 工作台 ===
export async function listWorkbenchTree(bookId: string): Promise<WorkbenchGroup[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/tree`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const nodes: { id: string; name: string; path: string; type: string; children?: typeof nodes }[] = await res.json()
    if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("empty")

    const groups: WorkbenchGroup[] = []
    for (const node of nodes) {
      if (node.type === "directory" && node.children) {
        const files: WorkbenchFile[] = node.children
          .filter((c) => c.type === "file")
          .map((c) => ({ id: c.path, name: c.name, path: c.path }))
        if (files.length > 0) {
          groups.push({ id: node.path, label: node.name, files })
        }
      }
    }
    return groups
  } catch {
    await delay()
    return mockWorkbenchTree
  }
}

export async function readWorkbenchFile(bookId: string, path: string): Promise<{ content: string; updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/file?path=${encodeURIComponent(path)}`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (typeof data.content === "string") return { content: data.content, updatedAt: data.updatedAt ?? "" }
    throw new Error("no content")
  } catch {
    await delay()
    return { content: mockFileContent[path] ?? `# ${path}\n\n（暂无内容）`, updatedAt: "" }
  }
}

export async function writeWorkbenchFile(bookId: string, path: string, content: string): Promise<{ updatedAt: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    return { updatedAt: data.updatedAt ?? new Date().toISOString() }
  } catch {
    await delay()
    console.log("[mock] writeWorkbenchFile", path, content.length)
    return { updatedAt: new Date().toISOString() }
  }
}

// === Ledger ===
export async function listLedgerEntries(bookId: string): Promise<LedgerEntry[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/ledger`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return []
  }
}

// === Retrieval ===
export async function retrieveContext(bookId: string, query: string): Promise<RetrievedContext[]> {
  try {
    const res = await fetch(`/api/books/${bookId}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error("api failed")
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("invalid")
    return data
  } catch {
    await delay()
    return []
  }
}

// === Skills ===
export async function getStyleGuideSkill(bookId: string): Promise<{ skill: Skill; summary: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills/style-guide`, { cache: "no-store" })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return {
      skill: {
        id: `skill-style-${bookId}`,
        type: "style_guide",
        scope: "book",
        bookId,
        sourceFile: "创作指南.md",
        summaryFile: "skills/style_guide_summary.md",
        summaryTokenCount: 0,
        lastSourceModified: "",
        lastSummaryGenerated: "",
        dirty: false,
      },
      summary: "",
    }
  }
}

export async function refreshStyleGuideSummary(bookId: string): Promise<{ skill: Skill; summary: string }> {
  try {
    const res = await fetch(`/api/books/${bookId}/skills/style-guide/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    if (!res.ok) throw new Error("api failed")
    return await res.json()
  } catch {
    await delay()
    return {
      skill: {
        id: `skill-style-${bookId}`,
        type: "style_guide",
        scope: "book",
        bookId,
        sourceFile: "创作指南.md",
        summaryFile: "skills/style_guide_summary.md",
        summaryTokenCount: 0,
        lastSourceModified: "",
        lastSummaryGenerated: "",
        dirty: false,
      },
      summary: "",
    }
  }
}

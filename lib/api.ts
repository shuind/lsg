// 后端接口预留层 - 替换为真实 fetch 即可
import {
  type Book,
  type Chapter,
  type Message,
  type ActionNode,
  type SettingCard,
  type WorkbenchGroup,
  mockBooks,
  mockChapters,
  mockMessages,
  mockActionTree,
  mockSettingCards,
  mockWorkbenchTree,
  mockFileContent,
} from "./mock-data"

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// === 书籍 ===
export async function listBooks(): Promise<Book[]> {
  await delay()
  return mockBooks
}

export async function createBook(title?: string): Promise<Book> {
  await delay()
  return { id: `b${Date.now()}`, title: title ?? "未命名", updatedAt: "刚刚" }
}

// === 章节 ===
export async function listChapters(bookId: string): Promise<Chapter[]> {
  await delay()
  return mockChapters.filter((c) => c.bookId === bookId)
}

export async function createChapter(bookId: string, title?: string): Promise<Chapter> {
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
  }
}

export async function getChapter(chapterId: string): Promise<{ id: string; title: string; content: string }> {
  await delay()
  return {
    id: chapterId,
    title: mockChapters.find((c) => c.id === chapterId)?.title ?? "",
    content:
      "山风从北面吹来,卷起石阶上薄薄的积雪。林晓站在归墟的边缘,望着脚下深不见底的雾。\n\n师兄陈磊的脚步声在身后停下。两人之间隔着的,不只是这一夜的雪。\n\n「你真的要走？」陈磊问。\n\n林晓没有回头。",
  }
}

export async function saveChapter(chapterId: string, content: string): Promise<void> {
  await delay()
  console.log("[v0] saveChapter", chapterId, content.length)
}

// === 对话 ===
export async function listMessages(bookId: string): Promise<Message[]> {
  await delay()
  return mockMessages
}

export async function sendMessage(
  bookId: string,
  content: string,
): Promise<{ message: Message; plan: ActionNode[] }> {
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

// === ActionPlan ===
export async function getActionPlan(bookId: string): Promise<ActionNode[]> {
  await delay()
  return mockActionTree
}

export async function confirmAction(actionId: string): Promise<void> {
  await delay()
  console.log("[v0] confirmAction", actionId)
}

export async function abandonAction(actionId: string): Promise<void> {
  await delay()
  console.log("[v0] abandonAction", actionId)
}

// === 设定卡片 ===
export async function listSettingCards(bookId: string): Promise<SettingCard[]> {
  await delay()
  return mockSettingCards
}

// === 试写沙盒 ===
export async function generateDraft(prompt: string): Promise<string> {
  await delay(600)
  return "（试写）夜色压得人心头发沉。林晓提着剑,沿着回廊往内堂走去,廊下的灯一盏一盏地灭。"
}

// === 工作台 ===
export async function listWorkbenchTree(bookId: string): Promise<WorkbenchGroup[]> {
  await delay()
  return mockWorkbenchTree
}

export async function readWorkbenchFile(bookId: string, path: string): Promise<string> {
  await delay()
  return mockFileContent[path] ?? `# ${path}\n\n（暂无内容）`
}

export async function writeWorkbenchFile(bookId: string, path: string, content: string): Promise<void> {
  await delay()
  console.log("[v0] writeWorkbenchFile", path, content.length)
}

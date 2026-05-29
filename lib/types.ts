export interface Book {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  rootPath: string
}

export interface BookTreeNode {
  id: string
  name: string
  path: string
  type: "file" | "directory"
  children?: BookTreeNode[]
  updatedAt?: string
}

export interface BookFile {
  bookId: string
  path: string
  content: string
  updatedAt: string
}

export interface LedgerEntry {
  id: string
  bookId: string
  timestamp: string
  actor: "user" | "agent"
  action: string
  targetPath: string
  beforeSnapshot?: string
  afterSnapshot?: string
  summary: string
}

export interface RetrievedContext {
  id: string
  bookId: string
  path: string
  reason: "dirty" | "keyword" | "recent"
  score: number
  updatedAt: string
  excerpt: string
}

export interface Skill {
  id: string
  type: "style_guide" | "plot_pattern" | "char_template" | "world_rule"
  scope: "global" | "book"
  bookId?: string
  sourceFile: string
  summaryFile: string
  summaryTokenCount: number
  lastSourceModified: string
  lastSummaryGenerated: string
  dirty: boolean
}

export interface Chapter {
  id: string
  bookId: string
  title: string
  index: number
  wordCount: number
  status: "draft" | "writing" | "done"
  path: string
  updatedAt: string
}

export interface ChapterContent {
  id: string
  bookId: string
  title: string
  content: string
  path: string
  updatedAt: string
}

export interface IntentBrief {
  understood: string[]
  contextPaths?: string[]
  missing?: string[]
}

export interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt: string
  thought?: string
  thoughtSeconds?: number
  references?: { type: string; name: string; path: string }[]
  brief?: IntentBrief
}

export interface SettingCard {
  id: string
  category: "character" | "place" | "event" | "rule"
  name: string
  summary: string
  meta?: Record<string, string>
}

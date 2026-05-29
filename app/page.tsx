"use client"

import { useEffect, useState } from "react"
import { LeftSidebar } from "@/components/lg/left-sidebar"
import { ChatPanel } from "@/components/lg/chat-panel"
import { RightSidebar } from "@/components/lg/right-sidebar"
import { WritingDesk } from "@/components/lg/writing-desk"
import { Workbench } from "@/components/lg/workbench"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  listBooks,
  initBook,
  listChapters,
  listMessages,
  getActionPlan,
  listSettingCards,
  sendMessage,
  confirmAction,
  abandonAction,
  createBook,
  createChapter,
  renameBook,
} from "@/lib/api"
import type { Book, Chapter, Message, ActionNode, SettingCard } from "@/lib/mock-data"

type Mode = "chat" | "writing"

export default function Page() {
  const [books, setBooks] = useState<Book[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [actions, setActions] = useState<ActionNode[]>([])
  const [cards, setCards] = useState<SettingCard[]>([])
  const [activeBookId, setActiveBookId] = useState<string>("")
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("chat")
  const [collapsed, setCollapsed] = useState(false)
  const [workbenchBookId, setWorkbenchBookId] = useState<string | null>(null)

  useEffect(() => {
    listBooks().then((bs) => {
      setBooks(bs)
      setActiveBookId((prev) => {
        if (prev && bs.some((b) => b.id === prev)) return prev
        return bs[0]?.id ?? ""
      })
    })
  }, [])

  useEffect(() => {
    if (!activeBookId) return
    initBook(activeBookId).then(({ chapters, messages, plan, cards }) => {
      setChapters(chapters)
      setMessages(messages)
      setActions(plan)
      setCards(cards)
    })
  }, [activeBookId])

  async function handleSend(text: string) {
    const userMsg: Message = {
      id: `u${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    }
    setMessages((m) => [...m, userMsg])
    const { message, plan } = await sendMessage(activeBookId, text)
    setMessages((m) => [...m, message])
    if (plan.length > 0) setActions(plan)
  }

  async function handleNewBook() {
    const title = window.prompt("请输入书名")
    if (!title?.trim()) return
    try {
      const b = await createBook(title.trim())
      const bs = await listBooks()
      setBooks(bs)
      setActiveBookId(b.id)
      setActiveChapterId(null)
      setMode("chat")
      setWorkbenchBookId(null)
    } catch (err) {
      console.error("[handleNewBook] 创建书籍失败:", err)
      alert("创建书籍失败，请重试")
    }
  }

  async function handleRenameBook(bookId: string, newTitle: string) {
    const result = await renameBook(bookId, newTitle)
    if (result) {
      setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, title: result.title } : b)))
    }
  }

  async function handleNewChapter() {
    const c = await createChapter(activeBookId)
    // refresh full list from server to get accurate index/mtime
    const fresh = await listChapters(activeBookId)
    setChapters(fresh)
    setActiveChapterId(c.id)
    setMode("writing")
  }

  async function handleConfirmSubtree(id: string) {
    const plan = await confirmAction(activeBookId, id)
    if (plan.length > 0) {
      setActions(plan)
    } else {
      setActions((tree) => removeNode(tree, id))
    }
  }

  async function handleAbandon(id: string) {
    const plan = await abandonAction(activeBookId, id)
    if (plan.length > 0) {
      setActions(plan)
    } else {
      setActions((tree) => removeNode(tree, id))
    }
  }

  function handleEditNode(id: string, field: "label" | "diff", value: string) {
    setActions((tree) => updateNodeField(tree, id, field, value))
  }

  const activeBook = books.find((b) => b.id === activeBookId)
  const workbenchBook = books.find((b) => b.id === workbenchBookId)

  const gridCols = collapsed ? "grid-cols-[64px_minmax(0,1fr)_360px]" : "grid-cols-[260px_minmax(0,1fr)_360px]"

  return (
    <main className="ambient-window relative h-screen w-screen overflow-hidden">
      {/* 全屏柔光层 — 静态，不做动画避免持续 GPU 重绘 */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[var(--light-warm)] opacity-60 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-[380px] w-[380px] rounded-full bg-[var(--light-cool)] opacity-40 blur-3xl dark:opacity-25" />
      </div>

      <div className={`relative z-10 grid h-full min-h-0 ${gridCols} transition-[grid-template-columns] duration-300`}>
        {/* 左 */}
        <div className="relative min-h-0 border-r border-border/60">
          {/* 外置折叠手柄 - 常驻在左栏右边缘 */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="group absolute -right-3 top-1/2 z-20 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-md bg-card/0 text-muted-foreground/40 transition hover:bg-card/80 hover:text-foreground hover:shadow-sm"
            aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
            title={collapsed ? "展开侧栏" : "折叠侧栏"}
          >
            <span className="absolute left-2 h-8 w-px bg-border/60 transition group-hover:bg-border" />
            {collapsed ? <ChevronRight className="relative h-3.5 w-3.5" /> : <ChevronLeft className="relative h-3.5 w-3.5" />}
          </button>
          <LeftSidebar
            books={books}
            chapters={chapters}
            activeBookId={activeBookId}
            activeChapterId={activeChapterId}
            mode={mode}
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((c) => !c)}
            onSelectBook={(id) => {
              setActiveBookId(id)
              setMode("chat")
              setActiveChapterId(null)
            }}
            onSelectChapter={(id) => {
              setActiveChapterId(id)
              setMode("writing")
            }}
            onBackToChat={() => {
              setMode("chat")
              setActiveChapterId(null)
            }}
            onNewBook={handleNewBook}
            onNewChapter={handleNewChapter}
            onOpenWorkbench={(id) => setWorkbenchBookId(id)}
            onRenameBook={handleRenameBook}
          />
        </div>

        {/* 中 */}
        <div className="relative min-h-0 min-w-0">
          {mode === "chat" ? (
            <ChatPanel bookTitle={activeBook?.title ?? ""} messages={messages} onSend={handleSend} />
          ) : activeChapterId ? (
            <WritingDesk bookId={activeBookId} chapterId={activeChapterId} />
          ) : null}
        </div>

        {/* 右 */}
        <div className="min-h-0 border-l border-border/60">
          <RightSidebar
            actions={actions}
            cards={cards}
            onConfirm={handleConfirmSubtree}
            onAbandon={handleAbandon}
            onEdit={handleEditNode}
            onCite={(c) => console.log("[v0] cite", c.name)}
          />
        </div>
      </div>

      {/* 工作台:覆盖整屏 */}
      {workbenchBook && <Workbench book={workbenchBook} onClose={() => setWorkbenchBookId(null)} />}
    </main>
  )
}

function removeNode(tree: ActionNode[], id: string): ActionNode[] {
  return tree
    .filter((n) => n.id !== id)
    .map((n) => (n.children ? { ...n, children: removeNode(n.children, id) } : n))
}

function updateNodeField(tree: ActionNode[], id: string, field: "label" | "diff", value: string): ActionNode[] {
  return tree.map((n) => {
    if (n.id === id) return { ...n, [field]: value }
    if (n.children) return { ...n, children: updateNodeField(n.children, id, field, value) }
    return n
  })
}

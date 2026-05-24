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
  listChapters,
  listMessages,
  getActionPlan,
  listSettingCards,
  sendMessage,
  confirmAction,
  abandonAction,
  createBook,
  createChapter,
} from "@/lib/api"
import type { Book, Chapter, Message, ActionNode, SettingCard } from "@/lib/mock-data"

type Mode = "chat" | "writing"

export default function Page() {
  const [books, setBooks] = useState<Book[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [actions, setActions] = useState<ActionNode[]>([])
  const [cards, setCards] = useState<SettingCard[]>([])
  const [activeBookId, setActiveBookId] = useState<string>("b1")
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("chat")
  const [collapsed, setCollapsed] = useState(false)
  const [workbenchBookId, setWorkbenchBookId] = useState<string | null>(null)

  useEffect(() => {
    listBooks().then(setBooks)
  }, [])

  useEffect(() => {
    if (!activeBookId) return
    listChapters(activeBookId).then(setChapters)
    listMessages(activeBookId).then(setMessages)
    getActionPlan(activeBookId).then(setActions)
    listSettingCards(activeBookId).then(setCards)
  }, [activeBookId])

  async function handleSend(text: string) {
    const userMsg: Message = {
      id: `u${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    }
    setMessages((m) => [...m, userMsg])
    const { message } = await sendMessage(activeBookId, text)
    setMessages((m) => [...m, message])
  }

  async function handleNewBook() {
    const b = await createBook()
    setBooks((bs) => [b, ...bs])
    setActiveBookId(b.id)
    setMode("chat")
  }

  async function handleNewChapter() {
    const c = await createChapter(activeBookId)
    setChapters((cs) => [...cs, c])
    setActiveChapterId(c.id)
    setMode("writing")
  }

  async function handleConfirmSubtree(id: string) {
    await confirmAction(id)
    setActions((tree) => removeNode(tree, id))
  }

  async function handleAbandon(id: string) {
    await abandonAction(id)
    setActions((tree) => removeNode(tree, id))
  }

  const activeBook = books.find((b) => b.id === activeBookId)
  const workbenchBook = books.find((b) => b.id === workbenchBookId)

  const gridCols = collapsed ? "grid-cols-[64px_minmax(0,1fr)_360px]" : "grid-cols-[260px_minmax(0,1fr)_360px]"

  return (
    <main className="ambient-window relative h-screen w-screen overflow-hidden">
      {/* 全屏柔光层 */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[var(--light-warm)] opacity-60 blur-3xl animate-drift" />
        <div className="absolute -bottom-32 -left-24 h-[380px] w-[380px] rounded-full bg-[var(--light-cool)] opacity-40 blur-3xl animate-drift dark:opacity-25" />
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
          />
        </div>

        {/* 中 */}
        <div className="relative min-h-0 min-w-0">
          {mode === "chat" ? (
            <ChatPanel bookTitle={activeBook?.title ?? ""} messages={messages} onSend={handleSend} />
          ) : activeChapterId ? (
            <WritingDesk chapterId={activeChapterId} />
          ) : null}
        </div>

        {/* 右 */}
        <div className="min-h-0 border-l border-border/60">
          <RightSidebar
            actions={actions}
            cards={cards}
            onConfirm={handleConfirmSubtree}
            onAbandon={handleAbandon}
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

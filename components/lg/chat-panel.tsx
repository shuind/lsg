"use client"

import { useState, useRef, useEffect } from "react"
import { ArrowUp, Plus, AtSign, Sparkles, Loader2, Lightbulb, FolderOpen, HelpCircle } from "lucide-react"
import type { Message } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

interface ChatPanelProps {
  bookTitle: string
  messages: Message[]
  onSend: (text: string) => void
}

export function ChatPanel({ bookTitle, messages, onSend }: ChatPanelProps) {
  const [input, setInput] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  function handleSend() {
    if (!input.trim()) return
    setAnalyzing(true)
    onSend(input.trim())
    setInput("")
    setTimeout(() => setAnalyzing(false), 1600)
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col">      {/* 顶栏 */}
      <header className="flex items-center justify-between px-8 pt-6 pb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">当前书籍</div>
          <h1 className="font-serif text-xl tracking-wide text-foreground">{bookTitle}</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-card/60 px-3 py-1.5 text-[11px] text-muted-foreground ring-1 ring-border/60 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-chart-2 animate-pulse-dot" />
          意图引擎在线
        </div>
      </header>

      {/* 消息流 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-8 pb-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-8">
          {messages.length === 0 && <EmptyState />}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {analyzing && <IntentAnalyzer />}
        </div>
      </div>

      {/* 输入区 */}
      <div className="px-8 pb-6 pt-2">
        <div className="mx-auto max-w-2xl">
          <div className="paper rounded-2xl border border-border/70 bg-card/80 backdrop-blur transition focus-within:ring-1 focus-within:ring-ring/50 dark:bg-card/40 dark:border-border/50 dark:backdrop-blur-md">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              rows={2}
              placeholder="描述你想做的修改、新建,或粘贴一段设定…"
              className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 font-serif text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <div className="flex items-center gap-1">
                <ToolBtn icon={<Plus className="h-3.5 w-3.5" />} label="附件" />
                <ToolBtn icon={<AtSign className="h-3.5 w-3.5" />} label="引用设定" />
                <span className="ml-2 text-[11px] text-muted-foreground/70">归墟之外 · 第二章</span>
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition",
                  input.trim()
                    ? "bg-foreground text-background hover:scale-105"
                    : "bg-muted text-muted-foreground/50",
                )}
                aria-label="发送"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="mt-2 px-1 text-center text-[10px] text-muted-foreground/60">
            按 Enter 发送 · Shift+Enter 换行 · 1s 静默后自动生成 ActionPlan
          </p>
        </div>
      </div>
    </section>
  )
}

function ToolBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      title={label}
    >
      {icon}
    </button>
  )
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="paper max-w-[80%] rounded-2xl rounded-br-md bg-secondary/80 px-4 py-2.5 text-[14px] leading-relaxed text-secondary-foreground ring-1 ring-border/60">
          {message.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {message.thought && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 opacity-60" />
          <span className="italic">Thought for {message.thoughtSeconds}s · {message.thought}</span>
        </div>
      )}
      <div className="font-serif text-[15px] leading-[1.75] text-foreground">{message.content}</div>

      {message.brief && <IntentBriefCard brief={message.brief} />}

      {message.references && message.references.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {message.references.map((r) => (
            <span
              key={r.path}
              className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-border/50"
            >
              {r.path}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function IntentBriefCard({ brief }: { brief: NonNullable<Message["brief"]> }) {
  return (
    <div className="paper mt-1 space-y-3 rounded-xl border border-border/60 bg-card/70 px-4 py-3">
      <BriefRow icon={<Lightbulb className="h-3.5 w-3.5" />} label="我理解的任务">
        <ul className="space-y-0.5 text-[12.5px] leading-relaxed text-foreground/90">
          {brief.understood.map((u, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-muted-foreground/60">·</span>
              <span>{u}</span>
            </li>
          ))}
        </ul>
      </BriefRow>

      {brief.contextPaths && brief.contextPaths.length > 0 && (
        <>
          <Divider />
          <BriefRow icon={<FolderOpen className="h-3.5 w-3.5" />} label="使用的上下文">
            <div className="flex flex-wrap gap-1">
              {brief.contextPaths.map((p) => (
                <span
                  key={p}
                  className="rounded-md bg-muted/50 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground ring-1 ring-border/40"
                >
                  {p}
                </span>
              ))}
            </div>
          </BriefRow>
        </>
      )}

      {brief.missing && brief.missing.length > 0 && (
        <>
          <Divider />
          <BriefRow icon={<HelpCircle className="h-3.5 w-3.5" />} label="缺失信息">
            <ul className="space-y-0.5 text-[12.5px] leading-relaxed text-foreground/90">
              {brief.missing.map((m, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-muted-foreground/60">·</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </BriefRow>
        </>
      )}
    </div>
  )
}

function BriefRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="flex w-[88px] shrink-0 items-center gap-1.5 pt-0.5 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
        <span className="opacity-70">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-border/70 to-transparent" />
}

function IntentAnalyzer() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border/50">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="text-[12px] text-foreground">正在意图理解循环…</div>
        <div className="flex gap-1.5 text-[10px] text-muted-foreground">
          <Step done>Observe</Step>
          <Step done>Hypothesize</Step>
          <Step active>Retrieve</Step>
          <Step>Ground</Step>
          <Step>Plan</Step>
        </div>
      </div>
    </div>
  )
}

function Step({
  children,
  done,
  active,
}: {
  children: React.ReactNode
  done?: boolean
  active?: boolean
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono",
        done && "bg-chart-2/20 text-chart-2",
        active && "bg-accent/30 text-accent-foreground animate-pulse-dot",
        !done && !active && "text-muted-foreground/50",
      )}
    >
      {children}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-accent/30 to-transparent ring-1 ring-border/50 animate-breathe">
        <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-accent-foreground/70" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-serif text-2xl tracking-wide text-foreground">系统 Agent 已就绪</h2>
        <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
          描述你想对世界观、人物、情节做��改动,我会进行意图分析、列出 ActionPlan,等你确认后再执行。
        </p>
      </div>
    </div>
  )
}

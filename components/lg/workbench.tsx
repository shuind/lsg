"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Folder,
  Save,
  Network,
  BookText,
  Sparkles,
  PenLine,
  Search,
  Circle,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Book, WorkbenchGroup, WorkbenchFile } from "@/lib/mock-data"
import type { LedgerEntry, Skill } from "@/lib/types"
import { listWorkbenchTree, readWorkbenchFile, writeWorkbenchFile, listLedgerEntries, getStyleGuideSkill, refreshStyleGuideSummary } from "@/lib/api"

interface WorkbenchProps {
  book: Book
  onClose: () => void
}

type Tab = "editor" | "graph" | "ledger" | "skill"

export function Workbench({ book, onClose }: WorkbenchProps) {
  const [tab, setTab] = useState<Tab>("editor")
  const [tree, setTree] = useState<WorkbenchGroup[]>([])
  const [activePath, setActivePath] = useState<string>("")
  const [content, setContent] = useState<string>("")
  const [savedContent, setSavedContent] = useState<string>("")
  const [savedAt, setSavedAt] = useState<string>("")
  const [query, setQuery] = useState("")
  const [ledgerKey, setLedgerKey] = useState(0)

  // helper: find first file in tree
  function findFirstFile(groups: WorkbenchGroup[]): string {
    for (const g of groups) {
      if (g.files.length > 0) return g.files[0].path
    }
    return ""
  }

  // load tree, then auto-select first file if no activePath
  useEffect(() => {
    listWorkbenchTree(book.id).then((t) => {
      setTree(t)
      setActivePath((prev) => {
        if (prev) return prev
        return findFirstFile(t)
      })
    })
  }, [book.id])

  // load file content when activePath changes
  useEffect(() => {
    if (!activePath) return
    readWorkbenchFile(book.id, activePath).then(({ content: c, updatedAt }) => {
      setContent(c)
      setSavedContent(c)
      if (updatedAt) {
        setSavedAt(
          new Date(updatedAt).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
        )
      }
    })
  }, [book.id, activePath])

  const dirty = content !== savedContent
  const activeFile = useMemo(() => {
    for (const g of tree) for (const f of g.files) if (f.path === activePath) return f
    return null
  }, [tree, activePath])

  async function handleSave() {
    const result = await writeWorkbenchFile(book.id, activePath, content)
    setSavedContent(content)
    setSavedAt(
      new Date(result.updatedAt).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    )
    // refresh tree so file timestamps update
    listWorkbenchTree(book.id).then(setTree)
    // refresh ledger
    setLedgerKey((k) => k + 1)
  }

  const filteredTree = useMemo(() => {
    if (!query.trim()) return tree
    const q = query.toLowerCase()
    return tree
      .map((g) => ({ ...g, files: g.files.filter((f) => f.name.toLowerCase().includes(q)) }))
      .filter((g) => g.files.length > 0)
  }, [tree, query])

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-2xl animate-in fade-in duration-200">
      {/* 全屏柔光层(与主层一致,使工作台保持窗边氛围) */}
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-[var(--light-warm)] opacity-50 blur-3xl animate-drift" />
        <div className="absolute -bottom-40 -left-32 h-[420px] w-[420px] rounded-full bg-[var(--light-cool)] opacity-30 blur-3xl animate-drift dark:opacity-20" />
      </div>

      {/* 顶栏 */}
      <header className="relative z-10 flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/40 px-4 py-2.5 backdrop-blur paper-soft">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          title="返回对话"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </button>
        <span className="h-4 w-px bg-border/80" />
        <div className="flex items-center gap-1.5">
          <BookText className="h-3.5 w-3.5 text-muted-foreground/80" />
          <span className="font-serif text-[14px] tracking-wide text-foreground">{book.title}</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">/ Workbench</span>
        </div>

        {/* Tab 居中 */}
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 p-0.5 backdrop-blur">
          <TopTab active={tab === "editor"} onClick={() => setTab("editor")} icon={<PenLine className="h-3 w-3" />}>
            编辑器
          </TopTab>
          <TopTab active={tab === "graph"} onClick={() => setTab("graph")} icon={<Network className="h-3 w-3" />}>
            关系图谱
          </TopTab>
          <TopTab active={tab === "ledger"} onClick={() => setTab("ledger")} icon={<FileText className="h-3 w-3" />}>
            Ledger
          </TopTab>
          <TopTab active={tab === "skill"} onClick={() => setTab("skill")} icon={<Sparkles className="h-3 w-3" />}>
            Skill
          </TopTab>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {tab === "editor" && (
            <>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                {dirty ? (
                  <>
                    <Circle className="h-2.5 w-2.5 fill-accent text-accent animate-pulse-dot" />
                    未保存
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-muted-foreground/70" />
                    {savedAt} 已保存
                  </>
                )}
              </span>
              <button
                onClick={handleSave}
                disabled={!dirty}
                className="flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
              >
                <Save className="h-3 w-3" />
                保存
              </button>
            </>
          )}
        </div>
      </header>

      {/* 主体 */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
        {/* 左:主内容 */}
        <div className="min-h-0 min-w-0 overflow-hidden">
          {tab === "editor" && (
            <EditorPane
              file={activeFile}
              content={content}
              onChange={setContent}
              dirty={dirty}
              savedAt={savedAt}
            />
          )}
          {tab === "graph" && <GraphPane />}
          {tab === "ledger" && <LedgerPane key={ledgerKey} bookId={book.id} />}
          {tab === "skill" && <SkillPane bookId={book.id} />}
        </div>

        {/* 右:文件树 */}
        <aside className="min-h-0 border-l border-border/60 bg-sidebar/40 paper-soft backdrop-blur-xl">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 px-3 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={book.title}
                  className="w-full rounded-md border border-border/60 bg-background/60 py-1.5 pl-7 pr-2 text-[12px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring/50"
                />
              </div>
              <div className="mt-3 px-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">文件</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
              {filteredTree.map((g) => (
                <FileGroup
                  key={g.id}
                  group={g}
                  activePath={activePath}
                  onSelect={(p) => setActivePath(p)}
                />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function TopTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] transition",
        active
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function FileGroup({
  group,
  activePath,
  onSelect,
}: {
  group: WorkbenchGroup
  activePath: string
  onSelect: (path: string) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] text-foreground/90 transition hover:bg-sidebar-accent/50"
      >
        <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition", open && "rotate-90")} />
        <Folder className="h-3.5 w-3.5 text-muted-foreground/80" />
        <span className="flex-1 font-medium">{group.label}</span>
      </button>
      {open && (
        <div className="ml-2 space-y-0.5 border-l border-border/40 pl-1">
          {group.files.map((f) => (
            <FileItem
              key={f.id}
              file={f}
              active={f.path === activePath}
              onSelect={() => onSelect(f.path)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileItem({
  file,
  active,
  onSelect,
}: {
  file: WorkbenchFile
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition",
        active
          ? "bg-card text-foreground ring-1 ring-border/60 shadow-sm"
          : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground",
      )}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="flex-1 truncate font-mono text-[11.5px]">{file.name}</span>
      {file.modified && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />}
    </button>
  )
}

function EditorPane({
  file,
  content,
  onChange,
  dirty,
  savedAt,
}: {
  file: WorkbenchFile | null
  content: string
  onChange: (s: string) => void
  dirty: boolean
  savedAt: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 面包屑 */}
      <div className="flex shrink-0 items-center gap-2 px-10 pt-6 pb-3 text-[11px] text-muted-foreground">
        {file && (
          <>
            <span>{file.path.split("/").slice(0, -1).join(" / ")}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-mono text-foreground/80">{file.name}</span>
            <span className="ml-2 rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[10px]">
              {dirty ? "未保存" : "已保存"}
            </span>
            <span className="ml-1 rounded-full bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground/80">
              {savedAt} 修改
            </span>
          </>
        )}
      </div>

      {/* 编辑区 */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-10 pb-12">
        <div className="paper mx-auto max-w-3xl rounded-2xl border border-border/60 bg-card/60 p-8 shadow-sm backdrop-blur">
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="block min-h-[60vh] w-full resize-none border-0 bg-transparent font-serif text-[15px] leading-[1.85] text-foreground outline-none"
          />
        </div>
      </div>
    </div>
  )
}

function GraphPane() {
  return (
    <PlaceholderPane
      icon={<Network className="h-5 w-5" />}
      title="关系图谱"
      desc="基于人物设定与 ledger 自动生成的力导向图谱。"
    />
  )
}
function LedgerPane({ bookId }: { bookId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listLedgerEntries(bookId)
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [bookId])

  // refresh when tab becomes visible (workaround: re-fetch on mount)
  // also expose a manual refresh via re-mount by using tab key

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-10">
        <div className="text-[12px] text-muted-foreground">加载中…</div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-10">
        <div className="paper rounded-2xl border border-border/60 bg-card/60 p-8 text-center backdrop-blur">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-transparent ring-1 ring-border/50 animate-breathe-glow text-accent-foreground/80">
            <FileText className="h-5 w-5" />
          </div>
          <div className="mt-3 font-serif text-[18px] text-foreground">Ledger</div>
          <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
            暂无操作记录。保存文件后会自动记录。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-10 py-6">
      <div className="mx-auto max-w-3xl space-y-2">
        <div className="mb-4 flex items-center justify-between">
          <div className="font-serif text-[14px] text-foreground">操作记录</div>
          <span className="text-[11px] text-muted-foreground">{entries.length} 条</span>
        </div>
        {entries.map((e) => (
          <div
            key={e.id}
            className="paper rounded-lg border border-border/60 bg-card/60 px-4 py-3 backdrop-blur"
          >
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">
                {new Date(e.timestamp).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">{e.action}</span>
              <span className="text-muted-foreground/60">by {e.actor}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-foreground/90">{e.summary}</div>
            <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/60">{e.targetPath}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
function SkillPane({ bookId }: { bookId: string }) {
  const [skill, setSkill] = useState<Skill | null>(null)
  const [summary, setSummary] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setLoading(true)
    getStyleGuideSkill(bookId)
      .then(({ skill: s, summary: sm }) => {
        setSkill(s)
        setSummary(sm)
      })
      .finally(() => setLoading(false))
  }, [bookId])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const { skill: s, summary: sm } = await refreshStyleGuideSummary(bookId)
      setSkill(s)
      setSummary(sm)
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-10">
        <div className="text-[12px] text-muted-foreground">加载中…</div>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-10 py-6">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground/80" />
            <span className="font-serif text-[14px] text-foreground">创作指南摘要</span>
            {skill?.dirty ? (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                需要刷新
              </span>
            ) : (
              <span className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                最新
              </span>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-[11.5px] font-medium text-background transition hover:opacity-90 disabled:opacity-40"
          >
            <Sparkles className="h-3 w-3" />
            {refreshing ? "刷新中…" : "刷新摘要"}
          </button>
        </div>

        {/* Metadata */}
        <div className="paper mb-4 rounded-lg border border-border/60 bg-card/60 px-4 py-3 backdrop-blur">
          <div className="space-y-1.5 text-[11.5px]">
            <div className="flex items-center gap-2">
              <span className="w-20 text-muted-foreground">源文件</span>
              <span className="font-mono text-foreground/80">{skill?.sourceFile ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-muted-foreground">摘要文件</span>
              <span className="font-mono text-foreground/80">{skill?.summaryFile ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-muted-foreground">源文件修改</span>
              <span className="font-mono text-foreground/80">
                {skill?.lastSourceModified
                  ? new Date(skill.lastSourceModified).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-muted-foreground">摘要生成</span>
              <span className="font-mono text-foreground/80">
                {skill?.lastSummaryGenerated
                  ? new Date(skill.lastSummaryGenerated).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-muted-foreground">Token 估算</span>
              <span className="font-mono text-foreground/80">{skill?.summaryTokenCount ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Summary content */}
        {summary.trim() ? (
          <div className="paper rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur">
            <pre className="whitespace-pre-wrap font-serif text-[13px] leading-[1.8] text-foreground/90">
              {summary}
            </pre>
          </div>
        ) : (
          <div className="paper rounded-2xl border border-border/60 bg-card/60 p-8 text-center backdrop-blur">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-transparent ring-1 ring-border/50 animate-breathe-glow text-accent-foreground/80">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="mt-3 font-serif text-[18px] text-foreground">暂无摘要</div>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
              点击"刷新摘要"按钮生成创作指南摘要。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function PlaceholderPane({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="flex h-full items-center justify-center px-10">
      <div className="paper rounded-2xl border border-border/60 bg-card/60 p-8 text-center backdrop-blur">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-transparent ring-1 ring-border/50 animate-breathe-glow text-accent-foreground/80">
          {icon}
        </div>
        <div className="mt-3 font-serif text-[18px] text-foreground">{title}</div>
        <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}

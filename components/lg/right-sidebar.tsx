"use client"

import { useState } from "react"
import {
  ChevronRight,
  FileEdit,
  FilePlus,
  Trash2,
  Search,
  User,
  MapPin,
  Calendar,
  AtSign,
  ScrollText,
  Layers,
  BookMarked,
  Globe2,
  Check,
  X,
  Eye,
  ListTree,
  Library,
  Maximize2,
  Minimize2,
} from "lucide-react"
import type { ActionNode, SettingCard } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

interface RightSidebarProps {
  actions: ActionNode[]
  cards: SettingCard[]
  onConfirm: (id: string) => void
  onAbandon: (id: string) => void
  onCite: (card: SettingCard) => void
}

export function RightSidebar({ actions, cards, onConfirm, onAbandon, onCite }: RightSidebarProps) {
  const [tab, setTab] = useState<"plan" | "settings">("plan")
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <aside className="relative flex h-full min-h-0 w-full flex-col bg-sidebar/40 paper-soft backdrop-blur-xl">
        {/* Tabs - fixed */}
        <div className="shrink-0 px-4 pt-5 pb-3">
          <div className="flex items-center gap-1">
            <TabBtn active={tab === "plan"} onClick={() => setTab("plan")} icon={<ListTree className="h-3.5 w-3.5" />}>
              行动树
            </TabBtn>
            <TabBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={<Library className="h-3.5 w-3.5" />}>
              设定卡
            </TabBtn>
            {tab === "plan" && actions.length > 0 && (
              <button
                onClick={() => setExpanded(true)}
                className="ml-auto rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
                title="展开行动卡 · 全屏编辑"
                aria-label="展开行动卡"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        {/* Scroll body */}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-6">
          {tab === "plan" ? (
            <PlanView actions={actions} onConfirm={onConfirm} onAbandon={onAbandon} compact />
          ) : (
            <SettingsView cards={cards} onCite={onCite} />
          )}
        </div>
      </aside>

      {expanded && (
        <ExpandedPlan
          actions={actions}
          onConfirm={onConfirm}
          onAbandon={onAbandon}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  )
}

function ExpandedPlan({
  actions,
  onConfirm,
  onAbandon,
  onClose,
}: {
  actions: ActionNode[]
  onConfirm: (id: string) => void
  onAbandon: (id: string) => void
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-2xl animate-in fade-in duration-200">
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-[var(--light-warm)] opacity-50 blur-3xl animate-drift" />
        <div className="absolute -bottom-40 -left-32 h-[420px] w-[420px] rounded-full bg-[var(--light-cool)] opacity-30 blur-3xl animate-drift dark:opacity-20" />
      </div>

      <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-border/60 bg-card/40 px-6 py-3 backdrop-blur paper-soft">
        <ListTree className="h-4 w-4 text-muted-foreground/80" />
        <span className="font-serif text-[14px] tracking-wide text-foreground">行动卡 · 全局编辑</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          可下钻 / 可预览 / 可整树应用
        </span>
        <button
          onClick={onClose}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          title="收起到侧栏"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          收起
        </button>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <PlanView actions={actions} onConfirm={onConfirm} onAbandon={onAbandon} />
        </div>
      </div>
    </div>
  )
}

function TabBtn({
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
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition",
        active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function PlanView({
  actions,
  onConfirm,
  onAbandon,
  compact = false,
}: {
  actions: ActionNode[]
  onConfirm: (id: string) => void
  onAbandon: (id: string) => void
  compact?: boolean
}) {
  if (actions.length === 0) {
    return (
      <div className="mt-12 text-center text-[12px] leading-relaxed text-muted-foreground/70">
        暂无待确认的行动。<br />
        发出修改意图后,这里会生成一棵可下钻的影响树。
      </div>
    )
  }
  return (
    <div className={cn("space-y-3", !compact && "space-y-4")}>
      {actions.map((node) => (
        <ActionTreeNode
          key={node.id}
          node={node}
          depth={0}
          compact={compact}
          onConfirm={onConfirm}
          onAbandon={onAbandon}
        />
      ))}
    </div>
  )
}

function levelMeta(level: ActionNode["level"]) {
  switch (level) {
    case "root":
      return { Icon: Globe2, tag: "全局" }
    case "volume":
      return { Icon: BookMarked, tag: "卷" }
    case "system":
      return { Icon: Layers, tag: "系统" }
    case "chapter":
      return { Icon: ScrollText, tag: "章节" }
    case "leaf":
      return { Icon: FileEdit, tag: "" }
  }
}

function ActionTreeNode({
  node,
  depth,
  compact = false,
  onConfirm,
  onAbandon,
}: {
  node: ActionNode
  depth: number
  compact?: boolean
  onConfirm: (id: string) => void
  onAbandon: (id: string) => void
}) {
  const isLeaf = node.level === "leaf"
  const [open, setOpen] = useState(depth < 2)
  const [hover, setHover] = useState(false)
  const { Icon, tag } = levelMeta(node.level)

  const opIcon =
    node.operation === "create"
      ? FilePlus
      : node.operation === "delete"
        ? Trash2
        : node.operation === "check"
          ? Search
          : FileEdit

  const OpIcon = opIcon

  if (isLeaf) {
    return (
      <div
        className="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-sidebar-accent/40"
        style={{ marginLeft: depth * 10 }}
      >
        <OpIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <div className="min-w-0 flex-1 leading-relaxed">
          <div className="text-[12.5px] text-foreground/90">{node.label}</div>
          {node.scopePath && (
            <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/60">
              {node.scopePath}
            </div>
          )}
          {node.diff && (
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted/40 px-2 py-1 font-mono text-[10px] leading-snug text-muted-foreground ring-1 ring-border/40">
              {node.diff}
            </pre>
          )}
        </div>
      </div>
    )
  }

  // 父节点（root / volume / system / chapter）
  const isRoot = node.level === "root"
  return (
    <div
      className={cn(
        "paper overflow-hidden rounded-xl border bg-card/70 transition",
        isRoot ? "border-border/80" : "border-border/60",
      )}
      style={{ marginLeft: depth === 0 ? 0 : depth * 8 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-sidebar-accent/30"
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition", open && "rotate-90")}
        />
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
        <span
          className={cn(
            "flex-1 truncate text-left",
            isRoot ? "font-serif text-[14px] text-foreground" : "text-[13px] text-foreground/90",
          )}
        >
          {node.label}
        </span>
        {tag && (
          <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/80">
            {tag}
          </span>
        )}
      </button>

      {/* 影响范围预览（hover 任意层级即可见） */}
      {node.impact && (
        <div
          className={cn(
            "flex items-center gap-3 border-t border-border/50 bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground transition",
            hover || open ? "opacity-100" : "opacity-70",
          )}
        >
          <Eye className="h-3 w-3" />
          <span className="tabular-nums">影响 {node.impact.files} 文件</span>
          <Sep />
          <span className="tabular-nums">{node.impact.chapters} 章节</span>
          <Sep />
          <span className="tabular-nums">{node.impact.entities} 实体</span>
        </div>
      )}

      {open && node.children && (
        <div className={cn("space-y-1 border-t border-border/50 px-2 py-2", !compact && "space-y-2 px-3 py-3")}>
          {node.children.map((c) => (
            <ActionTreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              compact={compact}
              onConfirm={onConfirm}
              onAbandon={onAbandon}
            />
          ))}
        </div>
      )}

      {/* 操作条:每个非叶层级都可一键应用整棵子树 */}
      <div className="flex items-center gap-2 border-t border-border/50 bg-muted/10 px-3 py-2">
        <button
          onClick={() => onConfirm(node.id)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-foreground px-2 py-1.5 text-[11.5px] font-medium text-background transition hover:opacity-90"
        >
          <Check className="h-3 w-3" />
          应用此{tag || "节点"}
        </button>
        <button
          className="rounded-md border border-border bg-card px-2 py-1.5 text-[11.5px] text-foreground transition hover:bg-secondary"
          aria-label="预览"
        >
          预览
        </button>
        <button
          onClick={() => onAbandon(node.id)}
          className="rounded-md p-1.5 text-muted-foreground transition hover:text-destructive"
          aria-label="放弃"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function Sep() {
  return <span className="h-2.5 w-px bg-border/80" />
}

function SettingsView({ cards, onCite }: { cards: SettingCard[]; onCite: (c: SettingCard) => void }) {
  return (
    <div className="space-y-3">
      {cards.map((c) => {
        const Icon =
          c.category === "character"
            ? User
            : c.category === "place"
              ? MapPin
              : c.category === "event"
                ? Calendar
                : Layers
        return (
          <div key={c.id} className="paper group rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60 ring-1 ring-border/50">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-serif text-[14px] text-foreground">{c.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {c.category === "character"
                      ? "人物"
                      : c.category === "place"
                        ? "地点"
                        : c.category === "event"
                          ? "事件"
                          : "规则"}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onCite(c)}
                className="rounded-md p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-secondary hover:text-foreground"
                aria-label="引用到对话"
              >
                <AtSign className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-foreground/80">{c.summary}</p>
            {c.meta && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(c.meta).map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border/40"
                  >
                    <span className="opacity-60">{k}</span>
                    <span className="ml-1 text-foreground/80">{v}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

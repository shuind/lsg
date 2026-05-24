import { NextResponse } from "next/server"
import { generateActionPlan, generateActionPlanFromLlmActions, savePendingPlan } from "@/lib/server/action-plan"
import { retrieveContext } from "@/lib/server/retrieval"
import { readStyleGuideSummary } from "@/lib/server/skill-service"
import { isLlmEnabled, generateActionPlanWithLlm } from "@/lib/server/llm"
import {
  classifyConversationIntent,
  replyToMetaQuestion,
  answerBookQueryWithLlm,
  fallbackAnswerFromContexts,
} from "@/lib/server/conversation-agent"
import { listMessages as loadMessages, appendMessages } from "@/lib/server/message-store"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const messages = await loadMessages(bookId)
    return NextResponse.json(messages)
  } catch (err) {
    console.error("[api/books/messages] GET error:", err)
    return NextResponse.json({ error: "读取失败" }, { status: 500 })
  }
}

function makeMessageId(): string {
  return `m-${Date.now().toString(36)}`
}

function makeTimestamp(): string {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    const { content } = body

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "缺少 content" }, { status: 400 })
    }

    const userText = content.trim()
    const intent = classifyConversationIntent(userText)

    // persist user message
    const userMsg = {
      id: makeMessageId(),
      role: "user" as const,
      content: userText,
      createdAt: makeTimestamp(),
    }
    await appendMessages(bookId, [userMsg]).catch(() => {})

    // ─── Meta: greetings, capability questions ─────────────────
    if (intent === "meta") {
      const meta = replyToMetaQuestion(userText)
      const assistantMsg = {
        id: makeMessageId(),
        role: "assistant" as const,
        content: meta.content,
        createdAt: makeTimestamp(),
        brief: { understood: [meta.understood] },
      }
      await appendMessages(bookId, [assistantMsg]).catch(() => {})
      return NextResponse.json({ message: assistantMsg, plan: [] })
    }

    // ─── Clarification needed: too vague ───────────────────────
    if (intent === "clarification_needed") {
      const assistantMsg = {
        id: makeMessageId(),
        role: "assistant" as const,
        content: `主人，您的指令不够明确，请补充要修改的对象和目标。例如"把林晓改成女的"或"把林晓和陈磊的关系改成敌对"。`,
        createdAt: makeTimestamp(),
        brief: { understood: ["收到修改指令，但缺少具体目标"] },
      }
      await appendMessages(bookId, [assistantMsg]).catch(() => {})
      return NextResponse.json({ message: assistantMsg, plan: [] })
    }

    // ─── Book query: answer questions about the book ───────────
    if (intent === "book_query") {
      const llmAnswer = await answerBookQueryWithLlm(bookId, userText)

      let replyContent: string
      let understood: string
      if (llmAnswer) {
        replyContent = llmAnswer.content
        understood = llmAnswer.understood
      } else {
        const [retrieved, summary] = await Promise.all([
          retrieveContext(bookId, content).catch(() => []),
          readStyleGuideSummary(bookId).catch(() => ""),
        ])
        const fallback = fallbackAnswerFromContexts(userText, retrieved, summary)
        replyContent = fallback.content
        understood = fallback.understood
      }

      const assistantMsg = {
        id: makeMessageId(),
        role: "assistant" as const,
        content: replyContent,
        createdAt: makeTimestamp(),
        brief: { understood: [understood] },
      }
      await appendMessages(bookId, [assistantMsg]).catch(() => {})
      return NextResponse.json({ message: assistantMsg, plan: [] })
    }

    // ─── Book mutation: IntentEngine (existing flow) ───────────
    // Step 1: retrieve context
    const retrieved = await retrieveContext(bookId, content).catch(() => [])
    const contextPaths = [...new Set(retrieved.map((r) => r.path))]

    // Step 2: read style guide summary
    const summary = await readStyleGuideSummary(bookId).catch(() => "")
    if (summary.trim() && !contextPaths.includes("skills/style_guide_summary.md")) {
      contextPaths.push("skills/style_guide_summary.md")
    }

    // Step 3: try LLM first, fall back to rules
    let plan: ReturnType<typeof generateActionPlan> = []
    let understood: string[] = []
    let missing: string[] = []
    let usedLlm = false

    if (isLlmEnabled()) {
      const llmOutput = await generateActionPlanWithLlm({
        userMessage: content,
        contextPaths: retrieved.map((r) => ({ path: r.path, excerpt: r.excerpt })),
        styleGuideSummary: summary,
      }).catch(() => null)

      if (llmOutput && llmOutput.actions.length > 0) {
        plan = generateActionPlanFromLlmActions(llmOutput.actions)
        understood = llmOutput.understood
        missing = llmOutput.missing
        usedLlm = true
        if (plan.length > 0) {
          await savePendingPlan(bookId, plan)
        }
      } else if (llmOutput) {
        understood = llmOutput.understood
        missing = llmOutput.missing
        usedLlm = true
      }
    }

    // fallback: rule-based parsing
    if (!usedLlm) {
      const intents = []
      const text = content
      const genderRe = /把\s*(.+?)\s*(?:改|换|变成?)\s*(男|女)\s*(?:的|生)?/g
      const relRe = /把\s*(.+?)\s*(?:和|跟|与)\s*(.+?)\s*(?:的)?关系\s*(?:改|换|变成?)\s*(敌对|盟友|同门|师徒|恋人|朋友|陌生人)/g

      let m: RegExpExecArray | null
      while ((m = genderRe.exec(text)) !== null) {
        intents.push({ type: "gender" as const, character: m[1].trim(), target: m[2] })
      }
      while ((m = relRe.exec(text)) !== null) {
        intents.push({ type: "relationship" as const, charA: m[1].trim(), charB: m[2].trim(), relationship: m[3] })
      }

      plan = intents.length > 0 ? generateActionPlan(intents) : []
      if (plan.length > 0) {
        await savePendingPlan(bookId, plan)
        understood = intents.map((i) =>
          i.type === "gender"
            ? `将${i.character}性别改为${i.target}`
            : `将${i.charA}和${i.charB}关系改为${i.relationship}`,
        )
      }
    }

    // Step 4: build response
    let replyContent: string
    if (plan.length > 0 && contextPaths.length > 0) {
      replyContent = "已根据最近改动和相关设定拟好变更计划,请在右侧确认。"
    } else if (plan.length > 0) {
      replyContent = "已为你拟好变更计划,请在右侧确认。"
    } else if (contextPaths.length > 0) {
      replyContent = "我找到了相关上下文,但还没有明确到可执行修改。你可以补充要改的对象和目标。"
    } else {
      replyContent = "收到。需要修改设定时，直接告诉我目标对象和改法。"
    }

    const assistantMsg = {
      id: makeMessageId(),
      role: "assistant" as const,
      content: replyContent,
      createdAt: makeTimestamp(),
      brief: contextPaths.length > 0 || understood.length > 0 || missing.length > 0
        ? { understood, contextPaths, missing: missing.length > 0 ? missing : undefined }
        : undefined,
    }

    await appendMessages(bookId, [assistantMsg]).catch(() => {})
    return NextResponse.json({ message: assistantMsg, plan })
  } catch (err) {
    console.error("[api/books/messages] error:", err)
    return NextResponse.json({ error: "处理失败" }, { status: 500 })
  }
}

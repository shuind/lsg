import { NextResponse } from "next/server"
import { generateActionPlanFromLlmActions, savePendingPlan } from "@/lib/server/action-plan"
import { processMessage } from "@/lib/server/conversation-agent"
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

    // persist user message
    const userMsg = {
      id: makeMessageId(),
      role: "user" as const,
      content: userText,
      createdAt: makeTimestamp(),
    }
    await appendMessages(bookId, [userMsg]).catch(() => {})

    // unified LLM processing
    const result = await processMessage(bookId, userText)

    // save action plan if any
    let plan: ReturnType<typeof generateActionPlanFromLlmActions> = []
    if (result.actions.length > 0) {
      plan = generateActionPlanFromLlmActions(result.actions)
      if (plan.length > 0) {
        await savePendingPlan(bookId, plan)
      }
    }

    // build and persist assistant reply
    const assistantMsg = {
      id: makeMessageId(),
      role: "assistant" as const,
      content: result.reply,
      createdAt: makeTimestamp(),
      brief: result.understood.length > 0 || result.missing.length > 0
        ? {
            understood: result.understood,
            missing: result.missing.length > 0 ? result.missing : undefined,
          }
        : undefined,
    }
    await appendMessages(bookId, [assistantMsg]).catch(() => {})

    return NextResponse.json({ message: assistantMsg, plan })
  } catch (err) {
    console.error("[api/books/messages] error:", err)
    return NextResponse.json({ error: "处理失败" }, { status: 500 })
  }
}

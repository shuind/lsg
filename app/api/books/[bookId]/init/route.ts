import { NextResponse } from "next/server"
import { listChapters } from "@/lib/server/chapter-store"
import { listMessages } from "@/lib/server/message-store"
import { loadPendingPlan } from "@/lib/server/action-plan"
import { listSettingCards } from "@/lib/server/setting-card-store"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const [chapters, messages, plan, cards] = await Promise.all([
      listChapters(bookId),
      listMessages(bookId),
      loadPendingPlan(bookId),
      listSettingCards(bookId),
    ])
    return NextResponse.json({ chapters, messages, plan, cards })
  } catch (err) {
    console.error("[api/books/init] error:", err)
    return NextResponse.json({ error: "初始化失败" }, { status: 500 })
  }
}

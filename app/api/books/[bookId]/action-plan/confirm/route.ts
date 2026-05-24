import { NextResponse } from "next/server"
import { confirmNode } from "@/lib/server/action-plan"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const body = await request.json()
    const { nodeId } = body

    if (!nodeId || typeof nodeId !== "string") {
      return NextResponse.json({ error: "缺少 nodeId" }, { status: 400 })
    }

    const result = await confirmNode(bookId, nodeId)
    if (!result.success) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 })
    }

    return NextResponse.json({ success: true, plan: result.plan })
  } catch (err) {
    console.error("[api/books/action-plan/confirm] error:", err)
    return NextResponse.json({ error: "确认失败" }, { status: 500 })
  }
}

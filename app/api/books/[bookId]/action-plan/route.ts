import { NextResponse } from "next/server"
import { loadPendingPlan } from "@/lib/server/action-plan"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  try {
    const { bookId } = await params
    const plan = await loadPendingPlan(bookId)
    return NextResponse.json(plan)
  } catch (err) {
    console.error("[api/books/action-plan] error:", err)
    return NextResponse.json([], { status: 200 })
  }
}

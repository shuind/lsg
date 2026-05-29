import type { LlmAction } from "@/lib/server/llm"
import { isLlmEnabled, generateActionPlanWithLlm } from "@/lib/server/llm"
import { retrieveContext } from "@/lib/server/retrieval"
import { readStyleGuideSummary } from "@/lib/server/skill-service"

// ─── Unified Message Processing ───────────────────────────────

export interface ProcessResult {
  reply: string
  actions: LlmAction[]
  understood: string[]
  missing: string[]
}

export async function processMessage(
  bookId: string,
  userMessage: string,
): Promise<ProcessResult> {
  // Step 1: retrieve context + style guide in parallel
  const [retrieved, summary] = await Promise.all([
    retrieveContext(bookId, userMessage).catch(() => []),
    readStyleGuideSummary(bookId).catch(() => ""),
  ])

  // Step 2: try unified LLM call
  if (isLlmEnabled()) {
    const llmOutput = await generateActionPlanWithLlm({
      userMessage,
      contextPaths: retrieved.map((r) => ({ path: r.path, excerpt: r.excerpt })),
      styleGuideSummary: summary,
    }).catch(() => null)

    if (llmOutput) {
      return {
        reply: llmOutput.reply ?? buildDefaultReply(llmOutput.actions ?? [], retrieved.length > 0),
        actions: llmOutput.actions ?? [],
        understood: llmOutput.understood ?? [],
        missing: llmOutput.missing ?? [],
      }
    }
  }

  // Step 3: LLM unavailable — basic fallback
  return {
    reply: buildFallbackReply(userMessage, retrieved),
    actions: [],
    understood: [],
    missing: [],
  }
}

// ─── Reply Builders ───────────────────────────────────────────

function buildDefaultReply(actions: LlmAction[], hasContext: boolean): string {
  if (actions.length > 0 && hasContext) {
    return "已根据上下文拟好变更计划，请在右侧确认。"
  }
  if (actions.length > 0) {
    return "已为你拟好变更计划，请在右侧确认。"
  }
  if (hasContext) {
    return "我找到了相关上下文，但还没有明确到可执行修改。你可以补充要改的对象和目标。"
  }
  return "收到。需要修改设定时，直接告诉我目标对象和改法。"
}

function buildFallbackReply(
  query: string,
  contexts: { path: string; excerpt: string }[],
): string {
  if (contexts.length === 0) {
    return "抱歉，主人，我没有找到相关信息。请检查书籍目录确认内容是否存在，或者换个方式描述。"
  }

  const relevant = contexts.slice(0, 3).map((c) => {
    const name = c.path.replace(/\.md$|\.json$/, "").replace(/\//g, " > ")
    return `- ${name}: ${c.excerpt.slice(0, 150)}`
  })

  return `根据现有设定，我找到了以下相关信息：\n\n${relevant.join("\n")}\n\n如需更详细的回答，请确保相关文件已更新到最新状态。`
}

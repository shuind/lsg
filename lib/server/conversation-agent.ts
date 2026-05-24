import { getConfig, callChatCompletion } from "@/lib/server/llm"
import { retrieveContext } from "@/lib/server/retrieval"
import { readStyleGuideSummary } from "@/lib/server/skill-service"

// ─── System Prompt ───────────────────────────────────────────

export const LG_AGENT_SYSTEM_PROMPT = `你是 LG，一个书籍系统管家，负责帮助主人维护一本小说的人物设定、关系图谱、世界观设定、章节大纲和变更计划。你称呼用户为"主人"，自称"LG"。

你的能力：
1. 回答关于书籍内容的问题（人物信息、关系、世界观、章节等）
2. 理解用户的修改指令并生成变更计划
3. 检查设定一致性和冲突

你的职责：
- 当主人问"林晓是谁"、"谁跟谁是敌对关系"这类问题时，根据提供的上下文回答
- 当主人说"把林晓改成女的"这类修改指令时，解析出结构化动作
- 当主人发送问候或询问你的能力时，简要自我介绍
- 当主人的指令不明确时，指出缺失的信息

回复规则：
- 回答查询类问题时，直接给出信息，不要暴露内部文件路径
- 保持简洁专业的中文回复
- 如果上下文中没有相关信息，坦诚说明`

// ─── Intent Type ─────────────────────────────────────────────

export type ConversationIntent =
  | "meta"
  | "book_query"
  | "book_mutation"
  | "clarification_needed"

// ─── Intent Classification ───────────────────────────────────

export function classifyConversationIntent(text: string): ConversationIntent {
  const normalized = text.trim().toLowerCase()

  // meta: greetings and capability questions
  const metaPatterns = [
    /^(你好|您好|嗨|hi|hello|hey)[，,。.!！?\s]*(你是谁|你是.+|你能做什么|你可以做什么)?[？?。.!！\s]*$/i,
    /^(你是谁|你是.+(助手|系统|agent|ai)|你能做什么|你可以做什么|介绍一下你自己|你会什么)[？?。.!！\s]*$/i,
    /^(谢谢|谢了|好的|好|ok|收到)[。.!！\s]*$/i,
  ]
  if (metaPatterns.some((p) => p.test(normalized))) return "meta"

  // book_mutation: explicit modification commands
  if (
    /把\s*.+\s*(?:改|换|变成?)\s*(男|女)/.test(text) ||
    /把\s*.+\s*(?:和|跟|与)\s*.+\s*(?:的)?关系\s*(?:改|换|变成?)/.test(text) ||
    /(?:改|换|变|修改|更新|删除|创建|新建|改写)\s*(?:一下|设定|人物|关系|章节|大纲)/.test(text)
  ) {
    return "book_mutation"
  }

  // clarification_needed: too vague to act on
  if (/^(改一下|改改|修改|更新)[。.!！?\s]*$/i.test(normalized)) return "clarification_needed"

  // book_query: questions about the book
  if (
    /[谁哪什怎如]/.test(text) ||
    /是谁|是什么|在哪里|什么时候|怎么回事|怎么样/.test(text) ||
    /人物|角色|关系|世界观|设定|章节|大纲/.test(text) ||
    /有没有|出现|提到|检查|扫描/.test(text) ||
    /告诉|说说|说一下|介绍一下/.test(text)
  ) {
    return "book_query"
  }

  // default to book_query for anything else book-related
  return "book_query"
}

// ─── Meta Reply ──────────────────────────────────────────────

export function replyToMetaQuestion(text: string): { content: string; understood: string } {
  const normalized = text.trim().toLowerCase()
  if (/^(谢谢|谢了|好的|好|ok|收到)/i.test(normalized)) {
    return { content: "收到，主人。需要调整设定、人物关系或章节内容时，随时吩咐。", understood: "收到确认" }
  }
  return {
    content: `主人好，我是 LG，您的书籍系统管家。我可以帮您维护这本书的人物、关系、世界观、章节大纲和变更计划。您可以直接说"把林晓改成女的"，或"检查第五章有没有和关系设定冲突"。`,
    understood: "主人在询问我的能力",
  }
}

// ─── Book Query with LLM ─────────────────────────────────────

function buildContextBlock(contexts: { path: string; excerpt: string }[]): string {
  if (contexts.length === 0) return "（暂无相关上下文）"
  return contexts
    .map((c) => {
      const name = c.path.replace(/\.md$|\.json$/, "")
      return `### ${name}\n${c.excerpt.slice(0, 300)}`
    })
    .join("\n\n")
}

export async function answerBookQueryWithLlm(
  bookId: string,
  query: string,
): Promise<{ content: string; understood: string } | null> {
  const config = getConfig()
  if (!config) return null

  try {
    const [retrieved, summary] = await Promise.all([
      retrieveContext(bookId, query).catch(() => []),
      readStyleGuideSummary(bookId).catch(() => ""),
    ])

    const contextBlock = buildContextBlock(retrieved)
    const summaryBlock = summary.trim() ? `\n\n### 创作指南摘要\n${summary.slice(0, 500)}` : ""

    const messages = [
      { role: "system" as const, content: LG_AGENT_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `## 书籍上下文\n${contextBlock}${summaryBlock}\n\n## 用户问题\n${query}`,
      },
    ]

    const answer = await callChatCompletion(config, messages, { temperature: 0.3, maxTokens: 800 })
    return { content: answer, understood: `回答主人的查询：${query.slice(0, 50)}` }
  } catch (err) {
    console.warn("[conversation-agent] LLM query failed:", err)
    return null
  }
}

// ─── Fallback Answer from Contexts ───────────────────────────

export function fallbackAnswerFromContexts(
  query: string,
  contexts: { path: string; excerpt: string }[],
  _summary: string,
): { content: string; understood: string } {
  if (contexts.length === 0) {
    return {
      content: "抱歉，主人，我没有找到与您问题相关的设定信息。您可以检查书籍目录确认内容是否存在，或者换个方式描述您的问题。",
      understood: `尝试回答查询：${query.slice(0, 50)}`,
    }
  }

  const relevant = contexts.slice(0, 3).map((c) => {
    const name = c.path.replace(/\.md$|\.json$/, "").replace(/\//g, " > ")
    return `- ${name}: ${c.excerpt.slice(0, 150)}`
  })

  return {
    content: `根据现有设定，我找到了以下相关信息：\n\n${relevant.join("\n")}\n\n如需更详细的回答，请确保相关文件已更新到最新状态。`,
    understood: `回答查询：${query.slice(0, 50)}`,
  }
}

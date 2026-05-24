import { z } from "zod"

// ─── Config ───────────────────────────────────────────────────

interface LlmConfig {
  provider: "mimo" | "deepseek"
  apiKey: string
  baseUrl: string
  model: string
}

export function getConfig(): LlmConfig | null {
  const provider = (process.env.LLM_PROVIDER ?? "mimo").toLowerCase()

  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) return null
    return {
      provider: "deepseek",
      apiKey,
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    }
  }

  // default: mimo
  const apiKey = process.env.MIMO_API_KEY
  if (!apiKey) return null
  return {
    provider: "mimo",
    apiKey,
    baseUrl: process.env.MIMO_BASE_URL ?? "https://api.mimo-v2.com/v1",
    model: process.env.MIMO_MODEL ?? "mimo-v2.5-pro",
  }
}

export function isLlmEnabled(): boolean {
  return getConfig() !== null
}

export function getLlmProvider(): string {
  return getConfig()?.provider ?? "none"
}

// ─── Output Schema ────────────────────────────────────────────

const LlmActionSchema = z.union([
  z.object({
    type: z.literal("gender_change"),
    character: z.string().min(1),
    target: z.enum(["男", "女"]),
  }),
  z.object({
    type: z.literal("relationship_change"),
    charA: z.string().min(1),
    charB: z.string().min(1),
    relationship: z.enum(["敌对", "盟友", "同门", "师徒", "恋人", "朋友", "陌生人"]),
  }),
])

const LlmOutputSchema = z.object({
  understood: z.array(z.string()),
  missing: z.array(z.string()),
  actions: z.array(LlmActionSchema),
})

export type LlmOutput = z.infer<typeof LlmOutputSchema>
export type LlmAction = z.infer<typeof LlmActionSchema>

// ─── Input Building ───────────────────────────────────────────

export interface LlmInput {
  userMessage: string
  contextPaths: { path: string; excerpt: string }[]
  styleGuideSummary: string
}

function buildPrompt(input: LlmInput): string {
  const contextBlock = input.contextPaths.length > 0
    ? input.contextPaths.map((c) => `- ${c.path}: ${c.excerpt.slice(0, 200)}`).join("\n")
    : "（无相关上下文）"

  const summaryBlock = input.styleGuideSummary.trim()
    ? input.styleGuideSummary.slice(0, 500)
    : "（无创作指南摘要）"

  return `你是一个小说创作系统的意图理解模块。用户会发送修改指令，你需要解析出结构化的动作。

## 当前书籍上下文

### 召回的相关文件
${contextBlock}

### 创作指南摘要
${summaryBlock}

## 支持的动作类型

1. gender_change: 修改人物性别
   - character: 人物名称
   - target: "男" 或 "女"

2. relationship_change: 修改两个人物之间的关系
   - charA: 人物A名称
   - charB: 人物B名称
   - relationship: "敌对" | "盟友" | "同门" | "师徒" | "恋人" | "朋友" | "陌生人"

## 用户输入

${input.userMessage}

## 输出要求

只输出 JSON，不要输出任何解释。格式：

{
  "understood": ["你理解的任务1", "你理解的任务2"],
  "missing": ["缺失的信息1"],
  "actions": [
    { "type": "gender_change", "character": "林晓", "target": "女" },
    { "type": "relationship_change", "charA": "林晓", "charB": "陈磊", "relationship": "敌对" }
  ]
}

如果用户没有表达明确的修改意图，actions 为空数组。
如果缺少关键信息（如人物名称不明确），放入 missing 数组。
understood 数组列出你理解的所有任务。`
}

// ─── API Call ─────────────────────────────────────────────────

export async function callChatCompletion(
  config: LlmConfig,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  }

  headers["api-key"] = config.apiKey

  const body = JSON.stringify({
    model: config.model,
    messages,
    temperature: options?.temperature ?? 0.1,
    max_tokens: options?.maxTokens ?? 1000,
  })

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`LLM API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("LLM returned no content")
  }

  return content
}

async function callLlm(config: LlmConfig, prompt: string): Promise<string> {
  return callChatCompletion(config, [
    { role: "system", content: "你是一个小说创作系统的意图理解模块。只输出 JSON，不要输出任何解释或 markdown 格式。" },
    { role: "user", content: prompt },
  ])
}

// ─── Main Entry ───────────────────────────────────────────────

export async function generateActionPlanWithLlm(input: LlmInput): Promise<LlmOutput | null> {
  const config = getConfig()
  if (!config) return null

  try {
    const prompt = buildPrompt(input)
    const raw = await callLlm(config, prompt)

    // extract JSON from response (handle potential markdown wrapping)
    const jsonStr = raw.trim()
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)

    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonStr)
    const result = LlmOutputSchema.safeParse(parsed)

    if (!result.success) {
      console.warn("[llm] output validation failed:", result.error.message)
      return null
    }

    return result.data
  } catch (err) {
    console.warn("[llm] call failed, falling back to rules:", err)
    return null
  }
}

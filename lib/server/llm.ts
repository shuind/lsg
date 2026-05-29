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
  z.object({
    type: z.literal("character_create"),
    name: z.string().min(1),
    fields: z.object({
      gender: z.string().optional(),
      age: z.string().optional(),
      identity: z.string().optional(),
      summary: z.string().optional(),
    }).optional(),
  }),
  z.object({
    type: z.literal("character_update"),
    character: z.string().min(1),
    field: z.enum(["性别", "年龄", "身份", "外貌", "性格", "背景", "目标", "备注"]),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("world_update"),
    fileHint: z.string().min(1),
    section: z.string().optional(),
    content: z.string().min(1),
  }),
  z.object({
    type: z.literal("chapter_check"),
    chapterHint: z.string().min(1),
    target: z.string().optional(),
    checkGoal: z.string().min(1),
  }),
  z.object({
    type: z.literal("foreshadowing_add"),
    name: z.string().min(1),
    content: z.string().min(1),
    chapter: z.string().optional(),
  }),
  z.object({
    type: z.literal("foreshadowing_payoff"),
    name: z.string().min(1),
    chapter: z.string().optional(),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("event_record"),
    title: z.string().min(1),
    content: z.string().min(1),
    importance: z.enum(["普通", "关键", "转折"]).optional(),
  }),
  z.object({
    type: z.literal("timeline_event_add"),
    time: z.string().min(1),
    event: z.string().min(1),
    characters: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("character_position_update"),
    character: z.string().min(1),
    position: z.string().min(1),
    chapter: z.string().optional(),
  }),
  z.object({
    type: z.literal("chapter_summary_update"),
    chapter: z.string().min(1),
    summary: z.string().min(1),
  }),
  z.object({
    type: z.literal("reader_knowledge_update"),
    item: z.string().min(1),
    readerKnows: z.boolean(),
    characterKnows: z.string().optional(),
  }),
  z.object({
    type: z.literal("emotion_debt_add"),
    promise: z.string().min(1),
    chapter: z.string().optional(),
  }),
  z.object({
    type: z.literal("emotion_debt_payoff"),
    promise: z.string().min(1),
    chapter: z.string().optional(),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("banned_pattern_add"),
    pattern: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("quality_rule_update"),
    rule: z.string().min(1),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal("system_check"),
    checkGoal: z.string().min(1),
    checkType: z.enum(["foreshadowing", "timeline", "character_position", "reader_experience", "quality"]).optional(),
    targets: z.array(z.string()).optional(),
  }),
])

const LlmOutputSchema = z.object({
  reply: z.string().optional(),
  understood: z.array(z.string()).optional(),
  missing: z.array(z.string()).optional(),
  actions: z.array(LlmActionSchema).optional(),
})

export type LlmOutput = z.infer<typeof LlmOutputSchema>
export type LlmAction = z.infer<typeof LlmActionSchema>

// ─── Tool Definitions (OpenAI function calling) ──────────────

interface ToolDef {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export const LG_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "gender_change",
      description: "修改人物性别",
      parameters: {
        type: "object",
        properties: {
          character: { type: "string", description: "人物名称" },
          target: { type: "string", enum: ["男", "女"] },
        },
        required: ["character", "target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "relationship_change",
      description: "修改两个人物之间的关系",
      parameters: {
        type: "object",
        properties: {
          charA: { type: "string", description: "人物A" },
          charB: { type: "string", description: "人物B" },
          relationship: { type: "string", enum: ["敌对", "盟友", "同门", "师徒", "恋人", "朋友", "陌生人"] },
        },
        required: ["charA", "charB", "relationship"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "character_create",
      description: "新建人物设定",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "人物名称" },
          fields: {
            type: "object",
            properties: {
              gender: { type: "string" },
              age: { type: "string" },
              identity: { type: "string" },
              summary: { type: "string" },
            },
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "character_update",
      description: "修改人物字段（性别、年龄、身份、外貌、性格、背景、目标、备注）",
      parameters: {
        type: "object",
        properties: {
          character: { type: "string", description: "人物名称" },
          field: { type: "string", enum: ["性别", "年龄", "身份", "外貌", "性格", "背景", "目标", "备注"] },
          value: { type: "string", description: "新值" },
        },
        required: ["character", "field", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "world_update",
      description: "新增或修改世界观设定",
      parameters: {
        type: "object",
        properties: {
          fileHint: { type: "string", description: "文件名提示，如'天轮与岁轮'、'阵法体系'" },
          section: { type: "string", description: "章节标题（可选）" },
          content: { type: "string", description: "要写入的内容" },
        },
        required: ["fileHint", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chapter_check",
      description: "检查章节与设定的一致性",
      parameters: {
        type: "object",
        properties: {
          chapterHint: { type: "string", description: "章节名或编号" },
          target: { type: "string", description: "要检查的设定对象" },
          checkGoal: { type: "string", description: "检查目标" },
        },
        required: ["chapterHint", "checkGoal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "foreshadowing_add",
      description: "记录一个伏笔",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "伏笔名称" },
          content: { type: "string", description: "伏笔内容" },
          chapter: { type: "string", description: "埋设章节" },
        },
        required: ["name", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "foreshadowing_payoff",
      description: "回收/兑现一个伏笔",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "伏笔名称" },
          chapter: { type: "string", description: "回收章节" },
          note: { type: "string", description: "回收方式" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "event_record",
      description: "记录关键事件",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "事件标题" },
          content: { type: "string", description: "事件描述" },
          importance: { type: "string", enum: ["普通", "关键", "转折"] },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "timeline_event_add",
      description: "添加时间线事件",
      parameters: {
        type: "object",
        properties: {
          time: { type: "string", description: "故事内时间" },
          event: { type: "string", description: "事件描述" },
          characters: { type: "array", items: { type: "string" }, description: "涉及人物" },
        },
        required: ["time", "event"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "character_position_update",
      description: "更新角色当前位置",
      parameters: {
        type: "object",
        properties: {
          character: { type: "string" },
          position: { type: "string" },
          chapter: { type: "string" },
        },
        required: ["character", "position"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "chapter_summary_update",
      description: "更新章节摘要",
      parameters: {
        type: "object",
        properties: {
          chapter: { type: "string", description: "章节名" },
          summary: { type: "string", description: "摘要内容" },
        },
        required: ["chapter", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reader_knowledge_update",
      description: "更新读者信息差（读者是否知道某信息）",
      parameters: {
        type: "object",
        properties: {
          item: { type: "string", description: "信息条目" },
          readerKnows: { type: "boolean", description: "读者是否已知" },
          characterKnows: { type: "string", description: "哪个角色已知" },
        },
        required: ["item", "readerKnows"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "emotion_debt_add",
      description: "种下一个情绪期待（读者期待但尚未兑现的）",
      parameters: {
        type: "object",
        properties: {
          promise: { type: "string", description: "期待描述" },
          chapter: { type: "string", description: "种下期待的章节" },
        },
        required: ["promise"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "emotion_debt_payoff",
      description: "兑现一个情绪期待",
      parameters: {
        type: "object",
        properties: {
          promise: { type: "string", description: "要兑现的期待" },
          chapter: { type: "string" },
          note: { type: "string", description: "兑现方式" },
        },
        required: ["promise"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "banned_pattern_add",
      description: "添加写作禁止项",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "应避免的套路" },
          reason: { type: "string" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quality_rule_update",
      description: "添加或更新写作质量规则",
      parameters: {
        type: "object",
        properties: {
          rule: { type: "string", description: "规则描述" },
          detail: { type: "string" },
        },
        required: ["rule"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "system_check",
      description: "执行系统一致性检查",
      parameters: {
        type: "object",
        properties: {
          checkGoal: { type: "string", description: "检查目标" },
          checkType: { type: "string", enum: ["foreshadowing", "timeline", "character_position", "reader_experience", "quality"] },
          targets: { type: "array", items: { type: "string" } },
        },
        required: ["checkGoal"],
      },
    },
  },
]

// ─── Tool Call → Action Conversion ────────────────────────────

interface FunctionCall {
  name: string
  arguments: Record<string, unknown>
}

function toolCallsToActions(calls: FunctionCall[]): LlmAction[] {
  const actions: LlmAction[] = []
  for (const call of calls) {
    const args = call.arguments ?? {}
    const action = { type: call.name, ...args }
    const result = LlmActionSchema.safeParse(action)
    if (result.success) {
      actions.push(result.data)
    }
  }
  return actions
}

// ─── API Call ─────────────────────────────────────────────────

interface ChatResponse {
  content: string
  toolCalls?: FunctionCall[]
}

export async function callChatCompletion(
  config: LlmConfig,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number; tools?: ToolDef[] },
): Promise<ChatResponse> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  }

  headers["api-key"] = config.apiKey

  const bodyObj: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options?.temperature ?? 0.1,
    max_tokens: options?.maxTokens ?? 2000,
  }

  if (options?.tools && options.tools.length > 0) {
    bodyObj.tools = options.tools
  }

  const body = JSON.stringify(bodyObj)

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(60000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`LLM API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  const choice = data.choices?.[0]
  const message = choice?.message
  const content = typeof message?.content === "string" ? message.content : ""

  // parse tool_calls if present (OpenAI function calling format)
  const toolCalls: FunctionCall[] = []
  if (Array.isArray(message?.tool_calls)) {
    for (const tc of message.tool_calls) {
      try {
        const args = typeof tc.function?.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : tc.function?.arguments ?? {}
        toolCalls.push({ name: tc.function?.name ?? "", arguments: args })
      } catch {
        // skip unparseable tool call
      }
    }
  }

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}

// ─── Unified Agent Entry Point ────────────────────────────────

const AGENT_SYSTEM_PROMPT = `你是 LG，一个小说系统管家。你帮助主人维护一本小说的完整创作系统。

你的能力：
1. 回答关于书籍内容的问题（人物、关系、世界观、章节等）
2. 理解修改指令并调用工具执行操作
3. 当主人发送大段设定内容时，拆解为多条工具调用（如：从世界观文档中提取人物→character_create，提取设定→world_update，提取伏笔→foreshadowing_add）
4. 检查设定一致性

规则：
- 称呼用户为"主人"，自称"LG"
- 回答问题时直接给出信息，不要暴露内部机制
- 当用户发送的内容包含可结构化的信息时，主动调用工具将其录入系统
- 保持简洁专业的中文回复
- 如果缺少关键信息，放入 missing 字段`

function buildAgentMessages(
  userMessage: string,
  contextPaths: { path: string; excerpt: string }[],
  styleGuideSummary: string,
): { role: string; content: string }[] {
  const contextBlock = contextPaths.length > 0
    ? contextPaths.map((c) => `- ${c.path}: ${c.excerpt.slice(0, 300)}`).join("\n")
    : "（暂无相关上下文）"

  const summaryBlock = styleGuideSummary.trim()
    ? styleGuideSummary.slice(0, 500)
    : ""

  const userContent = `## 书籍上下文

${contextBlock}
${summaryBlock ? `\n### 创作指南\n${summaryBlock}` : ""}

## 用户消息

${userMessage}`

  return [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ]
}

export async function generateActionPlanWithLlm(input: {
  userMessage: string
  contextPaths: { path: string; excerpt: string }[]
  styleGuideSummary: string
}): Promise<LlmOutput | null> {
  const config = getConfig()
  if (!config) return null

  try {
    const messages = buildAgentMessages(
      input.userMessage,
      input.contextPaths,
      input.styleGuideSummary,
    )

    const response = await callChatCompletion(config, messages, {
      temperature: 0.2,
      maxTokens: 2000,
      tools: LG_TOOLS,
    })

    // if we got tool calls, convert them to actions
    if (response.toolCalls) {
      const actions = toolCallsToActions(response.toolCalls)
      return {
        reply: response.content || undefined,
        understood: actions.map((a) => `调用 ${a.type}`),
        missing: [],
        actions,
      }
    }

    // no tool calls — try to parse JSON from text response (fallback)
    if (response.content) {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          const result = LlmOutputSchema.safeParse(parsed)
          if (result.success) return result.data
        } catch {
          // not valid JSON, treat as plain reply
        }
      }

      // plain text reply — no actions
      return {
        reply: response.content,
        understood: [],
        missing: [],
        actions: [],
      }
    }

    return null
  } catch (err) {
    console.warn("[llm] agent call failed:", err)
    return null
  }
}

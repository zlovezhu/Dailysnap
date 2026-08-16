import { invoke } from "@tauri-apps/api/core";

// 生产配置：走自建中转服务（不放真实 deepseek key，防逆向盗刷）。
// RELAY_TOKEN 是中转服务的鉴权 token，泄露后可在服务端轮换。
const RELAY_BASE_URL = "http://124.220.21.190/v1/";
const RELAY_TOKEN = "afd993c8fa1ad430c0040f4232c4b5d795fcacdf6e13ef9bb1ddbcfb536077db";
const RELAY_MODEL = "deepseek-v4-flash";

/** Frontend fetch wrapper with retry for transient errors (network / 5xx).
 *  Retries up to 2 times with 1s, 2s backoff. 4xx errors are NOT retried. */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok || resp.status < 500) return resp;
      if (attempt <= maxRetries) {
        await new Promise<void>((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      return resp;
    } catch (e) {
      lastErr = e as Error;
      if (attempt <= maxRetries) {
        await new Promise<void>((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error("fetch failed");
}

/** Detect whether a generated report is the fallback (AI call failed).
 *  Used by callers to decide whether to persist to DB. */
export function isFallbackReport(content: string): boolean {
  return content.includes("AI 调用失败，重试中");
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

export async function aiChat(userMessage: string, step: string): Promise<string> {
  try {
    const result = await invoke<string>("ai_chat", {
      userMessage,
      step,
    });
    return result;
  } catch {
    return await callAiDirect(userMessage, step);
  }
}

async function callAiDirect(userMessage: string, step: string): Promise<string> {
  const systemPrompt =
    step === "first_reply"
      ? `你是一个友好的工作记录助手。用户被提醒记录当前工作状态。
规则：
1. 根据用户的回复，判断是否需要追问一个细节问题以丰富记录
2. 如果用户回复很简短（如"开会"），追问会议主题或结论
3. 如果用户回复已经足够详细（超过10个字且包含具体内容），回复"好的，已记录！有新进展随时找我聊~"
4. 如果用户表示不想聊/忙，回复"了解，已记录！"
5. 回复风格：轻松随意，像朋友聊天
注意：如果决定结束对话，回复中必须包含"已记录"或"记下了"这样的词。`
      : `你是一个友好的工作记录助手。用户刚回答了你的追问。
现在请简短感谢并结束对话。回复中必须包含"已记录"或"记下了"。
回复风格：轻松随意，像朋友聊天。不超过20个字。`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    const baseUrl = RELAY_BASE_URL.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RELAY_TOKEN}`,
      },
      body: JSON.stringify({
        model: RELAY_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data: ChatResponse = await response.json();
    return data.choices[0]?.message?.content || mockResponse(userMessage, step);
  } catch {
    return mockResponse(userMessage, step);
  }
}

export async function generateReport(records: Array<{ content: string; created_at: string; user_followup_reply?: string | null; category?: string }>, date?: string): Promise<string> {
  const recordsText = records
    .map((r) => {
      const time = r.created_at.substring(11, 16);
      const cat = r.category && r.category !== "other" ? `[${categoryLabel(r.category)}] ` : "";
      let text = `[${time}] ${cat}${r.content}`;
      if (r.user_followup_reply) text += ` (补充: ${r.user_followup_reply})`;
      return text;
    })
    .join("\n");

  const systemPrompt = `你是一个工作日报生成助手。根据用户一天的碎片记录，生成结构化日报。

要求：
1. 合并相似的记录项
2. 按工作主题/项目分组
3. 补充合理的描述（基于上下文推断）
4. 输出格式：Markdown，包含日期标题、分点列表、明日计划
5. 语言风格：简洁专业，适合发给领导/团队
6. 不要编造用户没做过的事情
7. 如果多条记录本质是同一件事（用户点快捷回复导致重复），合并成一条
8. 如果记录内容太短或像占位符（「在写代码」「换新的了」等），输出时合并为「具体内容待补充」一节，不要堆叠多条相同 placeholder

用户今日记录：
${recordsText}`;

  try {
    const baseUrl = RELAY_BASE_URL.replace(/\/+$/, "");
    const response = await fetchWithRetry(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RELAY_TOKEN}`,
      },
      body: JSON.stringify({
        model: RELAY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "请根据以上记录生成今日工作日报" },
        ],
        temperature: 0.5,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data: ChatResponse = await response.json();
    return data.choices[0]?.message?.content || mockReport(records, date);
  } catch {
    return mockReport(records, date);
  }
}

export async function generateWeeklyReport(records: Array<{ content: string; created_at: string; date: string; user_followup_reply?: string | null; category?: string }>): Promise<string> {
  const groupedByDate = groupRecordsByDate(records);
  const recordsText = Object.entries(groupedByDate)
    .map(([date, dayRecords]) => {
      const dayItems = dayRecords.map((r) => {
        const time = r.created_at.substring(11, 16);
        const cat = r.category && r.category !== "other" ? `[${categoryLabel(r.category)}] ` : "";
        return `  - [${time}] ${cat}${r.content}${r.user_followup_reply ? ` (补充: ${r.user_followup_reply})` : ""}`;
      }).join("\n");
      return `### ${date}\n${dayItems}`;
    })
    .join("\n\n");

  const systemPrompt = `你是一个周报生成助手。根据用户一周的碎片记录，生成结构化周报。

要求：
1. 按工作主题/项目分组（不要按天罗列）
2. 总结本周主要工作成果
3. 分析时间花在哪些方面
4. 提出下周工作建议
5. 输出格式：Markdown，包含"本周工作总结"、"时间分布分析"、"下周计划"三个部分
6. 语言风格：简洁专业，适合发给领导/团队
7. 不要编造用户没做过的事情

用户本周记录：
${recordsText}`;

  try {
    const baseUrl = RELAY_BASE_URL.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RELAY_TOKEN}`,
      },
      body: JSON.stringify({
        model: RELAY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "请根据以上记录生成本周工作周报" },
        ],
        temperature: 0.5,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data: ChatResponse = await response.json();
    return data.choices[0]?.message?.content || mockWeeklyReport(records);
  } catch {
    return mockWeeklyReport(records);
  }
}

export async function chatWithRecords(
  question: string,
  records: Array<{ content: string; created_at: string; date: string; user_followup_reply?: string | null; category?: string }>
): Promise<string> {
  const recordsText = records
    .map((r) => {
      const cat = r.category && r.category !== "other" ? `[${categoryLabel(r.category)}] ` : "";
      return `- [${r.date} ${r.created_at.substring(11, 16)}] ${cat}${r.content}${r.user_followup_reply ? ` (补充: ${r.user_followup_reply})` : ""}`;
    })
    .join("\n");

  const systemPrompt = `你是用户的个人工作记忆助手。用户可以问你关于自己工作记录的任何问题。

你有以下记录数据（最近 30 天）：
${recordsText}

要求：
1. 基于记录数据回答用户的问题
2. 如果问题涉及统计（如"花了多少时间"），给出具体数字和占比
3. 如果记录中没有相关信息，坦诚告知
4. 回复风格：简洁、直接、有用
5. 不要编造记录中不存在的内容`;

  try {
    const baseUrl = RELAY_BASE_URL.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RELAY_TOKEN}`,
      },
      body: JSON.stringify({
        model: RELAY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data: ChatResponse = await response.json();
    return data.choices[0]?.message?.content || mockChatResponse(question, records);
  } catch {
    return mockChatResponse(question, records);
  }
}

export function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    work: "工作",
    meeting: "会议",
    study: "学习",
    communication: "沟通",
    life: "生活",
    other: "其他",
  };
  return labels[category] || "其他";
}

export const CATEGORY_COLORS: Record<string, string> = {
  work: "var(--accent)",
  meeting: "var(--warning)",
  study: "var(--success)",
  communication: "#378ADD",
  life: "#D4537E",
  other: "var(--text-tertiary)",
};

function groupRecordsByDate(records: Array<{ date: string; content: string; created_at: string; user_followup_reply?: string | null; category?: string }>): Record<string, typeof records> {
  return records.reduce((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {} as Record<string, typeof records>);
}

function mockResponse(userMessage: string, step: string): string {
  if (step === "followup_reply") {
    const replies = ["好的，已记录！继续加油~", "收到，记下了！有进展随时聊~", "了解了，已记录！"];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  if (userMessage.length < 5) {
    const followups = ["能再具体说说吗？比如在做什么主题的事？", "是关于哪个项目的呀？", "有什么进展可以分享的吗？"];
    return followups[Math.floor(Math.random() * followups.length)];
  }
  return "好的，已记录！有新进展随时找我聊~";
}

/** 把 YYYY-MM-DD 字符串转成中文显示，如 "2026年8月15日" */
function formatDateToChinese(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

function mockReport(records: Array<{ content: string; created_at: string }>, date?: string): string {
  // 用传入的 date（records 对应的日期），不是「当前日期」
  const dateStr = date ? formatDateToChinese(date) : new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  const items = records.map((r) => `- ${r.content}`).join("\n");
  return `## ${dateStr} 工作日报\n\n### 主要工作\n\n${items}\n\n---\n_由 DailySnap 自动生成（AI 调用失败，重试中）_`;
}

function mockWeeklyReport(records: Array<{ content: string; date: string; created_at: string }>): string {
  const grouped = groupRecordsByDate(records);
  const summary = Object.entries(grouped).map(([date, items]) => `- ${date}：${items.length} 条记录`).join("\n");
  return `## 本周工作周报\n\n### 本周工作总结\n\n${summary}\n\n### 时间分布分析\n\n本周共记录 ${records.length} 条\n\n### 下周计划\n\n- 继续推进当前工作\n\n---\n_由 DailySnap 自动生成（未配置 AI，使用原始记录）_`;
}

function mockChatResponse(question: string, records: Array<{ content: string }>): string {
  return `基于你最近的 ${records.length} 条记录，我暂时无法给出精确分析（未配置 AI）。\n\n你的问题是：「${question}」\n\n配置 AI API Key 后，我可以帮你分析记录中的模式、统计时间分布、查询特定主题的记录等。`;
}

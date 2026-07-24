import { invoke } from "@tauri-apps/api/core";
import { getAllSettings } from "./db";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

/**
 * Call AI for conversational recording
 */
export async function aiChat(userMessage: string, step: string): Promise<string> {
  try {
    // Try Rust backend first
    const result = await invoke<string>("ai_chat", {
      userMessage,
      step,
    });
    return result;
  } catch {
    // Fallback: call API directly from frontend
    return await callAiDirect(userMessage, step);
  }
}

/**
 * Direct AI API call from frontend (fallback)
 */
async function callAiDirect(userMessage: string, step: string): Promise<string> {
  const settings = await getAllSettings();

  if (!settings.api_key) {
    // Return mock response if no API key
    return mockResponse(userMessage, step);
  }

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
    const baseUrl = settings.api_base_url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.api_key}`,
      },
      body: JSON.stringify({
        model: settings.model_name,
        messages,
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data: ChatResponse = await response.json();
    return data.choices[0]?.message?.content || mockResponse(userMessage, step);
  } catch {
    return mockResponse(userMessage, step);
  }
}

/**
 * Generate daily report from records
 */
export async function generateReport(records: Array<{ content: string; created_at: string; user_followup_reply?: string | null }>): Promise<string> {
  const settings = await getAllSettings();

  if (!settings.api_key) {
    return mockReport(records);
  }

  const recordsText = records
    .map((r) => {
      const time = r.created_at.substring(11, 16);
      let text = `[${time}] ${r.content}`;
      if (r.user_followup_reply) {
        text += ` (补充: ${r.user_followup_reply})`;
      }
      return text;
    })
    .join("\n");

  const systemPrompt = `你是一个工作日报生成助手。根据用户一天的碎片记录，生成结构化日报。

要求：
1. 合并相似的记录项
2. 按工作主题/项目分组（如果能看出多个项目的话）
3. 补充合理的描述（基于上下文推断）
4. 输出格式：Markdown，包含日期标题和分点列表
5. 语言风格：简洁专业，适合发给领导/团队
6. 不要编造用户没做过的事情

用户今日记录：
${recordsText}`;

  try {
    const baseUrl = settings.api_base_url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.api_key}`,
      },
      body: JSON.stringify({
        model: settings.model_name,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "请根据以上记录生成今日工作日报" },
        ],
        temperature: 0.5,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data: ChatResponse = await response.json();
    return data.choices[0]?.message?.content || mockReport(records);
  } catch {
    return mockReport(records);
  }
}

// --- Mock responses for development without API key ---

function mockResponse(userMessage: string, step: string): string {
  if (step === "followup_reply") {
    const replies = [
      "好的，已记录！继续加油~",
      "收到，记下了！有进展随时聊~",
      "了解了，已记录！",
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  // For first_reply
  if (userMessage.length < 5) {
    const followups = [
      "能再具体说说吗？比如在做什么主题的事？",
      "是关于哪个项目的呀？",
      "有什么进展可以分享的吗？",
    ];
    return followups[Math.floor(Math.random() * followups.length)];
  }

  return "好的，已记录！有新进展随时找我聊~";
}

function mockReport(records: Array<{ content: string; created_at: string }>): string {
  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const items = records.map((r) => `- ${r.content}`).join("\n");

  return `## ${today} 工作日报\n\n### 主要工作\n\n${items}\n\n---\n_由 DailySnap 自动生成（未配置 AI，使用原始记录）_`;
}

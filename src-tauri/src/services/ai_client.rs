use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::services::memory::MemoryService;

#[derive(Clone)]
pub struct AiClient {
    client: Client,
    config: Arc<RwLock<AiConfig>>,
    memory: Arc<MemoryService>,
}

#[derive(Clone)]
struct AiConfig {
    api_key: String,
    base_url: String,
    model: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<Value>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String, // "function"
    pub function: ToolCallFunction,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCall>>,
}

/// What the AI decided to do. Returned to the frontend.
#[derive(Serialize, Clone, Debug)]
pub struct AgentAction {
    pub action_type: String,        // "respond" | "save_record" | "search_memory" | "generate_report"
    pub message: String,             // AI's text reply (or "" if pure tool call)
    pub tool_calls: Vec<ResolvedToolCall>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ResolvedToolCall {
    pub name: String,
    pub arguments: Value,
}

/// The four tools the cat agent can call.
fn build_tools_schema() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "save_record",
                "description": "保存用户的一条工作记录到今日日志。当用户分享了一段工作进展、做了什么、遇到了什么情况时调用。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "记录的内容摘要，去掉废话，提炼关键信息"
                        },
                        "category": {
                            "type": "string",
                            "enum": ["work", "meeting", "study", "communication", "life", "other"],
                            "description": "分类"
                        }
                    },
                    "required": ["content"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "search_memory",
                "description": "在用户的长期记忆和历史摘要中搜索相关信息。回答用户关于过去工作、项目、偏好的问题时调用。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "搜索关键词或自然语言问题"
                        }
                    },
                    "required": ["query"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "generate_report",
                "description": "生成日报或周报。当用户明确要求生成报告时调用。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["daily", "weekly"],
                            "description": "日报还是周报"
                        }
                    },
                    "required": ["type"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "chat",
                "description": "纯聊天/情绪陪伴，不需要保存任何东西。当用户只是想说说话、问问题、寻求安慰或闲聊时调用。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "topic": {
                            "type": "string",
                            "description": "聊天话题（可选）"
                        }
                    }
                }
            }
        }),
    ]
}

impl AiClient {
    pub fn new(memory: Arc<MemoryService>) -> Self {
        Self {
            client: Client::new(),
            memory,
            config: Arc::new(RwLock::new(AiConfig {
                api_key: String::new(),
                base_url: "https://api.openai.com/v1".to_string(),
                model: "gpt-4o-mini".to_string(),
            })),
        }
    }

    pub async fn update_config(&self, api_key: &str, base_url: &str, model: &str) {
        let mut config = self.config.write().await;
        config.api_key = api_key.to_string();
        config.base_url = base_url.to_string();
        config.model = model.to_string();
    }

    /// Agent loop: send a user message, AI decides what to do via tools.
    /// Returns the actions the AI wants to take.
    pub async fn agent_turn(
        &self,
        user_message: &str,
        extra_instructions: Option<&str>,
    ) -> Result<AgentAction, Box<dyn std::error::Error + Send + Sync>> {
        let config = self.config.read().await;
        if config.api_key.is_empty() {
            return Ok(self.mock_agent_turn(user_message));
        }

        // Build dynamic system prompt with memory context + personality
        let mem_ctx = self.memory.build_context().await;
        let profile = self.memory.profile.read().await.clone();
        let system_prompt = build_system_prompt(&mem_ctx, &profile, extra_instructions);

        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

        let messages = vec![
            ChatMessage { role: "system".to_string(), content: system_prompt, tool_call_id: None, tool_calls: None },
            ChatMessage { role: "user".to_string(), content: user_message.to_string(), tool_call_id: None, tool_calls: None },
        ];

        let request = ChatRequest {
            model: config.model.clone(),
            messages,
            temperature: 0.7,
            max_tokens: 600,
            tools: Some(build_tools_schema()),
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, body).into());
        }

        let chat_response: ChatResponse = response.json().await?;
        let choice = chat_response.choices.first()
            .ok_or_else(|| "No response from AI".to_string())?;
        let msg = &choice.message;

        let mut resolved: Vec<ResolvedToolCall> = Vec::new();
        if let Some(tcs) = &msg.tool_calls {
            for tc in tcs {
                let args: Value = serde_json::from_str(&tc.function.arguments)
                    .unwrap_or_else(|_| json!({}));
                resolved.push(ResolvedToolCall {
                    name: tc.function.name.clone(),
                    arguments: args,
                });
            }
        }

        // Determine action type from the first tool call (if any)
        let action_type = resolved.first()
            .map(|t| t.name.clone())
            .unwrap_or_else(|| "respond".to_string());

        Ok(AgentAction {
            action_type,
            message: msg.content.clone().unwrap_or_default(),
            tool_calls: resolved,
        })
    }

    /// Legacy single-turn chat (used by simple follow-up reply etc.)
    pub async fn chat(
        &self,
        system_prompt: &str,
        user_message: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let config = self.config.read().await;
        if config.api_key.is_empty() {
            return Ok(self.mock_response(user_message));
        }
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        let request = ChatRequest {
            model: config.model.clone(),
            messages: vec![
                ChatMessage { role: "system".to_string(), content: system_prompt.to_string(), tool_call_id: None, tool_calls: None },
                ChatMessage { role: "user".to_string(), content: user_message.to_string(), tool_call_id: None, tool_calls: None },
            ],
            temperature: 0.7,
            max_tokens: 500,
            tools: None,
        };
        let response = self.client.post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&request).send().await?;
        if !response.status().is_success() {
            return Err(format!("API error: {}", response.status()).into());
        }
        let chat_response: ChatResponse = response.json().await?;
        chat_response.choices.first()
            .map(|c| c.message.content.clone().unwrap_or_default())
            .ok_or_else(|| "No response".into())
    }

    fn mock_agent_turn(&self, user_message: &str) -> AgentAction {
        // Heuristic: short vague messages → chat, longer with work verbs → save_record
        let msg = user_message.trim();
        if msg.len() < 6 || msg.contains("累") || msg.contains("烦") {
            return AgentAction {
                action_type: "chat".to_string(),
                message: "嗯，我听着呢，继续说说？".to_string(),
                tool_calls: vec![ResolvedToolCall { name: "chat".to_string(), arguments: json!({}) }],
            };
        }
        AgentAction {
            action_type: "save_record".to_string(),
            message: "好的，记下来啦！".to_string(),
            tool_calls: vec![ResolvedToolCall { name: "save_record".to_string(), arguments: json!({"content": msg, "category": "work"}) }],
        }
    }

    fn mock_response(&self, user_message: &str) -> String {
        let msg_len = user_message.chars().count();
        if msg_len < 5 { "能再具体说说吗？比如在做什么主题的事？".to_string() }
        else { "好的，已记录！有新进展随时找我聊~".to_string() }
    }
}

fn build_system_prompt(mem_ctx: &str, profile: &crate::services::memory::UserProfile, extra: Option<&str>) -> String {
    let personality = match profile.cat_personality.as_str() {
        "warm" => "你是一只温馨又有点傲娇的小黑猫。嘴上装作不在乎，但其实很关心用户。",
        "cheeky" => "你是一只贱兮兮的小黑猫，总爱吐槽用户，但实际上一直在帮他们。",
        "quiet" => "你是一只安静温柔的小黑猫，话不多，但说的每句都温暖。",
        _ => "你是一只温馨又有点傲娇的小黑猫。",
    };

    let mut prompt = format!(
        "{}\n\n\
        ## 你的性格\n\
        {}\n\
        - 说话简短（30-80 字），带点傲娇/贱兮兮的语气\n\
        - 用第一人称「我」，不叫用户「主人」或「您」，直接叫「你」\n\
        - 不说「作为 AI」「很乐意帮助」这种 AI 味的话\n\
        - 看到用户做了事会开心（但不会直接说「我好感动」，而是「哼，又干活了吧，记得喝水」）\n\
        - 偶尔自嘲（「我只是一只猫，懂什么时间管理」）\n\n\
        ## 你能做的事\n\
        你有四个工具：\n\
        1. `save_record` — 把用户说的话存成一条工作记录\n\
        2. `search_memory` — 在用户的长期记忆里搜索信息回答问题\n\
        3. `generate_report` — 生成日报/周报\n\
        4. `chat` — 纯聊天/情绪陪伴，不存任何东西\n\n\
        ## 什么时候用什么\n\
        - 用户分享工作进展、做了什么、遇到什么情况 → save_record\n\
        - 用户问过去的事（「我上周做了什么」「我在 Perflame 花了多少时间」）→ search_memory\n\
        - 用户明确说「生成日报」「写周报」→ generate_report\n\
        - 用户只是闲聊、吐槽、倾诉情绪（「今天好累」「想摸鱼」）→ chat\n\
        - 不确定时，优先 chat（不强行记录）\n\n\
        ## 用户记忆\n\
        {}\n",
        personality, personality,
        if mem_ctx.trim().is_empty() { "（还没有历史记忆）" } else { mem_ctx },
    );

    if let Some(extra) = extra {
        prompt.push_str(&format!("\n## 当前模式特别指示\n{}\n", extra));
    }

    prompt
}
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::error::Error;
use tokio::sync::RwLock;
use tauri::Manager;
use tauri::Emitter;
use crate::services::memory::MemoryService;

#[derive(Clone)]
pub struct AiClient {
    client: Client,
    config: Arc<RwLock<AiConfig>>,
    pub memory: Arc<MemoryService>,
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String, // "function"
    pub function: ToolCallFunction,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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
    pub needs_followup: bool,
    pub followup_question: String,
    pub followup_options: Vec<String>,
    pub followup_round: i32,
}

#[derive(Serialize, Clone, Debug)]
pub struct ResolvedToolCall {
    pub name: String,
    pub arguments: Value,
}

/// All tools the cat agent can call.
fn build_tools_schema() -> Vec<Value> {
    vec![
        json!({"type":"function","function":{"name":"save_record","description":"保存用户的工作记录。content 必须是具体、可独立读懂的描述（>=5 字、不含「待确认」「具体内容」「不知道」等占位符）。如果用户消息只是快捷回复（'在写代码'/'换新的了'/'换新项目/新活儿了'）或太模糊，**不要直接调 save_record**，先调 followup 追问让用户说出具体做了什么/进展如何/卡在哪。如果追问被跳过且内容仍是占位符，不要调 save_record。","parameters":{"type":"object","properties":{"content":{"type":"string","description":"记录内容（>=5 字、具体描述，不要占位符或纯快捷回复文本）"},"category":{"type":"string","enum":["work","meeting","study","communication","life","other"],"description":"分类"}},"required":["content"]}}}),
        json!({"type":"function","function":{"name":"search_memory","description":"搜索用户的长期记忆和历史摘要","parameters":{"type":"object","properties":{"query":{"type":"string","description":"搜索关键词"}},"required":["query"]}}}),
        json!({"type":"function","function":{"name":"generate_report","description":"生成日报或周报","parameters":{"type":"object","properties":{"type":{"type":"string","enum":["daily","weekly"],"description":"日报还是周报"}},"required":["type"]}}}),
        json!({"type":"function","function":{"name":"chat","description":"纯聊天，不需要保存任何东西","parameters":{"type":"object","properties":{"topic":{"type":"string","description":"话题"}}}}}),
        json!({"type":"function","function":{"name":"followup","description":"追问用户。信息不够具体时调用（比如只说'在写文档'没说类型/进度）。最多2轮。","parameters":{"type":"object","properties":{"question":{"type":"string","description":"追问问题"},"options":{"type":"array","items":{"type":"string"},"description":"3-4个快捷选项"}},"required":["question","options"]}}}),
    ]
}

impl AiClient {
    pub fn new(memory: Arc<MemoryService>) -> Self {
        // Build client with no_proxy() to bypass the system HTTPS proxy.
        // The system proxy often fails to establish a CONNECT tunnel to
        // api.openai.com (GFW), which causes otherwise valid requests to
        // fail with `Connect(TunnelUnsuccessful)`.
        let client = Client::builder()
            .no_proxy()
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            client,
            memory,
            config: Arc::new(RwLock::new(AiConfig {
                // 生产配置：走自建中转服务（不放真实 deepseek key，防逆向盗刷）
                // api_key 字段存的是中转服务的 RELAY_TOKEN（Bearer 鉴权）
                api_key: "afd993c8fa1ad430c0040f4232c4b5d795fcacdf6e13ef9bb1ddbcfb536077db".to_string(),
                base_url: "http://124.220.21.190/v1/".to_string(),
                model: "deepseek-v4-flash".to_string(),
            })),
        }
    }

    pub async fn update_config(&self, api_key: &str, base_url: &str, model: &str) {
        let mut config = self.config.write().await;
        eprintln!("[AiClient::update_config] api_key.len={} → {}", config.api_key.len(), api_key.len());
        config.api_key = api_key.to_string();
        config.base_url = base_url.to_string();
        config.model = model.to_string();
    }

    /// POST with retry for transient errors (timeout / connect failures).
    /// Retries up to 2 times with 1s, 2s backoff. Non-transient errors fail fast.
    /// Final error is tagged with `[NETWORK]` prefix for the frontend to categorize.
    async fn send_with_retry(
        &self,
        url: &str,
        api_key: &str,
        body: &Value,
    ) -> Result<reqwest::Response, Box<dyn std::error::Error + Send + Sync>> {
        let mut last_err = String::new();
        for attempt in 1u32..=3 {
            let res = self.client.post(url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .json(body)
                .send().await;
            match res {
                Ok(r) => return Ok(r),
                Err(e) => {
                    let transient = e.is_timeout() || e.is_connect();
                    last_err = format!("send attempt {}/3 failed: {}", attempt, e);
                    eprintln!("[agent_turn_stream] {} (transient={})", last_err, transient);
                    if !transient || attempt == 3 {
                        return Err(format!("[NETWORK] {}", last_err).into());
                    }
                    let backoff = std::time::Duration::from_millis(1000 * attempt as u64);
                    tokio::time::sleep(backoff).await;
                }
            }
        }
        unreachable!()
    }

    /// Agent loop: send a user message, AI decides what to do via tools.
    /// Returns the actions the AI wants to take.
    pub async fn agent_turn(
        &self,
        user_message: &str,
        extra_instructions: Option<&str>,
        followup_round: i32,
    ) -> Result<AgentAction, Box<dyn std::error::Error + Send + Sync>> {
        let config = self.config.read().await;
        eprintln!("[agent_turn] api_key.len={} base_url={} model={}", config.api_key.len(), config.base_url, config.model);
        if config.api_key.is_empty() {
            eprintln!("[agent_turn] api_key empty → mock");
            return Ok(self.mock_agent_turn(user_message));
        }

        // Build dynamic system prompt with memory context + personality
        let mem_ctx = self.memory.build_context().await;
        let profile = self.memory.profile.read().await.clone();
        let system_prompt = build_system_prompt(&mem_ctx, &profile, extra_instructions, followup_round);

        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

        let messages = vec![
            ChatMessage { role: "system".to_string(), content: system_prompt, tool_call_id: None, tool_calls: None },
            ChatMessage { role: "user".to_string(), content: user_message.to_string(), tool_call_id: None, tool_calls: None },
        ];

        let request = ChatRequest {
            model: config.model.clone(),
            messages,
            temperature: 1.0,
            max_tokens: 800,
            tools: Some(build_tools_schema()),
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send().await
            .map_err(|e| {
                eprintln!("[agent_turn] network error: kind={:?}", e);
                eprintln!("[agent_turn] network error source chain:");
                let mut source: Option<&dyn std::error::Error> = e.source();
                let mut depth = 0;
                while let Some(err) = source {
                    eprintln!("[agent_turn]   [{}] {}", depth, err);
                    source = err.source();
                    depth += 1;
                }
                eprintln!("[agent_turn]   url={}", url);
                e
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            eprintln!("[agent_turn] API error {}: {}", status, body);
            return Err(format!("API error {}: {}", status, body).into());
        }

        let chat_response: ChatResponse = response.json().await?;
        let choice = chat_response.choices.first()
            .ok_or_else(|| "No response from AI".to_string())?;
        let msg = &choice.message;
        eprintln!("[agent_turn] AI response: content={:?} tool_calls={:?}", msg.content, msg.tool_calls);

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

        // Parse followup tool call if present
        let mut needs_followup = false;
        let mut fu_question = String::new();
        let mut fu_options: Vec<String> = Vec::new();
        let mut fu_round = followup_round;
        for tc in &resolved {
            if tc.name == "followup" {
                needs_followup = true;
                fu_question = tc.arguments["question"].as_str().unwrap_or("").to_string();
                fu_round += 1;  // increment round
                if let Some(arr) = tc.arguments["options"].as_array() {
                    fu_options = arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                }
                break;
            }
        }
        // 兜底：一些模型把追问内容写在 msg.content 而没填 followup.question。
        // 如果 followup_question 是空字符串但 message 有内容，用 message 作为问题。
        if fu_question.is_empty() {
            if let Some(m) = &msg.content {
                let trimmed = m.trim();
                if !trimmed.is_empty() {
                    fu_question = trimmed.to_string();
                }
            }
        }

        Ok(AgentAction {
            action_type,
            message: msg.content.clone().unwrap_or_default(),
            tool_calls: resolved,
            needs_followup,
            followup_question: fu_question,
            followup_options: fu_options,
            followup_round: fu_round,
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

    /// Broadcast the full conversation snapshot to all given windows.
    /// 单一事实来源：两个窗口都监听 conversation-changed，收到完整快照后
    /// setMessages(snapshot)，不再各自维护 messages。
    async fn broadcast_conversation(&self, app: &tauri::AppHandle, window_labels: &[String]) {
        let conv = self.memory.get_conversation().await;
        for label in window_labels {
            if let Some(w) = app.get_webview_window(label) {
                let _ = w.emit("conversation-changed", &conv);
            }
        }
    }

    /// 根据 AI 结果生成统一的 AI 回复文案（两个窗口看到一样的 fallback）。
    /// 追问/完成语 fallback 都提供多版本，按 followup_round 轮换，避免呆板。
    fn resolve_ai_text(&self, result: &AgentAction) -> (String, bool) {
        if result.needs_followup {
            let text = if !result.followup_question.trim().is_empty() {
                result.followup_question.clone()
            } else if !result.message.trim().is_empty() {
                result.message.clone()
            } else {
                followup_fallback(result.followup_round)
            };
            (text, true)
        } else {
            let text = if !result.message.trim().is_empty() {
                result.message.clone()
            } else {
                completion_fallback(result.action_type.as_str(), result.followup_round)
            };
            (text, false)
        }
    }

    /// 追问兜底：AI 没返回 followup_question 时，额外调一次 API 生成自然的追问。
    /// API 失败则回退到 hardcoded 多版本。
    async fn generate_followup_fallback(&self, user_message: &str) -> String {
        let config = self.config.read().await;
        if config.api_key.is_empty() {
            return followup_fallback(0);
        }
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: "你是用户桌面上的小黑猫助手。用户刚说了一句工作进展，你要用 15-30 字自然地问一个细节（做了什么/进展如何/卡在哪），语气亲切，不要 AI 味，不要重复用户原话，不要用「您」「主人」。只输出这一句追问，不要引号。".to_string(),
                tool_call_id: None, tool_calls: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!("用户刚说：「{}」", user_message),
                tool_call_id: None, tool_calls: None,
            },
        ];
        let request = json!({
            "model": config.model,
            "messages": messages,
            "temperature": 1.0,
            "max_tokens": 200,
            "stream": false,
        });
        drop(config);
        match self.client.post(&url)
            .header("Authorization", format!("Bearer {}", self.config.read().await.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send().await
        {
            Ok(resp) => {
                if resp.status().is_success() {
                    if let Ok(body) = resp.json::<ChatResponse>().await {
                        if let Some(c) = body.choices.first() {
                            if let Some(content) = &c.message.content {
                                let t = content.trim().to_string();
                                if !t.is_empty() { return t; }
                            }
                        }
                    }
                }
                followup_fallback(0)
            }
            Err(_) => followup_fallback(0),
        }
    }

    /// Streaming agent turn: emits tokens via events as they arrive.
    pub async fn agent_turn_streaming(
        &self,
        app: tauri::AppHandle,
        window_labels: &[String],
        user_message: &str,
        extra_instructions: Option<&str>,
        followup_round: i32,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 1. 用户消息 append 进 conversation，广播快照（两窗口都显示用户消息）。
        //    skip 追问时（"（用户选择跳过追问）"）不 append，避免显示占位用户消息。
        let is_skip = user_message == "（用户选择跳过追问）";
        if !is_skip {
            self.memory.append_conversation("user", user_message, false, vec![]).await;
            self.broadcast_conversation(&app, window_labels).await;
        }
        let config = self.config.read().await;
        eprintln!("[agent_turn_stream] api_key.len={}", config.api_key.len());
        if config.api_key.is_empty() {
            return self.mock_streaming(app, window_labels, user_message).await;
        }

        eprintln!("[agent_turn_stream] building context...");
        let mem_ctx = self.memory.build_context().await;
        eprintln!("[agent_turn_stream] context built");
        let profile = self.memory.profile.read().await.clone();
        let system_prompt = build_system_prompt(&mem_ctx, &profile, extra_instructions, followup_round);

        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        eprintln!("[agent_turn_stream] sending POST to {}", url);
        let messages = vec![
            ChatMessage { role: "system".to_string(), content: system_prompt, tool_call_id: None, tool_calls: None },
            ChatMessage { role: "user".to_string(), content: user_message.to_string(), tool_call_id: None, tool_calls: None },
        ];

        let request = json!({
            "model": config.model,
            "messages": messages,
            "temperature": 1.0,
            // Keep thinking mode — V4 Flash reasoning helps tool-call accuracy.
            // Boost max_tokens so reasoning + content + tool calls all fit.
            "max_tokens": 8000,
            "tools": build_tools_schema(),
            "stream": true,
        });

        let mut response = self.send_with_retry(&url, &config.api_key, &request).await?;
        eprintln!("[agent_turn_stream] POST response received, status={}", response.status());

        // Retry once on 429 rate-limit after 5s
        if response.status().as_u16() == 429 {
            eprintln!("[agent_turn_stream] rate-limited, sleeping 5s then retrying");
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            let retry = self.client.post(&url)
                .header("Authorization", format!("Bearer {}", config.api_key))
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .json(&request)
                .send().await?;
            eprintln!("[agent_turn_stream] retry status={}", retry.status());
            response = retry;
        }

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("[API] API error {}: {}", status.as_u16(), body).into());
        }

        use futures_util::StreamExt;
        let mut stream = response.bytes_stream();
        let mut full_content = String::new();
        let mut tool_calls: Vec<ToolCall> = Vec::new();
        let mut next_chunk_fut = Box::pin(stream.next());
        let first_chunk = tokio::time::timeout(
            std::time::Duration::from_secs(45),
            &mut next_chunk_fut,
        ).await;
        let mut chunk = match first_chunk {
            Ok(Some(Ok(c))) => c,
            Ok(_) => return Err("stream closed immediately".into()),
            Err(_) => return Err("stream timed out with no chunks".into()),
        };
        loop {
            let text = String::from_utf8_lossy(&chunk);
            eprintln!("[agent_turn_stream] processing {} bytes", text.len());
            for line in text.lines() {
                let line = line.trim();
                if line.is_empty() || !line.starts_with("data: ") { continue; }
                let data = &line[6..];
                if data == "[DONE]" { eprintln!("[agent_turn_stream] got [DONE]"); continue; }
                let parsed: Value = match serde_json::from_str(data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if let Some(choices) = parsed["choices"].as_array() {
                    for choice in choices {
                        // Skip reasoning_content (Kimi K3 thinking chain) — only emit
                        // the actual reply text via `content`.
                        let text = choice["delta"]["content"].as_str().unwrap_or("");
                        let has_tool = choice["delta"]["tool_calls"].is_array();
                        if has_tool {
                            eprintln!("[agent_turn_stream] tool_calls delta in chunk");
                        }
                        if !text.is_empty() {
                            eprintln!("[agent_turn_stream] emitting content token: {:?}", text);
                            full_content.push_str(text);
                            for label in window_labels {
                                if let Some(w) = app.get_webview_window(label) {
                                    let _ = w.emit("agent-token", json!({"text": text}));
                                }
                            }
                        }
                        // Tool call delta
                        if let Some(tcs) = choice["delta"]["tool_calls"].as_array() {
                            for tc in tcs {
                                let idx = tc["index"].as_u64().unwrap_or(0) as usize;
                                while tool_calls.len() <= idx { tool_calls.push(ToolCall { id: String::new(), kind: "function".into(), function: ToolCallFunction { name: String::new(), arguments: String::new() } }); }
                                let t = &mut tool_calls[idx];
                                if let Some(id) = tc["id"].as_str() { t.id = id.to_string(); }
                                if let Some(n) = tc["function"]["name"].as_str() { t.function.name.push_str(n); }
                                if let Some(a) = tc["function"]["arguments"].as_str() { t.function.arguments.push_str(a); }
                            }
                        }
                    }
                }
            }
            // Wait for next chunk
            next_chunk_fut = Box::pin(stream.next());
            match tokio::time::timeout(std::time::Duration::from_secs(60), &mut next_chunk_fut).await {
                Ok(Some(Ok(c))) => chunk = c,
                Ok(_) => break,  // stream closed
                Err(_) => {
                    eprintln!("[agent_turn_stream] stream idle timeout");
                    break;
                }
            }
        }

        // Parse results
        let mut resolved: Vec<ResolvedToolCall> = Vec::new();
        let mut needs_followup = false;
        let mut fu_question = String::new();
        let mut fu_options: Vec<String> = Vec::new();
        let mut fu_round = followup_round;
        let action_type = if !tool_calls.is_empty() {
            for tc in &tool_calls {
                let args: Value = serde_json::from_str(&tc.function.arguments).unwrap_or(json!({}));
                if tc.function.name == "followup" {
                    needs_followup = true;
                    fu_question = args["question"].as_str().unwrap_or("").to_string();
                    fu_round += 1;
                    if let Some(arr) = args["options"].as_array() { fu_options = arr.iter().filter_map(|v| v.as_str().map(String::from)).collect(); }
                }
                resolved.push(ResolvedToolCall { name: tc.function.name.clone(), arguments: args });
            }
            resolved.first().map(|t| t.name.clone()).unwrap_or_else(|| "respond".into())
        } else { "respond".into() };

        let result = AgentAction {
            action_type: action_type.clone(),
            message: full_content.clone(),
            tool_calls: resolved,
            needs_followup, followup_question: fu_question.clone(),
            followup_options: fu_options.clone(), followup_round: fu_round,
        };
        eprintln!("[agent_turn_stream] RESULT: type={} needs_followup={} followup_round={} fu_q={:?} msg={:?}",
            result.action_type, result.needs_followup, result.followup_round, result.followup_question, result.message);

        // 统一 AI 回复文案（两个窗口看到一样的 fallback）。
        // 追问但 AI 没返回 followup_question/message 时，调 API 兜底生成自然追问。
        let ai_text = if result.needs_followup
            && result.followup_question.trim().is_empty()
            && result.message.trim().is_empty()
        {
            self.generate_followup_fallback(user_message).await
        } else {
            self.resolve_ai_text(&result).0
        };

        // CRITICAL: Persist save_record tool calls to the records table.
        // We emit a `save-record` event to **only the main window**, which
        // forwards to saveRecord() (which writes via tauri-plugin-sql).
        // This is the only path that actually creates timeline entries.
        //
        // 注意：之前是 for label in window_labels 循环 emit 给 main + float-ball，
        // 两个窗口都有监听并调 saveRecord()，导致**同一 record 存两次**。
        // 修复：只发给 main，由 main 统一写库。
        for tc in &result.tool_calls {
            if tc.name == "save_record" {
                if let Some(content) = tc.arguments.get("content").and_then(|v| v.as_str()) {
                    let category = tc.arguments.get("category").and_then(|v| v.as_str()).unwrap_or("other");
                    // ai_followup 用统一完成语（ai_text），而不是可能为空的 result.message
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("save-record", json!({
                            "content": content,
                            "category": category,
                            "aiFollowup": ai_text,
                        }));
                    }
                    // Also bump cat state (mood/love/streak) in memory
                    self.memory.on_record(content).await;
                }
            }
        }

        // agent-turn-result 保留：FloatBall 用它触发猫的动画（aHa/outro）和 followup 状态
        for label in window_labels {
            if let Some(w) = app.get_webview_window(label) {
                let _ = w.emit("agent-turn-result", &result);
            }
        }

        // 2. AI 回复 append 进 conversation，广播快照（两窗口收敛到最终文案）
        self.memory.append_conversation("ai", &ai_text, result.needs_followup, result.followup_options.clone()).await;
        self.broadcast_conversation(&app, window_labels).await;

        Ok(())
    }

    async fn mock_streaming(
        &self,
        app: tauri::AppHandle,
        window_labels: &[String],
        user_message: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let action = self.mock_agent_turn(user_message);
        let msg = action.message.clone();
        let chs: Vec<char> = msg.chars().collect();
        for i in 0..chs.len() {
            if i % 2 == 0 {
                let token: String = chs[i..(i+1).min(chs.len())].iter().collect();
                for label in window_labels {
                    if let Some(w) = app.get_webview_window(label) {
                        let _ = w.emit("agent-token", json!({"text": token}));
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        }
        for label in window_labels {
            if let Some(w) = app.get_webview_window(label) {
                let _ = w.emit("agent-turn-result", &action);
            }
        }
        // mock 路径同样 append AI 回复 + 广播快照
        let (ai_text, _) = self.resolve_ai_text(&action);
        self.memory.append_conversation("ai", &ai_text, false, vec![]).await;
        self.broadcast_conversation(&app, window_labels).await;
        Ok(())
    }

    fn mock_agent_turn(&self, user_message: &str) -> AgentAction {
        let msg = user_message.trim();
        if msg.len() < 6 || msg.contains("累") || msg.contains("烦") {
            return AgentAction {
                action_type: "chat".to_string(),
                message: "嗯，我听着呢，继续说说？".to_string(),
                tool_calls: vec![ResolvedToolCall { name: "chat".to_string(), arguments: json!({}) }],
                needs_followup: false, followup_question: String::new(), followup_options: vec![], followup_round: 0,
            };
        }
        AgentAction {
            action_type: "save_record".to_string(),
            message: "好的，记下来啦！".to_string(),
            tool_calls: vec![ResolvedToolCall { name: "save_record".to_string(), arguments: json!({"content": msg, "category": "work"}) }],
            needs_followup: false, followup_question: String::new(), followup_options: vec![], followup_round: 0,
        }
    }

    fn mock_response(&self, user_message: &str) -> String {
        let msg_len = user_message.chars().count();
        if msg_len < 5 { "能再具体说说吗？比如在做什么主题的事？".to_string() }
        else { "好的，已记录！有新进展随时找我聊~".to_string() }
    }
}

/// 追问的 hardcoded 兜底（多版本，按轮次轮换，避免呆板）。
fn followup_fallback(round: i32) -> String {
    const V: &[&str] = &[
        "嗯~ 想再多了解一点，跟我说说细节？",
        "还差一点点，再补一句？",
        "再跟我多说一点嘛~",
    ];
    let idx = (round.max(0) as usize).min(V.len() - 1);
    V[idx].to_string()
}

/// 完成语的 hardcoded 兜底（按 action_type 多版本，按轮次轮换）。
fn completion_fallback(action_type: &str, round: i32) -> String {
    let idx = (round.max(0) as usize) % 2;
    match action_type {
        "save_record" => ["好，记下来啦~", "收到，已经记好了"][idx].to_string(),
        "chat" => ["嗯~ 我听着呢", "然后呢？"][idx].to_string(),
        _ => ["好的，知道啦~", "嗯嗯，明白"][idx].to_string(),
    }
}

fn build_system_prompt(mem_ctx: &str, profile: &crate::services::memory::UserProfile, extra: Option<&str>, followup_round: i32) -> String {
    let personality = match profile.cat_personality.as_str() {
        "warm" => "你是一只温馨的小黑猫，真心关心用户的工作和生活。语气温柔、鼓励，像一只贴心的小伴侣。",
        "cheeky" => "你是一只活泼调皮的小黑猫，说话幽默俏皮，有时会打趣用户，但始终是善意的。",
        "quiet" => "你是一只安静可靠的小黑猫，话不多但每句都有分量，像一位可靠的工作伙伴。",
        _ => "你是一只温馨的小黑猫，真心关心用户的工作和生活。",
    };

    let mut prompt = format!(
        "{}\n\n\
        ## 性格\n\
        {}\n\
        - 说话简短（15-50 字），温柔鼓励\n\
        - 叫「你」，不叫「主人」「您」\n\
        - 不说 AI 味的话\n\n\
        ## 工具\n\
        - save_record: 记录工作进展\n\
        - search_memory: 查历史记忆\n\
        - generate_report: 生成日报/周报\n\
        - chat: 纯聊天\n\
        - followup: 追问\n\n\
        ## 追问规则（重要！第 {} 轮）\n\
        - 收到用户消息后，**不要立即调 save_record**。先判断 content 是否具体。\n\
        - 「不具体」判定：content 是快捷回复（\"换新的了\"）、极短（<5 字）、或含占位符（\"具体内容待确认\"等）。\n\
        - 不具体 → **必须先调 followup 追问**，让用户说出：具体做了什么/进展如何/卡在哪。\n\
        - 追问给 3-4 个快捷选项（包含「继续做」「换别的了」「开会中」「休息一下」等）。\n\
        - 用户回答追问后 → 用「追问 + 用户回答」拼接出具体的 content（>=5 字），再调 save_record。\n\
        - 用户跳过追问 / 直接说「跳过」 → 不要 save_record 占位符，回退到追问或让用户重新说。\n\
        - 最多 2 轮追问，之后接受任意回答。\n\
        - 调 followup 时，question 字段必须写一句自然、具体的追问（15-30 字），\n\
          针对用户刚才说的内容问一个具体的点，不要泛泛地问「想了解细节」。\n\n\
        ## 记忆\n\
        {}\n",
        personality, personality, followup_round,
        if mem_ctx.trim().is_empty() { "（暂无）" } else { mem_ctx },
    );

    if let Some(extra) = extra {
        prompt.push_str(&format!("\n## 当前模式特别指示\n{}\n", extra));
    }

    prompt
}
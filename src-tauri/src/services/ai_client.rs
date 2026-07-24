use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AiClient {
    client: Client,
    config: Arc<RwLock<AiConfig>>,
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
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChatMessage,
}

impl AiClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
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

    pub async fn chat(&self, system_prompt: &str, user_message: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let config = self.config.read().await;

        if config.api_key.is_empty() {
            // Return mock response when no API key
            return Ok(self.mock_response(user_message));
        }

        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

        let request = ChatRequest {
            model: config.model.clone(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: user_message.to_string(),
                },
            ],
            temperature: 0.7,
            max_tokens: 500,
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, body).into());
        }

        let chat_response: ChatResponse = response.json().await?;
        
        chat_response
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .ok_or_else(|| "No response from AI".into())
    }

    fn mock_response(&self, user_message: &str) -> String {
        // Simple mock for development without API key
        let msg_len = user_message.chars().count();
        if msg_len < 5 {
            "能再具体说说吗？比如在做什么主题的事？".to_string()
        } else {
            "好的，已记录！有新进展随时找我聊~".to_string()
        }
    }
}

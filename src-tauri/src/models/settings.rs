use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub reminder_start_time: String,
    pub report_generate_time: String,
    pub reminder_interval_minutes: i32,
    pub holiday_disable: bool,
    pub api_key: String,
    pub api_base_url: String,
    pub model_name: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            reminder_start_time: "09:30".to_string(),
            report_generate_time: "04:00".to_string(),
            reminder_interval_minutes: 120,
            holiday_disable: true,
            api_key: String::new(),
            api_base_url: "https://api.openai.com/v1".to_string(),
            model_name: "gpt-4o-mini".to_string(),
        }
    }
}

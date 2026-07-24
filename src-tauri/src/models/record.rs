use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Record {
    pub id: i64,
    pub content: String,
    pub ai_question: Option<String>,
    pub ai_followup: Option<String>,
    pub user_followup_reply: Option<String>,
    pub created_at: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailyReport {
    pub id: i64,
    pub date: String,
    pub content: String,
    pub record_ids: Option<String>,
    pub created_at: String,
}

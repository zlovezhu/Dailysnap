use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Record {
    pub id: Option<i64>,
    pub content: String,
    pub ai_question: Option<String>,
    pub ai_followup: Option<String>,
    pub user_followup_reply: Option<String>,
    pub created_at: Option<String>,
    pub date: Option<String>,
}

/// Save a new work record to the database
#[tauri::command]
pub async fn save_record(
    app: AppHandle,
    content: String,
    _ai_question: Option<String>,
    _ai_followup: Option<String>,
    _user_followup_reply: Option<String>,
) -> Result<(), String> {
    // Use tauri-plugin-sql via the frontend JS bridge
    // The actual SQL execution is handled by the plugin on the JS side
    // Here we just emit an event so the main window can refresh
    let _ = app.emit("new-record-saved", &content);
    Ok(())
}

/// Get all records for a specific date
#[tauri::command]
pub async fn get_records_by_date(
    _app: AppHandle,
    _date: String,
) -> Result<Vec<Record>, String> {
    // In the actual implementation, this queries the SQLite database
    // The tauri-plugin-sql handles this on the frontend side via JS
    // This command is a placeholder for the Rust-side logic
    Ok(vec![])
}

/// Generate a daily report using AI
#[tauri::command]
pub async fn generate_daily_report(
    _app: AppHandle,
    _date: String,
) -> Result<String, String> {
    // This will be called from the frontend which passes the records
    // For now return a placeholder - the real implementation uses ai_client
    Err("请从前端调用生成日报功能".to_string())
}

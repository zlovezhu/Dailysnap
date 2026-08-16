use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::services::scheduler;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub reminder_start_time: String,
    pub report_generate_time: String,
    pub reminder_interval_minutes: i32,
    pub holiday_disable: bool,
    pub api_key: String,
    pub api_base_url: String,
    pub model_name: String,
}

/// Get settings - frontend handles DB queries via tauri-plugin-sql JS SDK
/// This command is kept for potential Rust-side settings access
#[tauri::command]
pub async fn get_settings(_app: AppHandle) -> Result<AppSettings, String> {
    // Default settings - frontend will override with DB values
    Ok(AppSettings {
        reminder_start_time: "09:30".to_string(),
        report_generate_time: "04:00".to_string(),
        reminder_interval_minutes: 120,
        holiday_disable: true,
        api_key: String::new(),
        api_base_url: "https://api.openai.com/v1".to_string(),
        model_name: "gpt-4o-mini".to_string(),
    })
}

/// Update a setting - emits events for Rust-side scheduler to react
#[tauri::command]
pub async fn update_setting(
    app: AppHandle,
    key: String,
    value: String,
) -> Result<(), String> {
    scheduler::apply_runtime_setting(&key, &value);

    // Notify scheduler to refresh settings
    let _ = app.emit("settings-changed", ());

    // If API settings changed, notify AI client
    if key == "api_key" || key == "api_base_url" || key == "model_name" {
        let _ = app.emit("ai-settings-changed", ());
    }

    Ok(())
}

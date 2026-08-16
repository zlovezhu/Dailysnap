use tauri::{State, AppHandle, Manager, Emitter};
use crate::services::ai_client::{AiClient, AgentAction};
use crate::services::memory::UserProfile;
use serde::Serialize;

#[tauri::command]
pub async fn sync_ai_config(
    ai_client: State<'_, AiClient>,
    api_key: String,
    base_url: String,
    model: String,
) -> Result<(), String> {
    eprintln!("[sync_ai_config] api_key.len={} base_url={} model={}", api_key.len(), base_url, model);
    ai_client.update_config(&api_key, &base_url, &model).await;
    Ok(())
}

#[derive(Serialize)]
pub struct CatStateView {
    pub mood: i32,
    pub affinity: i32,
    pub love: i32,
    pub streak_days: i32,
    pub state_label: String,
}

#[tauri::command]
pub async fn agent_turn(
    ai_client: State<'_, AiClient>,
    user_message: String,
    mode: Option<String>,
    followup_round: Option<i32>,
) -> Result<AgentAction, String> {
    let extra = if mode.as_deref() == Some("onboarding") {
        Some(ONBOARDING_INSTRUCTIONS)
    } else { None };

    let round = followup_round.unwrap_or(0);
    let action = ai_client.agent_turn(&user_message, extra, round).await
        .map_err(|e| e.to_string())?;

    // Persist profile hints if onboarding
    if mode.as_deref() == Some("onboarding") {
        parse_onboarding_reply(&action.message, &ai_client.memory).await;
        if action.message.contains("[ONBOARDING_DONE]") {
            ai_client.memory.update_profile_field("onboarded", "true").await;
        }
    }

    // Apply save_record tool calls → bump cat state
    for tc in &action.tool_calls {
        if tc.name == "save_record" {
            if let Some(content) = tc.arguments.get("content").and_then(|v| v.as_str()) {
                ai_client.memory.on_record(content).await;
            }
        }
    }

    Ok(action)
}

#[tauri::command]
pub async fn agent_turn_stream(
    app: AppHandle,
    ai_client: State<'_, AiClient>,
    user_message: String,
    mode: Option<String>,
    followup_round: Option<i32>,
) -> Result<(), String> {
    let extra = if mode.as_deref() == Some("onboarding") {
        Some(ONBOARDING_INSTRUCTIONS)
    } else { None };
    let round = followup_round.unwrap_or(0);
    ai_client.agent_turn_streaming(app.clone(), &vec!["main".into(), "float-ball".into()], &user_message, extra, round).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cat_state(ai_client: State<'_, AiClient>) -> Result<CatStateView, String> {
    let s = ai_client.memory.cat_state.read().await.clone();
    let label = compute_state_label(s.mood, s.last_record_ts);
    Ok(CatStateView {
        mood: s.mood,
        affinity: s.affinity,
        love: s.love,
        streak_days: s.streak_days,
        state_label: label,
    })
}

#[tauri::command]
pub async fn mood_decay_tick(ai_client: State<'_, AiClient>) -> Result<(), String> {
    ai_client.memory.mood_decay_tick().await;
    Ok(())
}

#[tauri::command]
pub async fn update_profile(
    ai_client: State<'_, AiClient>,
    key: String,
    value: String,
) -> Result<(), String> {
    ai_client.memory.update_profile_field(&key, &value).await;
    Ok(())
}

#[tauri::command]
pub async fn get_profile(ai_client: State<'_, AiClient>) -> Result<serde_json::Value, String> {
    let p = ai_client.memory.profile.read().await.clone();
    Ok(serde_json::to_value(&p).unwrap_or(serde_json::json!({})))
}

#[tauri::command]
pub async fn get_conversation(ai_client: State<'_, AiClient>) -> Result<Vec<crate::services::memory::ConversationMessage>, String> {
    Ok(ai_client.memory.get_conversation().await)
}

#[tauri::command]
pub async fn get_conversation_days(ai_client: State<'_, AiClient>, days: usize) -> Result<Vec<crate::services::memory::ConversationDay>, String> {
    Ok(ai_client.memory.load_days(days).await)
}

#[tauri::command]
pub async fn get_conversation_before(ai_client: State<'_, AiClient>, before_date: String, days: usize) -> Result<Vec<crate::services::memory::ConversationDay>, String> {
    Ok(ai_client.memory.load_before(&before_date, days))
}

#[tauri::command]
pub async fn is_onboarded(ai_client: State<'_, AiClient>) -> Result<bool, String> {
    Ok(ai_client.memory.profile.read().await.onboarded)
}

#[tauri::command]
pub async fn complete_onboarding(
    ai_client: State<'_, AiClient>,
    data: crate::services::memory::OnboardingData,
) -> Result<(), String> {
    ai_client.memory.complete_onboarding(&data).await;
    Ok(())
}

#[tauri::command]
pub async fn get_memory_dir(ai_client: State<'_, AiClient>) -> Result<String, String> {
    Ok(ai_client.memory.memory_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn write_long_term(
    ai_client: State<'_, AiClient>,
    content: String,
) -> Result<(), String> {
    ai_client.memory.write_long_term(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_daily_summary(
    ai_client: State<'_, AiClient>,
    date: String,
    content: String,
) -> Result<(), String> {
    ai_client.memory.write_daily_summary(&date, &content).map_err(|e| e.to_string())
}

const ONBOARDING_INSTRUCTIONS: &str = r#"
【当前模式：初次见面 onboarding】
这是你和用户的第一次对话。请用自然的方式（不要问卷感），在多轮对话中了解以下信息：
1. 用户主要在做什么（职业/工作）
2. 当前在做什么项目
3. 希望多久被提醒一次记录
4. 喜欢用什么方式被打扰（弹窗/安静/不打扰）
5. 希望你（猫）是什么性格
6. 每天工作时间大概几点到几点

每轮只问 1 个，给出有温度的反应。问题自然嵌入对话中，不要连珠炮问。
当关键信息收集得差不多时，自然结束 onboarding，回复中包含 "[ONBOARDING_DONE]" 标记。
也可以调用 save_record 工具把用户说的话记下来。
回复格式：自然对话 + 适当 emoji + 偶尔的傲娇自嘲。"#;

fn compute_state_label(mood: i32, last_ts: i64) -> String {
    if last_ts == 0 { return "curious".to_string(); }
    let hours_since = (chrono::Local::now().timestamp() - last_ts) / 3600;
    if mood >= 80 && hours_since < 1 { "happy".to_string() }
    else if hours_since >= 4 { "sad".to_string() }
    else if hours_since >= 2 { "sleepy".to_string() }
    else if mood >= 40 { "calm".to_string() }
    else { "sad".to_string() }
}

async fn parse_onboarding_reply(text: &str, memory: &crate::services::memory::MemoryService) {
    let p = memory.profile.read().await.clone();

    if p.occupation.is_empty() && (
        text.contains("产品") || text.contains("开发") || text.contains("设计") ||
        text.contains("运营") || text.contains("研究") || text.contains("实习") ||
        text.contains("工程") || text.contains("经理") || text.contains("学生")
    ) {
        drop(p);
        memory.update_profile_field("occupation", "（通过对话推断，待确认）").await;
    }

    let p = memory.profile.read().await.clone();
    if p.current_project.is_empty() && text.contains("Perflame") {
        drop(p);
        memory.update_profile_field("current_project", "Perflame").await;
    }

    let _ = UserProfile::default(); // silence unused import warning
}
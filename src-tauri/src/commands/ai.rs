use tauri::State;
use crate::services::ai_client::AiClient;

#[tauri::command]
pub async fn ai_chat(
    ai_client: State<'_, AiClient>,
    user_message: String,
    step: String,
) -> Result<String, String> {
    let system_prompt = if step == "first_reply" {
        r#"你是一个友好的工作记录助手。用户被提醒记录当前工作状态。

规则：
1. 根据用户的回复，判断是否需要追问一个细节问题以丰富记录
2. 如果用户回复很简短（如"开会"），追问会议主题或结论
3. 如果用户回复已经足够详细（超过10个字且包含具体内容），回复"好的，已记录！有新进展随时找我聊~"
4. 如果用户表示不想聊/忙，回复"了解，已记录！"
5. 回复风格：轻松随意，像朋友聊天

注意：如果决定结束对话，回复中必须包含"已记录"或"记下了"这样的词。"#
    } else {
        r#"你是一个友好的工作记录助手。用户刚回答了你的追问。
现在请简短感谢并结束对话。回复中必须包含"已记录"或"记下了"。
回复风格：轻松随意，像朋友聊天。不超过20个字。"#
    };

    ai_client
        .chat(system_prompt, &user_message)
        .await
        .map_err(|e| e.to_string())
}

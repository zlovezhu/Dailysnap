use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::Local;

/// Cat states for the 养猫 system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatState {
    /// Mood on a 0-100 scale. Drops when user hasn't recorded for a while.
    pub mood: i32,
    /// Affinity grows with continued daily use. 0-100.
    pub affinity: i32,
    /// Love gained from each record action. 0-100.
    pub love: i32,
    /// Last record timestamp (Unix seconds).
    pub last_record_ts: i64,
    /// Consecutive days the user has recorded.
    pub streak_days: i32,
}

impl Default for CatState {
    fn default() -> Self {
        Self {
            mood: 60,
            affinity: 0,
            love: 0,
            last_record_ts: 0,
            streak_days: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub cat_name: String,           // 猫的名字（用户起的）
    pub occupation: String,
    pub current_project: String,
    pub reminder_interval_minutes: i32,
    pub interrupt_style: String,    // "popup" | "quiet" | "none"
    pub cat_personality: String,    // "warm" | "cheeky" | "quiet"
    pub workday_start: String,     // "HH:MM"（第一段的开始）
    pub workday_end: String,       // "HH:MM"（最后一段的结束）
    pub workdays: String,          // 工作日 "1,2,3,4,5"（周一=1，周日=7）
    pub workday_segments: String,  // 多段工作时间 "09:00-12:00,13:00-18:00"
    pub onboarded: bool,
}

impl Default for UserProfile {
    fn default() -> Self {
        Self {
            cat_name: "小猫".to_string(),
            occupation: String::new(),
            current_project: String::new(),
            reminder_interval_minutes: 120,
            interrupt_style: "popup".to_string(),
            cat_personality: "warm".to_string(),
            workday_start: "09:30".to_string(),
            workday_end: "18:00".to_string(),
            workdays: "1,2,3,4,5".to_string(),
            workday_segments: "09:00-12:00,13:00-18:00".to_string(),
            onboarded: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingData {
    pub cat_name: String,
    pub occupation: String,
    pub interrupt_style: String,      // "popup" | "quiet"
    pub reminder_interval_minutes: i32,
    pub cat_personality: String,      // "warm" | "cheeky" | "quiet"
    pub workday_start: String,        // "HH:MM"
    pub workday_end: String,          // "HH:MM"
    pub workdays: String,             // "1,2,3,4,5"
    pub workday_segments: String,     // "09:00-12:00,13:00-18:00"
}

/// 一条对话消息（窗口和桌面猫共享的单一事实来源）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessage {
    pub role: String,               // "user" | "ai"
    pub content: String,
    pub followup: bool,             // 是否为追问（AI 消息）
    #[serde(default)]
    pub followup_options: Vec<String>,
}

/// 一天的对话（按天分组，供前端折叠展示历史）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDay {
    pub date: String,               // "YYYY-MM-DD"（凌晨4点边界）
    pub messages: Vec<ConversationMessage>,
}

/// 凌晨4点边界：返回"今天"的日期字符串（00:00-03:59 算前一天）。
/// 与日报生成时间（凌晨4点）保持一致。
fn day_key() -> String {
    (Local::now() - chrono::Duration::hours(4)).format("%Y-%m-%d").to_string()
}

#[derive(Clone)]
pub struct MemoryService {
    root: PathBuf,
    pub profile: Arc<RwLock<UserProfile>>,
    pub cat_state: Arc<RwLock<CatState>>,
    pub conversation: Arc<RwLock<Vec<ConversationMessage>>>,
}

impl MemoryService {
    pub fn new() -> Self {
        // Use ~/.dailysnap/memory so users can sync via iCloud/Dropbox if desired.
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let root = PathBuf::from(home).join(".dailysnap").join("memory");

        let _ = fs::create_dir_all(root.join("daily-summaries"));

        let profile = load_profile_or_default(&root.join("profile.md"));
        let cat_state = load_cat_state_or_default(&root.join("states.json"));
        let today = day_key();
        let conversation = load_conversation(&root.join(format!("conversation_{}.json", today)));

        Self {
            root,
            profile: Arc::new(RwLock::new(profile)),
            cat_state: Arc::new(RwLock::new(cat_state)),
            conversation: Arc::new(RwLock::new(conversation)),
        }
    }

    pub fn memory_dir(&self) -> &PathBuf { &self.root }

    /// Path to today's conversation log.
    pub fn conversation_path(&self) -> PathBuf {
        let today = day_key();
        self.root.join(format!("conversation_{}.json", today))
    }

    /// Get the full conversation snapshot (cloned).
    pub async fn get_conversation(&self) -> Vec<ConversationMessage> {
        self.conversation.read().await.clone()
    }

    /// 扫描 memory 目录下所有 conversation_*.json 的日期（升序）。
    fn scan_conversation_dates(&self) -> Vec<String> {
        let mut dates: Vec<String> = Vec::new();
        if let Ok(entries) = fs::read_dir(&self.root) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if let Some(date) = name
                    .strip_prefix("conversation_")
                    .and_then(|s| s.strip_suffix(".json"))
                {
                    dates.push(date.to_string());
                }
            }
        }
        dates.sort();
        dates
    }

    /// 加载最近 `days` 天（含今天）的对话，按日期升序（今天在最后）。
    /// 今天用内存（权威，可能包含尚未落盘的新消息），历史读文件。
    pub async fn load_days(&self, days: usize) -> Vec<ConversationDay> {
        let today = day_key();
        let mut dates = self.scan_conversation_dates();
        // 只保留 <= today 的日期（防御未来的异常日期），取最近 days 个
        dates.retain(|d| d.as_str() <= today.as_str());
        let start = dates.len().saturating_sub(days);
        let selected: Vec<String> = dates[start..].to_vec();

        let mut result: Vec<ConversationDay> = Vec::new();
        for date in &selected {
            if date == &today {
                let msgs = self.conversation.read().await.clone();
                result.push(ConversationDay { date: date.clone(), messages: msgs });
            } else {
                let path = self.root.join(format!("conversation_{}.json", date));
                result.push(ConversationDay { date: date.clone(), messages: load_conversation(&path) });
            }
        }
        // 保证今天一定在末尾（今天可能还没有文件）
        if result.last().map(|d| d.date.as_str()) != Some(today.as_str()) {
            let msgs = self.conversation.read().await.clone();
            result.push(ConversationDay { date: today.clone(), messages: msgs });
        }
        result
    }

    /// 加载 `before_date` 之前（不含）更早的 `days` 天对话，按日期升序。
    /// 用于前端向上滚动时懒加载更早的历史。
    pub fn load_before(&self, before_date: &str, days: usize) -> Vec<ConversationDay> {
        let mut earlier: Vec<String> = self
            .scan_conversation_dates()
            .into_iter()
            .filter(|d| d.as_str() < before_date)
            .collect();
        earlier.sort();
        let start = earlier.len().saturating_sub(days);
        earlier[start..]
            .iter()
            .map(|date| {
                let path = self.root.join(format!("conversation_{}.json", date));
                ConversationDay { date: date.clone(), messages: load_conversation(&path) }
            })
            .collect()
    }

    /// Append a message to the conversation and persist.
    pub async fn append_conversation(&self, role: &str, content: &str, followup: bool, options: Vec<String>) {
        {
            let mut conv = self.conversation.write().await;
            conv.push(ConversationMessage {
                role: role.to_string(),
                content: content.to_string(),
                followup,
                followup_options: options,
            });
        }
        self.save_conversation().await;
    }

    /// Persist the conversation to today's file.
    pub async fn save_conversation(&self) {
        let conv = self.conversation.read().await.clone();
        let path = self.conversation_path();
        if let Ok(s) = serde_json::to_string_pretty(&conv) {
            let _ = fs::write(&path, s);
        }
    }

    /// Path to today's raw log (e.g. today.md)
    pub fn today_path(&self) -> PathBuf {
        let today = day_key();
        self.root.join(format!("{}.md", today))
    }

    pub fn daily_summary_path(&self, date: &str) -> PathBuf {
        self.root.join("daily-summaries").join(format!("{}.md", date))
    }

    pub fn long_term_path(&self) -> PathBuf { self.root.join("long-term.md") }
    pub fn profile_path(&self) -> PathBuf { self.root.join("profile.md") }
    pub fn states_path(&self) -> PathBuf { self.root.join("states.json") }

    /// Append a raw record to today's log.
    pub fn append_today(&self, line: &str) -> std::io::Result<()> {
        let path = self.today_path();
        let mut content = fs::read_to_string(&path).unwrap_or_default();
        if !content.is_empty() && !content.ends_with('\n') {
            content.push('\n');
        }
        content.push_str(line);
        content.push('\n');
        fs::write(&path, content)
    }

    /// Build the full context that should be injected into the AI system prompt.
    /// Combines profile + today's log + recent summaries + long-term distilled patterns.
    pub async fn build_context(&self) -> String {
        let profile = self.profile.read().await.clone();
        let today = fs::read_to_string(self.today_path()).unwrap_or_default();
        let long_term = fs::read_to_string(self.long_term_path()).unwrap_or_default();

        // Last 3 daily summaries
        let mut summaries = String::new();
        for offset in 1..=3 {
            let date = (Local::now() - chrono::Duration::days(offset)).format("%Y-%m-%d").to_string();
            let path = self.daily_summary_path(&date);
            if let Ok(c) = fs::read_to_string(&path) {
                summaries.push_str(&format!("\n## {}\n{}\n", date, c));
            }
        }

        let mut ctx = String::new();
        if profile.onboarded {
            ctx.push_str(&format!(
                "## 用户画像 (profile.md)\n- 猫的名字: {}\n- 职业: {}\n- 当前项目: {}\n- 提醒频率: 每 {} 分钟\n- 打扰方式: {}\n- 猫的性格: {}\n- 工作时间: {} - {}（工作日 {}，分段 {}）\n",
                profile.cat_name,
                profile.occupation,
                profile.current_project,
                profile.reminder_interval_minutes,
                profile.interrupt_style,
                profile.cat_personality,
                profile.workday_start,
                profile.workday_end,
                profile.workdays,
                profile.workday_segments,
            ));
        }

        if !today.trim().is_empty() {
            ctx.push_str(&format!("\n## 今日原始记录 (today.md)\n{}\n", today));
        }

        if !summaries.trim().is_empty() {
            ctx.push_str(&format!("\n## 最近 3 天摘要\n{}", summaries));
        }

        if !long_term.trim().is_empty() {
            ctx.push_str(&format!("\n## 长期记忆提炼 (long-term.md)\n{}\n", long_term));
        }

        ctx
    }

    /// Apply a record action to the cat state (love +1, mood boost, streak update).
    pub async fn on_record(&self, content_summary: &str) {
        let now = chrono::Local::now().timestamp();
        let mut state = self.cat_state.write().await;
        state.love = (state.love + 1).min(100);

        // Mood rises on record, decays slowly otherwise
        state.mood = (state.mood + 8).min(100);

        // Update streak
        if state.last_record_ts > 0 {
            let last_day = chrono::DateTime::from_timestamp(state.last_record_ts, 0)
                .map(|t| t.with_timezone(&chrono::Local).date_naive())
                .unwrap_or_else(|| chrono::Local::now().date_naive());
            let today = chrono::Local::now().date_naive();
            let diff = (today - last_day).num_days();
            if diff == 1 { state.streak_days += 1; }
            else if diff > 1 { state.streak_days = 1; }
            // diff == 0 (same day) keeps streak unchanged
        } else {
            state.streak_days = 1;
        }
        state.last_record_ts = now;

        // Affinity grows slowly with streak
        state.affinity = (state.affinity + (state.streak_days / 3)).min(100);

        drop(state);
        let _ = self.save_cat_state();

        // Append a one-liner to today's log
        let line = format!(
            "- [{}] {} (love:{}, streak:{}d)",
            chrono::Local::now().format("%H:%M"),
            content_summary,
            self.cat_state.read().await.love,
            self.cat_state.read().await.streak_days,
        );
        let _ = self.append_today(&line);
    }

    /// Periodic mood decay (called by scheduler every ~30min).
    pub async fn mood_decay_tick(&self) {
        let mut state = self.cat_state.write().await;
        if state.last_record_ts == 0 { return; }
        let now = chrono::Local::now().timestamp();
        let hours_since = (now - state.last_record_ts) / 3600;
        if hours_since >= 2 {
            let decay = ((hours_since - 1) as i32).min(5);
            state.mood = (state.mood - decay).max(0);
        }
        drop(state);
        let _ = self.save_cat_state();
    }

    pub async fn save_profile(&self) {
        let profile = self.profile.read().await.clone();
        let md = profile_to_markdown(&profile);
        let _ = fs::write(self.profile_path(), md);
    }

    pub async fn save_cat_state(&self) -> std::io::Result<()> {
        // Async read so we don't block the tokio runtime worker thread.
        let state = self.cat_state.read().await.clone();
        let json = serde_json::to_string_pretty(&state).unwrap_or_default();
        fs::write(self.states_path(), json)
    }

    pub async fn update_profile_field(&self, key: &str, value: &str) {
        let mut profile = self.profile.write().await;
        match key {
            "cat_name" => profile.cat_name = value.to_string(),
            "occupation" => profile.occupation = value.to_string(),
            "current_project" => profile.current_project = value.to_string(),
            "reminder_interval_minutes" => {
                if let Ok(n) = value.parse() { profile.reminder_interval_minutes = n; }
            }
            "interrupt_style" => profile.interrupt_style = value.to_string(),
            "cat_personality" => profile.cat_personality = value.to_string(),
            "workday_start" => profile.workday_start = value.to_string(),
            "workday_end" => profile.workday_end = value.to_string(),
            "workdays" => profile.workdays = value.to_string(),
            "workday_segments" => profile.workday_segments = value.to_string(),
            "onboarded" => profile.onboarded = value == "true",
            _ => {}
        }
        drop(profile);
        self.save_profile().await;
    }

    /// 一次性写入 onboarding 收集的所有字段并标记 onboarded=true（只写一次文件）。
    pub async fn complete_onboarding(&self, data: &OnboardingData) {
        {
            let mut p = self.profile.write().await;
            p.cat_name = data.cat_name.clone();
            p.occupation = data.occupation.clone();
            p.current_project = data.occupation.clone();
            p.reminder_interval_minutes = data.reminder_interval_minutes;
            p.interrupt_style = data.interrupt_style.clone();
            p.cat_personality = data.cat_personality.clone();
            p.workday_start = data.workday_start.clone();
            p.workday_end = data.workday_end.clone();
            p.workdays = data.workdays.clone();
            p.workday_segments = data.workday_segments.clone();
            p.onboarded = true;
        }
        self.save_profile().await;
    }

    /// Read the long-term patterns file (used by AI for context)
    pub fn read_long_term(&self) -> String {
        fs::read_to_string(self.long_term_path()).unwrap_or_default()
    }

    /// Write a long-term distillation result
    pub fn write_long_term(&self, content: &str) -> std::io::Result<()> {
        fs::write(self.long_term_path(), content)
    }

    /// Write a daily summary for the given date
    pub fn write_daily_summary(&self, date: &str, content: &str) -> std::io::Result<()> {
        let path = self.daily_summary_path(date);
        let wrapped = format!("# Daily Summary · {}\n\n{}\n", date, content);
        fs::write(path, wrapped)
    }

    /// Read today's raw log
    pub fn read_today(&self) -> String {
        fs::read_to_string(self.today_path()).unwrap_or_default()
    }
}

fn profile_to_markdown(p: &UserProfile) -> String {
    format!(
        "# User Profile\n\n\
        - **猫的名字**: {}\n\
        - **职业**: {}\n\
        - **当前项目**: {}\n\
        - **提醒频率**: 每 {} 分钟\n\
        - **打扰方式**: {}\n\
        - **猫的性格**: {}\n\
        - **工作时间**: {} - {}\n\
        - **工作日**: {}\n\
        - **时间分段**: {}\n\
        - **onboarded**: {}\n",
        if p.cat_name.is_empty() { "小猫" } else { &p.cat_name },
        if p.occupation.is_empty() { "（未填写）" } else { &p.occupation },
        if p.current_project.is_empty() { "（未填写）" } else { &p.current_project },
        p.reminder_interval_minutes,
        p.interrupt_style,
        p.cat_personality,
        p.workday_start,
        p.workday_end,
        if p.workdays.is_empty() { "（未设置）" } else { &p.workdays },
        if p.workday_segments.is_empty() { "（未设置）" } else { &p.workday_segments },
        p.onboarded,
    )
}

fn load_profile_or_default(path: &PathBuf) -> UserProfile {
    if let Ok(content) = fs::read_to_string(path) {
        let mut p = UserProfile::default();
        for line in content.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("- **") {
                if let Some((key, value)) = rest.split_once("**:") {
                    let key = key.trim();
                    let value = value.trim();
                    match key {
                        "猫的名字" => p.cat_name = value.to_string(),
                        "职业" => p.occupation = value.to_string(),
                        "当前项目" => p.current_project = value.to_string(),
                        "提醒频率" => {
                            if let Some(n) = value.strip_prefix("每 ").and_then(|s| s.strip_suffix(" 分钟")) {
                                if let Ok(num) = n.parse() { p.reminder_interval_minutes = num; }
                            }
                        }
                        "打扰方式" => p.interrupt_style = value.to_string(),
                        "猫的性格" => p.cat_personality = value.to_string(),
                        "工作时间" => {
                            if let Some((s, e)) = value.split_once(" - ") {
                                p.workday_start = s.trim().to_string();
                                p.workday_end = e.trim().to_string();
                            }
                        }
                        "工作日" => p.workdays = value.to_string(),
                        "时间分段" => p.workday_segments = value.to_string(),
                        "onboarded" => p.onboarded = value == "true",
                        _ => {}
                    }
                }
            }
        }
        return p;
    }
    UserProfile::default()
}

fn load_cat_state_or_default(path: &PathBuf) -> CatState {
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(state) = serde_json::from_str::<CatState>(&content) {
            return state;
        }
    }
    CatState::default()
}

fn load_conversation(path: &PathBuf) -> Vec<ConversationMessage> {
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(msgs) = serde_json::from_str::<Vec<ConversationMessage>>(&content) {
            return msgs;
        }
    }
    Vec::new()
}
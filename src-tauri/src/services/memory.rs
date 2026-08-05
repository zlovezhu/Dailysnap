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
    pub occupation: String,
    pub current_project: String,
    pub reminder_interval_minutes: i32,
    pub interrupt_style: String,    // "popup" | "quiet" | "none"
    pub cat_personality: String,    // "warm" | "cheeky" | "quiet"
    pub workday_start: String,     // "HH:MM"
    pub workday_end: String,       // "HH:MM"
    pub onboarded: bool,
}

impl Default for UserProfile {
    fn default() -> Self {
        Self {
            occupation: String::new(),
            current_project: String::new(),
            reminder_interval_minutes: 120,
            interrupt_style: "popup".to_string(),
            cat_personality: "warm".to_string(),
            workday_start: "09:30".to_string(),
            workday_end: "18:00".to_string(),
            onboarded: false,
        }
    }
}

#[derive(Clone)]
pub struct MemoryService {
    root: PathBuf,
    pub profile: Arc<RwLock<UserProfile>>,
    pub cat_state: Arc<RwLock<CatState>>,
}

impl MemoryService {
    pub fn new() -> Self {
        // Use ~/.dailysnap/memory so users can sync via iCloud/Dropbox if desired.
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let root = PathBuf::from(home).join(".dailysnap").join("memory");

        let _ = fs::create_dir_all(root.join("daily-summaries"));

        let profile = load_profile_or_default(&root.join("profile.md"));
        let cat_state = load_cat_state_or_default(&root.join("states.json"));

        Self {
            root,
            profile: Arc::new(RwLock::new(profile)),
            cat_state: Arc::new(RwLock::new(cat_state)),
        }
    }

    pub fn memory_dir(&self) -> &PathBuf { &self.root }

    /// Path to today's raw log (e.g. today.md)
    pub fn today_path(&self) -> PathBuf {
        let today = Local::now().format("%Y-%m-%d").to_string();
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
                "## 用户画像 (profile.md)\n- 职业: {}\n- 当前项目: {}\n- 提醒频率: 每 {} 分钟\n- 打扰方式: {}\n- 猫的性格: {}\n- 工作时间: {} - {}\n",
                profile.occupation,
                profile.current_project,
                profile.reminder_interval_minutes,
                profile.interrupt_style,
                profile.cat_personality,
                profile.workday_start,
                profile.workday_end,
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

    pub fn save_cat_state(&self) -> std::io::Result<()> {
        // blocking write; called after dropping the lock so it's a quick sync op
        let state = self.cat_state.blocking_read();
        let json = serde_json::to_string_pretty(&*state).unwrap_or_default();
        fs::write(self.states_path(), json)
    }

    pub async fn update_profile_field(&self, key: &str, value: &str) {
        let mut profile = self.profile.write().await;
        match key {
            "occupation" => profile.occupation = value.to_string(),
            "current_project" => profile.current_project = value.to_string(),
            "reminder_interval_minutes" => {
                if let Ok(n) = value.parse() { profile.reminder_interval_minutes = n; }
            }
            "interrupt_style" => profile.interrupt_style = value.to_string(),
            "cat_personality" => profile.cat_personality = value.to_string(),
            "workday_start" => profile.workday_start = value.to_string(),
            "workday_end" => profile.workday_end = value.to_string(),
            _ => {}
        }
        drop(profile);
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
        - **职业**: {}\n\
        - **当前项目**: {}\n\
        - **提醒频率**: 每 {} 分钟\n\
        - **打扰方式**: {}\n\
        - **猫的性格**: {}\n\
        - **工作时间**: {} - {}\n\
        - **onboarded**: {}\n",
        if p.occupation.is_empty() { "（未填写）" } else { &p.occupation },
        if p.current_project.is_empty() { "（未填写）" } else { &p.current_project },
        p.reminder_interval_minutes,
        p.interrupt_style,
        p.cat_personality,
        p.workday_start,
        p.workday_end,
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
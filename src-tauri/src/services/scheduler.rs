use chrono::Local;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::services::holiday;

#[derive(Clone)]
struct SchedulerSettings {
    reminder_start_time: String,
    reminder_interval_minutes: i32,
    report_generate_time: String,
    holiday_disable: bool,
}

impl Default for SchedulerSettings {
    fn default() -> Self {
        Self {
            reminder_start_time: "09:30".to_string(),
            reminder_interval_minutes: 120,
            report_generate_time: "04:00".to_string(),
            holiday_disable: true,
        }
    }
}

static RUNTIME_SETTINGS: OnceLock<Mutex<SchedulerSettings>> = OnceLock::new();

fn runtime_settings() -> &'static Mutex<SchedulerSettings> {
    RUNTIME_SETTINGS.get_or_init(|| Mutex::new(SchedulerSettings::default()))
}

pub fn apply_runtime_setting(key: &str, value: &str) {
    let Ok(mut settings) = runtime_settings().lock() else {
        return;
    };

    match key {
        "reminder_start_time" => {
            settings.reminder_start_time = value.to_string();
        }
        "reminder_interval_minutes" => {
            if let Ok(parsed) = value.parse::<i32>() {
                settings.reminder_interval_minutes = parsed;
            }
        }
        "report_generate_time" => {
            settings.report_generate_time = value.to_string();
        }
        "holiday_disable" => {
            let normalized = value.trim().to_lowercase();
            settings.holiday_disable = normalized == "true" || normalized == "1";
        }
        _ => {}
    }
}

/// Main scheduler loop - checks every 30 seconds if it's time to remind
pub async fn start_scheduler(app: AppHandle) {
    let mut last_remind_time: Option<chrono::DateTime<Local>> = None;
    let mut last_report_generated = false;

    loop {
        tokio::time::sleep(Duration::from_secs(30)).await;

        let now = Local::now();
        let current_time = now.format("%H:%M").to_string();

        let settings = match load_settings(&app).await {
            Some(s) => s,
            None => continue,
        };

        let is_test_mode = settings.reminder_interval_minutes <= 0;

        if !is_test_mode && settings.holiday_disable && holiday::is_holiday(&now) {
            continue;
        }

        if current_time == settings.report_generate_time && !last_report_generated {
            let _ = app.emit("auto-generate-report", ());
            last_report_generated = true;
        }

        if current_time == "00:00" {
            last_report_generated = false;
        }

        if !should_remind(&now, &last_remind_time, &settings) {
            continue;
        }

        trigger_reminder(&app).await;
        last_remind_time = Some(now);
    }
}

async fn load_settings(_app: &AppHandle) -> Option<SchedulerSettings> {
    let Ok(settings) = runtime_settings().lock() else {
        return None;
    };

    Some(settings.clone())
}

fn should_remind(
    now: &chrono::DateTime<Local>,
    last_remind: &Option<chrono::DateTime<Local>>,
    settings: &SchedulerSettings,
) -> bool {
    let is_test_mode = settings.reminder_interval_minutes <= 0;

    if !is_test_mode {
        let current_time = now.format("%H:%M").to_string();

        // Only remind during work hours (after start time, before 19:00)
        if current_time < settings.reminder_start_time || current_time > "19:00".to_string() {
            return false;
        }

        // Only remind on weekdays
        let weekday = now.format("%u").to_string().parse::<u32>().unwrap_or(1);
        if weekday > 5 {
            return false;
        }
    }

    // reminder_interval_minutes <= 0 is treated as test mode: every 30 seconds.
    match last_remind {
        None => true,
        Some(last) => {
            let elapsed = now.signed_duration_since(*last);
            if is_test_mode {
                elapsed.num_seconds() >= 30
            } else {
                elapsed.num_minutes() >= settings.reminder_interval_minutes as i64
            }
        }
    }
}

async fn trigger_reminder(app: &AppHandle) {
    // Main window visible -> show in-window light hint only.
    if let Some(main_win) = app.get_webview_window("main") {
        if let Ok(true) = main_win.is_visible() {
            let _ = app.emit("main-reminder-trigger", ());
            return;
        }
    }

    // Main hidden -> go through float flow.
    if let Some(float_win) = app.get_webview_window("float-ball") {
        let _ = float_win.show();
    }

    let _ = app.emit("reminder-trigger", ());
}

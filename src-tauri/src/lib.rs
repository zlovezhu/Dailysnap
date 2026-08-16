mod commands;
mod services;
mod models;
mod macos_window;

use tauri::{Manager, WindowEvent};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_sql::{Migration, MigrationKind};
use services::ai_client::AiClient;
use services::memory::MemoryService;
use std::sync::Arc;

pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                ai_question TEXT,
                ai_followup TEXT,
                user_followup_reply TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                date TEXT NOT NULL DEFAULT (date('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS daily_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                record_ids TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT OR IGNORE INTO settings (key, value) VALUES
                ('reminder_start_time', '09:30'),
                ('reminder_interval_minutes', '120'),
                ('report_generate_time', '18:00'),
                ('holiday_disable', 'true'),
                ('api_key', ''),
                ('api_base_url', 'https://api.deepseek.com/v1'),
                ('model_name', 'deepseek-chat');",
            kind: MigrationKind::Up,
        },
        // Migration 2: 升级弃用的 model 名 + base_url
        // deepseek-chat / deepseek-reasoner 已于 2026-07-24 弃用，
        // 统一升级到 deepseek-v4-flash；base_url 去掉 /v1。
        // 用单语句 CASE WHEN（避免 tauri-plugin-sql 多语句 migration 的潜在问题）。
        Migration {
            version: 2,
            description: "upgrade_model_to_deepseek_v4_flash",
            sql: "UPDATE settings SET value = CASE \
                       WHEN key = 'model_name' AND value IN ('deepseek-chat', 'deepseek-reasoner', 'gpt-4o-mini') THEN 'deepseek-v4-flash' \
                       WHEN key = 'api_base_url' AND value IN ('https://api.deepseek.com/v1', 'https://api.deepseek.com/v4', 'https://api.openai.com/v1') THEN 'https://api.deepseek.com' \
                       ELSE value \
                   END \
                   WHERE key IN ('model_name', 'api_base_url');",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:dailysnap.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage({
            let mem = Arc::new(MemoryService::new());
            AiClient::new(mem.clone())
        })
        .setup(|app| {
            // Strip NSVisualEffectView backdrop from the float-ball window only
            // (not the main window — that one keeps its 14px rounded corners).
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("float-ball") {
                    if let Ok(ns_window) = window.ns_window() {
                        crate::macos_window::strip_window_chrome(ns_window as *mut std::ffi::c_void);
                    }
                }
            }

            // Build tray menu
            let quit = MenuItem::with_id(app, "quit", "退出 DailySnap", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            // Create tray icon
            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("DailySnap - 碎片日报助手")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        if let Some(float_win) = app.get_webview_window("float-ball") {
                            let _ = float_win.hide();
                        }
                        if let Some(mini_win) = app.get_webview_window("mini-chat") {
                            let _ = mini_win.hide();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        if let Some(float_win) = app.get_webview_window("float-ball") {
                            let _ = float_win.hide();
                        }
                        if let Some(mini_win) = app.get_webview_window("mini-chat") {
                            let _ = mini_win.hide();
                        }
                    }
                })
                .build(app)?;

            // Enforce startup rule: only main window visible.
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.show();
                let _ = main_win.set_focus();
            }
            if let Some(float_win) = app.get_webview_window("float-ball") {
                let _ = float_win.hide();
            }
            if let Some(mini_win) = app.get_webview_window("mini-chat") {
                let _ = mini_win.hide();
            }

            // Start the reminder scheduler
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                services::scheduler::start_scheduler(app_handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // When main window is closed, hide it and show float ball
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                    if let Some(float_win) = window.app_handle().get_webview_window("float-ball") {
                        let _ = float_win.show();
                    }
                    if let Some(mini_win) = window.app_handle().get_webview_window("mini-chat") {
                        let _ = mini_win.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::ai::ai_chat,
            commands::records::save_record,
            commands::records::get_records_by_date,
            commands::records::generate_daily_report,
            commands::settings::get_settings,
            commands::settings::update_setting,
            commands::reminder::show_float_ball,
            commands::reminder::open_main_window,
            commands::reminder::set_float_mode,
            commands::reminder::trigger_test_reminder,
            commands::reminder::start_drag_window,
            commands::reminder::copy_to_clipboard,
            commands::devtools::switch_tab,
            commands::cat::agent_turn,
            commands::cat::agent_turn_stream,
            commands::cat::get_cat_state,
            commands::cat::mood_decay_tick,
            commands::cat::update_profile,
            commands::cat::get_profile,
            commands::cat::get_conversation,
            commands::cat::get_conversation_days,
            commands::cat::get_conversation_before,
            commands::cat::is_onboarded,
            commands::cat::complete_onboarding,
            commands::cat::get_memory_dir,
            commands::cat::write_long_term,
            commands::cat::write_daily_summary,
            commands::cat::sync_ai_config,
            commands::macos_window::setup_float_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DailySnap");
}

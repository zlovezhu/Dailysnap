use tauri::{AppHandle, Emitter, Manager};

#[tauri::command]
pub async fn show_float_ball(app: AppHandle) -> Result<(), String> {
    if let Some(float_win) = app.get_webview_window("float-ball") {
        float_win.show().map_err(|e| e.to_string())?;
    }
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.hide();
    }
    if let Some(mini_win) = app.get_webview_window("mini-chat") {
        let _ = mini_win.hide();
    }
    Ok(())
}

#[tauri::command]
pub async fn open_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(main_win) = app.get_webview_window("main") {
        main_win.show().map_err(|e| e.to_string())?;
        main_win.set_focus().map_err(|e| e.to_string())?;
    }
    if let Some(float_win) = app.get_webview_window("float-ball") {
        let _ = float_win.hide();
    }
    if let Some(mini_win) = app.get_webview_window("mini-chat") {
        let _ = mini_win.hide();
    }
    Ok(())
}

#[tauri::command]
pub async fn set_float_mode(_app: AppHandle, _mode: String) -> Result<(), String> {
    // Window size & position are controlled by tauri.conf.json.
    // This command exists as a no-op so the frontend doesn't break.
    Ok(())
}

#[tauri::command]
pub async fn trigger_test_reminder(app: AppHandle) -> Result<(), String> {
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.hide();
    }
    if let Some(mini_win) = app.get_webview_window("mini-chat") {
        let _ = mini_win.hide();
    }
    app.emit("reminder-trigger", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn start_drag_window(app: AppHandle, label: String) -> Result<(), String> {
    let Some(win) = app.get_webview_window(&label) else {
        return Err(format!("window not found: {label}"));
    };
    win.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn copy_to_clipboard(app: AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(&text).map_err(|e| e.to_string())
}

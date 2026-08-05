use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, LogicalSize, LogicalPosition};

#[tauri::command]
pub async fn show_float_ball(app: AppHandle) -> Result<(), String> {
    if let Some(float_win) = app.get_webview_window("float-ball") {
        // Ensure compact mode when returning to float ball.
        if let (Ok(old_pos), Ok(old_size)) = (float_win.outer_position(), float_win.outer_size()) {
            let target_w: u32 = 240;
            let target_h: u32 = 240;
            let mut new_x = old_pos.x; // don't reposition, just resize
            let mut new_y = old_pos.y;
            if new_x < 0 {
                new_x = 0;
            }
            if new_y < 0 {
                new_y = 0;
            }
            let _ = float_win.set_size(Size::Logical(LogicalSize::new(target_w as f64, target_h as f64)));
            let _ = float_win.set_position(Position::Logical(LogicalPosition::new(new_x as f64, new_y as f64)));
        }
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
pub async fn set_float_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let Some(float_win) = app.get_webview_window("float-ball") else {
        return Ok(());
    };

    let (target_w, target_h): (u32, u32) = match mode.as_str() {
        "expanded" => (240, 240),
        _ => (240, 240),
    };

    let _old_pos = float_win.outer_position().map_err(|e| e.to_string())?;
    let _old_size = float_win.outer_size().map_err(|e| e.to_string())?;

    // Position at fixed bottom-right corner (logical points)
    let new_x: f64 = 550.0;
    let new_y: f64 = 250.0;

    float_win
        .set_size(Size::Logical(LogicalSize::new(target_w as f64, target_h as f64)))
        .map_err(|e| e.to_string())?;
    float_win
        .set_position(Position::Logical(LogicalPosition::new(new_x, new_y)))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn trigger_test_reminder(app: AppHandle) -> Result<(), String> {
    if let Some(_float_win) = app.get_webview_window("float-ball") {
        // Just trigger the reminder event; do not resize the float window —
        // the new design lets the cat greets inside the fixed-size window.
    }

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

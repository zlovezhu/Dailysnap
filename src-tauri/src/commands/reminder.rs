use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size};

#[tauri::command]
pub async fn show_float_ball(app: AppHandle) -> Result<(), String> {
    if let Some(float_win) = app.get_webview_window("float-ball") {
        // Ensure compact mode when returning to float ball.
        if let (Ok(old_pos), Ok(old_size)) = (float_win.outer_position(), float_win.outer_size()) {
            let target_w: u32 = 56;
            let target_h: u32 = 56;
            let mut new_x = old_pos.x + old_size.width as i32 - target_w as i32;
            let mut new_y = old_pos.y + old_size.height as i32 - target_h as i32;
            if new_x < 0 {
                new_x = 0;
            }
            if new_y < 0 {
                new_y = 0;
            }
            let _ = float_win.set_size(Size::Physical(PhysicalSize::new(target_w, target_h)));
            let _ = float_win.set_position(Position::Physical(PhysicalPosition::new(new_x, new_y)));
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
        "expanded" => (480, 340),
        _ => (56, 56), // compact
    };

    let old_pos = float_win.outer_position().map_err(|e| e.to_string())?;
    let old_size = float_win.outer_size().map_err(|e| e.to_string())?;

    // Keep bottom-right anchor fixed while resizing.
    let mut new_x = old_pos.x + old_size.width as i32 - target_w as i32;
    let mut new_y = old_pos.y + old_size.height as i32 - target_h as i32;

    if new_x < 0 {
        new_x = 0;
    }
    if new_y < 0 {
        new_y = 0;
    }

    float_win
        .set_size(Size::Physical(PhysicalSize::new(target_w, target_h)))
        .map_err(|e| e.to_string())?;
    float_win
        .set_position(Position::Physical(PhysicalPosition::new(new_x, new_y)))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn trigger_test_reminder(app: AppHandle) -> Result<(), String> {
    if let Some(float_win) = app.get_webview_window("float-ball") {
        // Switch to hint mode with bottom-right anchor preserved.
        if let (Ok(old_pos), Ok(old_size)) = (float_win.outer_position(), float_win.outer_size()) {
            let target_w: u32 = 320;
            let target_h: u32 = 180;
            let mut new_x = old_pos.x + old_size.width as i32 - target_w as i32;
            let mut new_y = old_pos.y + old_size.height as i32 - target_h as i32;
            if new_x < 0 {
                new_x = 0;
            }
            if new_y < 0 {
                new_y = 0;
            }
            let _ = float_win.set_size(Size::Physical(PhysicalSize::new(target_w, target_h)));
            let _ = float_win.set_position(Position::Physical(PhysicalPosition::new(new_x, new_y)));
        }
        float_win.show().map_err(|e| e.to_string())?;
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

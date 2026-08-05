use tauri::{AppHandle, Manager};

/// macOS-specific tweak for the float-ball window:
/// disables the default circular NSWindow backdrop that appears on
/// transparent windows on macOS.
#[tauri::command]
pub async fn setup_float_window(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("float-ball") else {
        return Ok(());
    };

    // Remove window shadow
    let _ = window.set_shadow(false);

    // Decorations off (already set in conf but reinforce)
    let _ = window.set_decorations(false);

    Ok(())
}
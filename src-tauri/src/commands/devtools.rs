use tauri::{AppHandle, Emitter, Manager};

/// Dev-only: switch the main window's tab by setting location.hash
/// which the frontend listens for via hashchange event.
#[tauri::command]
pub async fn switch_tab(app: AppHandle, tab: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        // Use webview eval to set hash and trigger hashchange
        let js = format!(
            "window.location.hash = '{}'; window.dispatchEvent(new HashChangeEvent('hashchange'));",
            tab
        );
        window.eval(&js).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("switch-tab", &tab);
    Ok(())
}
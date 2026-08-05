use tauri::{AppHandle, Manager, WebviewWindow};

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn setWindowCornerRadius(window: *mut std::ffi::c_void, radius: f64);
    fn NSWindowFromNSView(view: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
}

#[cfg(target_os = "macos")]
pub fn set_transparent_no_backdrop(_window: &WebviewWindow) {
    // No-op stub; actual implementation lives in the runtime-side
}

/// Configure the float-ball window for a clean transparent look on macOS.
/// Removes the default circular NSWindow backdrop that macOS adds to
/// transparent windows.
#[cfg(target_os = "macos")]
pub fn remove_backdrop_for_float(window: &WebviewWindow) {
    use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::{id, nil, YES};
    use objc::{class, msg_send, sel, sel_impl};

    let ns_win = window.ns_window().unwrap_or_else(|| panic!("no ns_window"));
    let ns_win_id: id = ns_win as id;

    unsafe {
        // 1. Remove window shadow
        let _: () = msg_send![ns_win_id, setHasShadow: NO];

        // 2. Disable window restoration (prevents macOS restoring weird state)
        let _: () = msg_send![ns_win_id, setRestorable: NO];

        // 3. Set window to ignore mouse events outside the visible content
        // (handled at React level via setIgnoreCursorEvents)
    }
}

#[cfg(not(target_os = "macos"))]
pub fn remove_backdrop_for_float(_window: &WebviewWindow) {
    // No-op on non-macOS platforms
}

/// Initialize macOS-specific NSWindow tweaks for the float-ball.
pub fn setup_float_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("float-ball") {
        remove_backdrop_for_float(&window);
    }
}
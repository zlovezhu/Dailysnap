// macos_window.rs — strip the NSVisualEffectView backdrop from Tauri transparent
// windows so the cat PNG floats directly on the desktop, not inside a rounded
// rectangle frame.

#[cfg(target_os = "macos")]
pub fn strip_window_chrome(ns_window_ptr: *mut std::ffi::c_void) {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        unsafe { strip_impl(ns_window_ptr) }
    }));
    if let Err(e) = result {
        let msg = if let Some(s) = e.downcast_ref::<String>() {
            s.clone()
        } else if let Some(s) = e.downcast_ref::<&str>() {
            s.to_string()
        } else {
            "unknown panic".to_string()
        };
        eprintln!("strip_window_chrome panic (non-fatal): {msg}");
    }
}

#[cfg(target_os = "macos")]
unsafe fn strip_impl(ns_window_ptr: *mut std::ffi::c_void) {
    use cocoa::base::id;
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::Class;

    let window: id = ns_window_ptr as id;
    if window.is_null() {
        return;
    }

    // 1. Make the titlebar area transparent and hide the title text.
    let _: () = msg_send![window, setTitlebarAppearsTransparent: true];
    let _: () = msg_send![window, setTitleVisibility: cocoa::appkit::NSWindowTitleVisibility::NSWindowTitleHidden];

    // 2. Set the window background to NSColor.clearColor (fully transparent).
    //    Without this, macOS paints a default background even with setOpaque:false.
    let ns_color_class = match Class::get("NSColor") {
        Some(c) => c,
        None => {
            eprintln!("strip_window_chrome: NSColor class not found");
            return;
        }
    };
    let clear_color: id = msg_send![ns_color_class, clearColor];
    let _: () = msg_send![window, setBackgroundColor: clear_color];

    // 3. Mark the window as non-opaque so AppKit stops painting a default
    //    background colour.
    let _: () = msg_send![window, setOpaque: false];

    // 4. Disable window shadow — looks out of place for a floating PNG.
    let _: () = msg_send![window, setHasShadow: false];

    // 5. CRITICAL: Tell macOS to NOT ignore mouse events for this window.
    let _: () = msg_send![window, setIgnoresMouseEvents: false];

    // 6. Set alpha to 0.999 — make macOS treat the window as opaque enough
    //    to deliver mouse events while still being visually transparent.
    let _: () = msg_send![window, setAlphaValue: 0.999 as f64];

    // 7. Move background view to the back so any remaining NSVisualEffectView
    //    doesn't cover our transparent content. This is the fix for the
    //    "black rectangle" appearance when NSVisualEffectView is layered
    //    above the WKWebView.
    let content_view: id = msg_send![window, contentView];
    if !content_view.is_null() {
        let subviews: id = msg_send![content_view, subviews];
        let count: usize = msg_send![subviews, count];
        for i in (0..count).rev() {
            let subview: id = msg_send![subviews, objectAtIndex: i];
            let class_name_ns: id = msg_send![subview, className];
            if !class_name_ns.is_null() {
                let c_str: *const i8 = msg_send![class_name_ns, UTF8String];
                if !c_str.is_null() {
                    let name = std::ffi::CStr::from_ptr(c_str);
                    let name_bytes = name.to_bytes();
                    if name_bytes == b"NSVisualEffectView"
                        || name_bytes == b"_NSVisualEffectView"
                        || name_bytes == b"NSVisualEffectViewRootLayerBackdrop"
                    {
                        let _: () = msg_send![subview, removeFromSuperview];
                        eprintln!("strip_window_chrome: removed {name_bytes:?} from float-ball window");
                    }
                }
            }
        }
    }

    // 8. Force the WKWebView underneath to also draw transparent (some macOS
    //    versions require explicitly setting _backgroundColor on the layer
    //    beneath, otherwise it defaults to opaque black).
    let _: () = msg_send![window, display];
    let _: () = msg_send![window, setBackgroundColor: clear_color];
}

#[cfg(not(target_os = "macos"))]
pub fn strip_window_chrome(_ns_window_ptr: *mut std::ffi::c_void) {}

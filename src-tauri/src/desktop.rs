use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

#[cfg(windows)]
mod windows;
#[cfg(all(windows, not(test)))]
pub use windows::start_or_activate;

const SHOW_ITEM: &str = "show";
const EXIT_ITEM: &str = "exit";

pub struct DesktopState {
    pub exit_requested: AtomicBool,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            exit_requested: AtomicBool::new(false),
        }
    }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn setup<R: Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id(SHOW_ITEM, "显示 NextChat").build(app)?;
    let exit = MenuItemBuilder::with_id(EXIT_ITEM, "退出 NextChat").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &exit]).build()?;

    TrayIconBuilder::with_id("main-tray")
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../icons/32x32.png"
        ))?)
        .tooltip("NextChat")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            SHOW_ITEM => show_main_window(app),
            EXIT_ITEM => {
                app.state::<DesktopState>()
                    .exit_requested
                    .store(true, Ordering::Release);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    #[cfg(windows)]
    windows::listen(app)?;
    Ok(())
}

pub fn should_hide_on_close<R: Runtime>(window: &tauri::Window<R>) -> bool {
    !window
        .app_handle()
        .state::<DesktopState>()
        .exit_requested
        .load(Ordering::Acquire)
}

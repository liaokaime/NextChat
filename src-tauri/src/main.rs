// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod startup_window;
mod stream;

#[cfg(test)]
mod desktop_tests;

fn configure<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .setup(startup_window::setup)
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(stream::Requests::default())
        .invoke_handler(tauri::generate_handler![
            stream::stream_fetch,
            stream::cancel_stream,
            startup_window::save_startup_window_size
        ])
}

// The test harness supplies its own entry point and generates a context in desktop_tests.
// Compiling both contexts would embed the macOS Info.plist symbol twice.
#[cfg(not(test))]
fn main() {
    configure(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

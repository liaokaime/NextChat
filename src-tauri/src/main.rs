// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod stream;

fn main() {
    tauri::Builder::default()
        .manage(stream::Requests::default())
        .invoke_handler(tauri::generate_handler![
            stream::stream_fetch,
            stream::cancel_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["stream_fetch", "cancel_stream"]),
    ))
    .expect("failed to build Tauri application permissions");
}

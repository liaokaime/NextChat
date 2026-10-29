use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, Runtime, State, WebviewWindowBuilder};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct WindowSize {
    pub width: u32,
    pub height: u32,
}

impl WindowSize {
    fn is_valid(self) -> bool {
        (480..=7680).contains(&self.width) && (320..=4320).contains(&self.height)
    }
}

pub struct StartupWindowStore {
    pub path: PathBuf,
    write_lock: Mutex<()>,
}

impl StartupWindowStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            write_lock: Mutex::new(()),
        }
    }

    fn save(&self, size: WindowSize) -> Result<(), String> {
        if !size.is_valid() {
            return Err("Invalid startup window size".into());
        }
        let _guard = self.write_lock.lock().map_err(|error| error.to_string())?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        // Replace only a complete file, so an interrupted write cannot truncate the preference.
        let temporary = self.path.with_extension("tmp");
        let bytes = serde_json::to_vec(&size).map_err(|error| error.to_string())?;
        fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
        fs::rename(&temporary, &self.path).map_err(|error| error.to_string())
    }
}

pub fn window_config(
    config: &tauri::utils::config::WindowConfig,
    path: &Path,
) -> tauri::utils::config::WindowConfig {
    let mut config = config.clone();
    if let Some(size) = fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<WindowSize>(&bytes).ok())
        .filter(|size| size.is_valid())
    {
        config.width = f64::from(size.width);
        config.height = f64::from(size.height);
    }
    config.visible = true;
    config
}

pub fn setup<R: Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    if app.try_state::<StartupWindowStore>().is_none() {
        app.manage(StartupWindowStore::new(
            app.path().app_config_dir()?.join("startup-window.json"),
        ));
    }
    let store = app.state::<StartupWindowStore>();
    let configured = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .ok_or("Missing main window configuration")?;
    // No window exists yet: native creation receives the final dimensions directly.
    let config = window_config(configured, &store.path);
    WebviewWindowBuilder::from_config(app, &config)?
        .center()
        .prevent_overflow()
        .build()?;
    Ok(())
}

#[tauri::command]
pub fn save_startup_window_size(
    size: WindowSize,
    store: State<'_, StartupWindowStore>,
) -> Result<(), String> {
    store.save(size)
}

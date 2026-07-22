use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State};

const WINDOW_STATE_FILE_NAME: &str = "window-state.json";
const PERSIST_DELAY: Duration = Duration::from_millis(500);
const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl WindowBounds {
    fn is_valid(&self) -> bool {
        self.width > 0 && self.height > 0
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct MainWindowStateData {
    normal_bounds: Option<WindowBounds>,
    collapsed_y: Option<i32>,
}

impl MainWindowStateData {
    fn is_valid(&self) -> bool {
        self.normal_bounds
            .as_ref()
            .is_none_or(WindowBounds::is_valid)
    }
}

struct WindowStateStore {
    state: Mutex<MainWindowStateData>,
    path: Option<PathBuf>,
}

#[derive(Clone)]
pub struct MainWindowState(Arc<WindowStateStore>);

impl MainWindowState {
    pub fn load(app: &AppHandle) -> Self {
        let path = match state_path(app) {
            Ok(path) => Some(path),
            Err(error) => {
                eprintln!("Failed to resolve window state path: {error}");
                None
            }
        };

        let state = path
            .as_deref()
            .and_then(|path| load_state(path).ok())
            .unwrap_or_else(|| {
                let defaults = MainWindowStateData::default();

                if let Some(path) = path.as_deref() {
                    if let Err(error) = write_state(path, &defaults) {
                        eprintln!("Failed to write default window state: {error}");
                    }
                }

                defaults
            });

        Self(Arc::new(WindowStateStore {
            state: Mutex::new(state),
            path,
        }))
    }

    pub fn restore_main_window(&self, app: &AppHandle) -> tauri::Result<()> {
        let state = self.snapshot().unwrap_or_default();
        let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
            return Ok(());
        };

        window.set_fullscreen(false)?;
        let Some(bounds) = state.normal_bounds else {
            return Ok(());
        };
        window.set_size(PhysicalSize::new(bounds.width, bounds.height))?;
        window.set_position(PhysicalPosition::new(bounds.x, bounds.y))
    }

    fn snapshot(&self) -> Result<MainWindowStateData, String> {
        self.0
            .state
            .lock()
            .map(|state| state.clone())
            .map_err(|error| error.to_string())
    }

    fn update(&self, state: MainWindowStateData) -> Result<(), String> {
        if !state.is_valid() {
            return Err("Window state is invalid".into());
        }

        *self.0.state.lock().map_err(|error| error.to_string())? = state;
        Ok(())
    }

    fn schedule_persist(&self) {
        let state = self.clone();

        thread::spawn(move || {
            thread::sleep(PERSIST_DELAY);

            let snapshot = match state.snapshot() {
                Ok(snapshot) => snapshot,
                Err(error) => {
                    eprintln!("Failed to access window state for persistence: {error}");
                    return;
                }
            };
            let Some(path) = state.0.path.as_deref() else {
                return;
            };

            if let Err(error) = write_state(path, &snapshot) {
                eprintln!("Failed to persist window state: {error}");
            }
        });
    }
}

#[tauri::command]
pub fn get_main_window_state(
    state: State<'_, MainWindowState>,
) -> Result<MainWindowStateData, String> {
    state.snapshot()
}

#[tauri::command]
pub fn update_main_window_state(
    state: State<'_, MainWindowState>,
    window_state: MainWindowStateData,
) -> Result<(), String> {
    state.update(window_state)?;
    state.schedule_persist();
    Ok(())
}

fn load_state(path: &Path) -> Result<MainWindowStateData, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let state = serde_json::from_str::<MainWindowStateData>(&contents)
        .map_err(|error| error.to_string())?;

    if state.is_valid() {
        Ok(state)
    } else {
        Err("Window state is invalid".into())
    }
}

fn write_state(path: &Path, state: &MainWindowStateData) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Window state directory is unavailable".to_string())?;

    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let contents = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(WINDOW_STATE_FILE_NAME))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::MainWindowStateData;

    #[test]
    fn rejects_invalid_normal_bounds() {
        let state = serde_json::from_str::<MainWindowStateData>(
            r#"{"normalBounds":{"x":0,"y":0,"width":0,"height":600}}"#,
        )
        .expect("state should deserialize before semantic validation");

        assert!(!state.is_valid());
    }
}

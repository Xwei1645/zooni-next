use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

const SETTINGS_FILE_NAME: &str = "settings.json";
const PERSIST_DELAY: Duration = Duration::from_millis(500);
const DEFAULT_BACKGROUND_OPACITY: u8 = 100;

#[derive(Clone, Copy, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    System,
    Light,
    Dark,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AppSettings {
    appearance: Appearance,
    font_family: String,
    #[serde(default = "default_background_opacity")]
    background_opacity: u8,
}

impl AppSettings {
    fn is_valid(&self) -> bool {
        !self.font_family.trim().is_empty() && self.background_opacity <= 100
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            appearance: Appearance::System,
            font_family: "__default__".into(),
            background_opacity: DEFAULT_BACKGROUND_OPACITY,
        }
    }
}

fn default_background_opacity() -> u8 {
    DEFAULT_BACKGROUND_OPACITY
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsSnapshot {
    settings: AppSettings,
    revision: u64,
}

struct SettingsStore {
    snapshot: Mutex<AppSettingsSnapshot>,
    path: Option<PathBuf>,
}

#[derive(Clone)]
pub struct AppSettingsState(Arc<SettingsStore>);

impl AppSettingsState {
    pub fn load(app: &AppHandle) -> Self {
        let path = match settings_path(app) {
            Ok(path) => Some(path),
            Err(error) => {
                eprintln!("Failed to resolve settings path: {error}");
                None
            }
        };

        let settings = path
            .as_deref()
            .and_then(|path| load_settings(path).ok())
            .unwrap_or_else(|| {
                let defaults = AppSettings::default();

                if let Some(path) = path.as_deref() {
                    if let Err(error) = write_settings(path, &defaults) {
                        eprintln!("Failed to write default settings: {error}");
                    }
                }

                defaults
            });

        Self(Arc::new(SettingsStore {
            snapshot: Mutex::new(AppSettingsSnapshot {
                settings,
                revision: 0,
            }),
            path,
        }))
    }

    fn snapshot(&self) -> Result<AppSettingsSnapshot, String> {
        self.0
            .snapshot
            .lock()
            .map(|snapshot| snapshot.clone())
            .map_err(|error| error.to_string())
    }

    fn update(&self, settings: AppSettings) -> Result<AppSettingsSnapshot, String> {
        if !settings.is_valid() {
            return Err("Settings are invalid".into());
        }

        let mut snapshot = self.0.snapshot.lock().map_err(|error| error.to_string())?;
        snapshot.settings = settings;
        snapshot.revision += 1;
        Ok(snapshot.clone())
    }

    fn schedule_persist(&self, revision: u64) {
        let state = self.clone();

        thread::spawn(move || {
            thread::sleep(PERSIST_DELAY);

            let snapshot = match state.snapshot() {
                Ok(snapshot) if snapshot.revision == revision => snapshot,
                Ok(_) => return,
                Err(error) => {
                    eprintln!("Failed to access settings for persistence: {error}");
                    return;
                }
            };

            let Some(path) = state.0.path.as_deref() else {
                return;
            };

            if let Err(error) = write_settings(path, &snapshot.settings) {
                eprintln!("Failed to persist settings: {error}");
            }
        });
    }
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, AppSettingsState>) -> Result<AppSettingsSnapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub fn update_app_settings(
    app: AppHandle,
    state: State<'_, AppSettingsState>,
    settings: AppSettings,
) -> Result<AppSettingsSnapshot, String> {
    let snapshot = state.update(settings)?;

    if let Err(error) = app.emit("settings-changed", snapshot.clone()) {
        eprintln!("Failed to broadcast settings update: {error}");
    }

    state.schedule_persist(snapshot.revision);
    Ok(snapshot)
}

fn load_settings(path: &Path) -> Result<AppSettings, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let settings =
        serde_json::from_str::<AppSettings>(&contents).map_err(|error| error.to_string())?;

    if settings.is_valid() {
        Ok(settings)
    } else {
        Err("Settings are invalid".into())
    }
}

fn write_settings(path: &Path, settings: &AppSettings) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Settings directory is unavailable".to_string())?;

    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let contents = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(SETTINGS_FILE_NAME))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::AppSettings;

    #[test]
    fn rejects_invalid_settings_content() {
        assert!(serde_json::from_str::<AppSettings>(
            r#"{"appearance":"violet","fontFamily":"Inter"}"#,
        )
        .is_err());
        assert!(serde_json::from_str::<AppSettings>(
            r#"{"appearance":"light","fontFamily":"Inter","unexpected":true}"#,
        )
        .is_err());
    }

    #[test]
    fn rejects_blank_font_family() {
        let settings =
            serde_json::from_str::<AppSettings>(r#"{"appearance":"light","fontFamily":"   "}"#)
                .expect("settings should deserialize before semantic validation");

        assert!(!settings.is_valid());
    }

    #[test]
    fn defaults_missing_background_opacity() {
        let settings =
            serde_json::from_str::<AppSettings>(r#"{"appearance":"light","fontFamily":"Inter"}"#)
                .expect("existing settings should remain valid");

        assert_eq!(settings.background_opacity, 100);
    }
}

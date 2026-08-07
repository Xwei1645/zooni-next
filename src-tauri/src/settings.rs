use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use log::error;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

const SETTINGS_FILE_NAME: &str = "settings.json";
const PERSIST_DELAY: Duration = Duration::from_millis(500);
const DEFAULT_BACKGROUND_OPACITY: u8 = 100;
const DEFAULT_WINDOW_ANIMATION: bool = true;
const DEFAULT_HIDE_TASKBAR_ICON: bool = true;
const DEFAULT_LAUNCH_AT_STARTUP: bool = false;

#[derive(Clone, Copy, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    System,
    Light,
    Dark,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdatePolicy {
    Disabled,
    Notify,
    AutoDownload,
    AutoInstall,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowLevel {
    Top,
    Normal,
    Bottom,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AppSettings {
    appearance: Appearance,
    font_family: String,
    background_opacity: u8,
    window_animation: bool,
    hide_taskbar_icon: bool,
    launch_at_startup: bool,
    window_level: WindowLevel,
    pub update_policy: UpdatePolicy,
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
            window_animation: DEFAULT_WINDOW_ANIMATION,
            hide_taskbar_icon: DEFAULT_HIDE_TASKBAR_ICON,
            launch_at_startup: DEFAULT_LAUNCH_AT_STARTUP,
            window_level: WindowLevel::Normal,
            update_policy: UpdatePolicy::Notify,
        }
    }
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
                error!("failed to resolve settings path: {error}");
                None
            }
        };

        let mut settings = path
            .as_deref()
            .and_then(|path| load_settings(path).ok())
            .unwrap_or_else(|| {
                let defaults = AppSettings::default();

                if let Some(path) = path.as_deref() {
                    if let Err(error) = write_settings(path, &defaults) {
                        error!("failed to write default settings: {error}");
                    }
                }

                defaults
            });

        settings.launch_at_startup = match app.autolaunch().is_enabled() {
            Ok(enabled) => enabled,
            Err(error) => {
                error!("failed to read autostart state: {error}");
                settings.launch_at_startup
            }
        };

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

    pub fn apply_main_window_taskbar_visibility(&self, app: &AppHandle) -> Result<(), String> {
        let settings = self.snapshot()?.settings;
        set_main_window_skip_taskbar(app, settings.hide_taskbar_icon)
    }

    pub fn apply_main_window_level(&self, app: &AppHandle) -> Result<(), String> {
        let settings = self.snapshot()?.settings;
        set_main_window_level(app, settings.window_level)
    }

    fn schedule_persist(&self, revision: u64) {
        let state = self.clone();

        thread::spawn(move || {
            thread::sleep(PERSIST_DELAY);

            let snapshot = match state.snapshot() {
                Ok(snapshot) if snapshot.revision == revision => snapshot,
                Ok(_) => return,
                Err(error) => {
                    error!("failed to access settings for persistence: {error}");
                    return;
                }
            };

            let Some(path) = state.0.path.as_deref() else {
                return;
            };

            if let Err(error) = write_settings(path, &snapshot.settings) {
                error!("failed to persist settings: {error}");
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
    set_main_window_skip_taskbar(&app, settings.hide_taskbar_icon)?;
    apply_launch_at_startup(&app, settings.launch_at_startup)?;
    set_main_window_level(&app, settings.window_level)?;
    let snapshot = state.update(settings)?;

    if let Err(error) = app.emit("settings-changed", snapshot.clone()) {
        error!("failed to broadcast settings update: {error}");
    }

    state.schedule_persist(snapshot.revision);
    Ok(snapshot)
}

fn apply_launch_at_startup(app: &AppHandle, launch_at_startup: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    let enabled = autostart.is_enabled().map_err(|error| error.to_string())?;

    if enabled == launch_at_startup {
        return Ok(());
    }

    if launch_at_startup {
        autostart.enable().map_err(|error| error.to_string())
    } else {
        autostart.disable().map_err(|error| error.to_string())
    }
}

fn set_main_window_skip_taskbar(app: &AppHandle, skip_taskbar: bool) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?
        .set_skip_taskbar(skip_taskbar)
        .map_err(|error| error.to_string())
}

fn set_main_window_level(app: &AppHandle, level: WindowLevel) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?;

    match level {
        WindowLevel::Top => {
            window.set_always_on_bottom(false).map_err(|error| error.to_string())?;
            window.set_always_on_top(true).map_err(|error| error.to_string())?;
        }
        WindowLevel::Normal => {
            window.set_always_on_top(false).map_err(|error| error.to_string())?;
            window.set_always_on_bottom(false).map_err(|error| error.to_string())?;
        }
        WindowLevel::Bottom => {
            window.set_always_on_top(false).map_err(|error| error.to_string())?;
            window.set_always_on_bottom(true).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
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

    fn full_settings_json(policy: &str) -> String {
        format!(
            r#"{{"appearance":"light","fontFamily":"Inter","backgroundOpacity":80,"windowAnimation":true,"hideTaskbarIcon":true,"launchAtStartup":false,"windowLevel":"normal","updatePolicy":"{policy}"}}"#,
        )
    }

    #[test]
    fn rejects_invalid_settings_content() {
        assert!(serde_json::from_str::<AppSettings>(
            r#"{"appearance":"violet","fontFamily":"Inter","backgroundOpacity":80,"windowAnimation":true,"hideTaskbarIcon":true,"launchAtStartup":false,"windowLevel":"normal","updatePolicy":"notify"}"#,
        )
        .is_err());
        assert!(serde_json::from_str::<AppSettings>(
            r#"{"appearance":"light","fontFamily":"Inter","backgroundOpacity":80,"windowAnimation":true,"hideTaskbarIcon":true,"launchAtStartup":false,"windowLevel":"normal","updatePolicy":"notify","unexpected":true}"#,
        )
        .is_err());
    }

    #[test]
    fn rejects_blank_font_family() {
        let settings = serde_json::from_str::<AppSettings>(&full_settings_json("notify").replace(
            "\"fontFamily\":\"Inter\"",
            "\"fontFamily\":\"   \"",
        ))
        .expect("settings should deserialize before semantic validation");

        assert!(!settings.is_valid());
    }

    #[test]
    fn rejects_missing_required_fields() {
        assert!(serde_json::from_str::<AppSettings>(
            r#"{"appearance":"light","fontFamily":"Inter"}"#,
        )
        .is_err());
    }

    #[test]
    fn accepts_all_update_policies() {
        for policy in ["disabled", "notify", "autoDownload", "autoInstall"] {
            let settings = serde_json::from_str::<AppSettings>(&full_settings_json(policy));
            assert!(settings.is_ok(), "expected {policy} to be valid");
        }
    }
}

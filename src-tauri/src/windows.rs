use std::sync::Mutex;

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

const OPTIONS_WINDOW_LABEL: &str = "options";

#[derive(Default)]
struct OptionsWindowStatus {
    ready: bool,
    requested: bool,
}

pub struct OptionsWindowState(Mutex<OptionsWindowStatus>);

impl Default for OptionsWindowState {
    fn default() -> Self {
        Self(Mutex::new(OptionsWindowStatus::default()))
    }
}

pub fn preload_options_window(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(OPTIONS_WINDOW_LABEL).is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        OPTIONS_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Zooni Next 选项")
    .inner_size(760.0, 560.0)
    .min_inner_size(640.0, 460.0)
    .center()
    .decorations(false)
    .resizable(true)
    .visible(false)
    .build()?;

    Ok(())
}

#[tauri::command]
pub fn open_options_window(
    app: AppHandle,
    state: State<'_, OptionsWindowState>,
) -> Result<(), String> {
    let ready = {
        let mut status = state.0.lock().map_err(|error| error.to_string())?;
        status.requested = true;
        status.ready
    };

    if ready {
        show_options_window(&app)?;
    }

    Ok(())
}

#[tauri::command]
pub fn options_window_ready(
    app: AppHandle,
    state: State<'_, OptionsWindowState>,
) -> Result<(), String> {
    let requested = {
        let mut status = state.0.lock().map_err(|error| error.to_string())?;
        status.ready = true;
        status.requested
    };

    if requested {
        show_options_window(&app)?;
    }

    Ok(())
}

#[tauri::command]
pub fn hide_options_window(
    app: AppHandle,
    state: State<'_, OptionsWindowState>,
) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .requested = false;

    app.get_webview_window(OPTIONS_WINDOW_LABEL)
        .ok_or_else(|| "Options window is unavailable".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

fn show_options_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(OPTIONS_WINDOW_LABEL)
        .ok_or_else(|| "Options window is unavailable".to_string())?;

    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

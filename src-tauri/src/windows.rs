use std::sync::Mutex;

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

const OPTIONS_WINDOW_LABEL: &str = "options";
const SUBJECTS_WINDOW_LABEL: &str = "subjects";
const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Default)]
struct OptionsWindowStatus {
    ready: bool,
    requested: bool,
}

#[derive(Default)]
struct SubjectsWindowStatus {
    ready: bool,
    requested: bool,
    positioned: bool,
}

pub struct OptionsWindowState(Mutex<OptionsWindowStatus>);

pub struct SubjectsWindowState(Mutex<SubjectsWindowStatus>);

impl Default for OptionsWindowState {
    fn default() -> Self {
        Self(Mutex::new(OptionsWindowStatus::default()))
    }
}

impl Default for SubjectsWindowState {
    fn default() -> Self {
        Self(Mutex::new(SubjectsWindowStatus::default()))
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

pub fn preload_subjects_window(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(SUBJECTS_WINDOW_LABEL).is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        SUBJECTS_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Zooni Next 科目管理")
    .inner_size(440.0, 420.0)
    .min_inner_size(360.0, 300.0)
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
pub fn open_subjects_window(
    app: AppHandle,
    state: State<'_, SubjectsWindowState>,
) -> Result<(), String> {
    let (ready, should_position) = {
        let mut status = state.0.lock().map_err(|error| error.to_string())?;
        status.requested = true;
        (status.ready, !status.positioned)
    };

    if ready {
        show_subjects_window(&app, should_position)?;

        if should_position {
            state
                .0
                .lock()
                .map_err(|error| error.to_string())?
                .positioned = true;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn subjects_window_ready(
    app: AppHandle,
    state: State<'_, SubjectsWindowState>,
) -> Result<(), String> {
    let (requested, should_position) = {
        let mut status = state.0.lock().map_err(|error| error.to_string())?;
        status.ready = true;
        (status.requested, !status.positioned)
    };

    if requested {
        show_subjects_window(&app, should_position)?;

        if should_position {
            state
                .0
                .lock()
                .map_err(|error| error.to_string())?
                .positioned = true;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn hide_options_window(
    app: AppHandle,
    state: State<'_, OptionsWindowState>,
) -> Result<(), String> {
    state.0.lock().map_err(|error| error.to_string())?.requested = false;

    app.get_webview_window(OPTIONS_WINDOW_LABEL)
        .ok_or_else(|| "Options window is unavailable".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_subjects_window(
    app: AppHandle,
    state: State<'_, SubjectsWindowState>,
) -> Result<(), String> {
    state.0.lock().map_err(|error| error.to_string())?.requested = false;

    app.get_webview_window(SUBJECTS_WINDOW_LABEL)
        .ok_or_else(|| "Subjects window is unavailable".to_string())?
        .hide()
        .map_err(|error| error.to_string())
}

fn show_options_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(OPTIONS_WINDOW_LABEL)
        .ok_or_else(|| "Options window is unavailable".to_string())?;

    window.unminimize().ok();
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

fn show_subjects_window(app: &AppHandle, should_position: bool) -> Result<(), String> {
    let window = app
        .get_webview_window(SUBJECTS_WINDOW_LABEL)
        .ok_or_else(|| "Subjects window is unavailable".to_string())?;

    if should_position {
        let main_window = app
            .get_webview_window(MAIN_WINDOW_LABEL)
            .ok_or_else(|| "Main window is unavailable".to_string())?;
        let main_position = main_window
            .outer_position()
            .map_err(|error| error.to_string())?;
        let main_size = main_window
            .outer_size()
            .map_err(|error| error.to_string())?;
        let window_size = window.outer_size().map_err(|error| error.to_string())?;
        let position = tauri::PhysicalPosition::new(
            main_position.x + (main_size.width as i32 - window_size.width as i32) / 2,
            main_position.y + (main_size.height as i32 - window_size.height as i32) / 2,
        );

        window
            .set_position(position)
            .map_err(|error| error.to_string())?;
    }

    window.unminimize().ok();
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

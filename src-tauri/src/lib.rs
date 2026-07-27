mod assignments;
mod board_state;
mod fonts;
mod settings;
mod subjects;
mod window_state;
mod windows;

use tauri::Manager;

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(windows::OptionsWindowState::default())
        .manage(windows::SubjectsWindowState::default())
        .setup(|app| {
            app.manage(board_state::BoardState::load(&app.handle()));
            let window_state = window_state::MainWindowState::load(&app.handle());
            window_state.restore_main_window(&app.handle())?;
            app.manage(window_state);
            let settings = settings::AppSettingsState::load(&app.handle());
            settings.apply_main_window_taskbar_visibility(&app.handle())?;
            app.manage(settings);
            app.manage(subjects::SubjectState::load(&app.handle()));
            app.manage(assignments::AssignmentState::load(&app.handle()));
            windows::preload_options_window(&app.handle())?;
            windows::preload_subjects_window(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            board_state::get_board_state,
            board_state::update_board_state,
            fonts::list_system_fonts,
            settings::get_app_settings,
            settings::update_app_settings,
            subjects::get_subjects,
            subjects::create_subject,
            subjects::update_subject,
            subjects::delete_subject,
            assignments::get_assignments,
            assignments::create_assignment,
            assignments::update_assignment,
            assignments::delete_assignment,
            window_state::get_main_window_state,
            window_state::update_main_window_state,
            exit_app,
            windows::open_options_window,
            windows::options_window_ready,
            windows::hide_options_window,
            windows::open_subjects_window,
            windows::subjects_window_ready,
            windows::hide_subjects_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

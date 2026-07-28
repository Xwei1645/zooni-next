mod assignments;
mod board_state;
mod fonts;
mod settings;
mod subjects;
mod updater;
mod window_state;
mod windows;

use log::{error, info, LevelFilter};
use tauri::Manager;
use tauri_plugin_log::{FileOpenStrategy, RotationStrategy, Target, TargetKind};

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("zooni-next".into()),
                    }),
                ])
                .level(if cfg!(debug_assertions) {
                    LevelFilter::Debug
                } else {
                    LevelFilter::Info
                })
                .max_file_size(1024 * 1024)
                .file_open_strategy(FileOpenStrategy::Rotate)
                .rotation_strategy(RotationStrategy::KeepSome(10))
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(windows::OptionsWindowState::default())
        .manage(windows::SubjectsWindowState::default())
        .setup(|app| {
            info!("application startup");
            app.manage(board_state::BoardState::load(&app.handle()));
            let window_state = window_state::MainWindowState::load(&app.handle());
            window_state.restore_main_window(&app.handle())?;
            app.manage(window_state);
            let settings = settings::AppSettingsState::load(&app.handle());
            settings.apply_main_window_taskbar_visibility(&app.handle())?;
            app.manage(settings);
            app.manage(updater::UpdateState::new(&app.handle()));
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
            window_state::update_main_window_placement,
            window_state::update_main_window_collapsed_y,
            updater::get_update_snapshot,
            updater::check_for_update,
            updater::apply_update_policy,
            exit_app,
            windows::open_options_window,
            windows::options_window_ready,
            windows::hide_options_window,
            windows::open_subjects_window,
            windows::subjects_window_ready,
            windows::hide_subjects_window
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| error!("application shutdown failed: {error}"));
}

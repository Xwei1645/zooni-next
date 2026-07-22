mod fonts;
mod settings;
mod windows;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(windows::OptionsWindowState::default())
        .setup(|app| {
            app.manage(settings::AppSettingsState::load(&app.handle()));
            windows::preload_options_window(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fonts::list_system_fonts,
            settings::get_app_settings,
            settings::update_app_settings,
            windows::open_options_window,
            windows::options_window_ready,
            windows::hide_options_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

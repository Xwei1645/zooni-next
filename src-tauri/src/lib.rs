mod fonts;
mod settings;
mod windows;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(windows::OptionsWindowState::default())
        .setup(|app| {
            windows::preload_options_window(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            fonts::list_system_fonts,
            settings::get_app_settings,
            settings::save_app_settings,
            windows::open_options_window,
            windows::options_window_ready,
            windows::hide_options_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

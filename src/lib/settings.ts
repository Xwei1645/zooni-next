import { invoke } from "@tauri-apps/api/core";

import { type AppSettings } from "@/lib/appearance";

export function loadAppSettings() {
  return invoke<AppSettings>("get_app_settings");
}

export function saveAppSettings(settings: AppSettings) {
  return invoke("save_app_settings", { settings });
}

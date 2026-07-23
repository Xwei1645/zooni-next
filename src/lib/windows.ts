import { invoke } from "@tauri-apps/api/core";

export async function openOptionsWindow() {
  await invoke("open_options_window");
}

export async function openSubjectsWindow() {
  await invoke("open_subjects_window");
}

export async function exitApp() {
  await invoke("exit_app");
}

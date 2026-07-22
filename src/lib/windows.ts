import { invoke } from "@tauri-apps/api/core";

export async function openOptionsWindow() {
  await invoke("open_options_window");
}

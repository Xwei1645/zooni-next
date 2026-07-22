import { invoke } from "@tauri-apps/api/core";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MainWindowState {
  normalBounds?: WindowBounds;
  collapsedY?: number;
}

export function loadMainWindowState() {
  return invoke<MainWindowState>("get_main_window_state");
}

export function updateMainWindowState(windowState: MainWindowState) {
  return invoke("update_main_window_state", { windowState });
}

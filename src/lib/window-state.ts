import { invoke } from "@tauri-apps/api/core";

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowInnerSize {
  width: number;
  height: number;
}

export interface WindowPlacement {
  outerPosition: WindowPosition;
  innerSize: WindowInnerSize;
}

export interface MainWindowState {
  normalPlacement?: WindowPlacement;
  collapsedY?: number;
}

export function loadMainWindowState() {
  return invoke<MainWindowState>("get_main_window_state");
}

export function updateMainWindowPlacement(placement: WindowPlacement) {
  return invoke("update_main_window_placement", { placement });
}

export function updateMainWindowCollapsedY(collapsedY: number) {
  return invoke("update_main_window_collapsed_y", { collapsedY });
}

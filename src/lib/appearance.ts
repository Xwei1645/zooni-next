export type Appearance = "system" | "light" | "dark";
export type FontFamily = string;

export const DEFAULT_FONT_FAMILY = "__default__";

export interface AppSettings {
  appearance: Appearance;
  fontFamily: FontFamily;
  backgroundOpacity: number;
  windowAnimation: boolean;
}

export const defaultSettings: AppSettings = {
  appearance: "system",
  fontFamily: DEFAULT_FONT_FAMILY,
  backgroundOpacity: 100,
  windowAnimation: true,
};

const DEFAULT_FONT_STACK =
  '"Inter Variable", "Noto Sans CJK SC", "Noto Sans CJK TC", "Noto Sans", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Yu Gothic", "Malgun Gothic", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const SYSTEM_FONT_FALLBACK =
  '"Noto Sans CJK SC", "Noto Sans CJK TC", "Noto Sans", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Yu Gothic", "Malgun Gothic", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function applyAppearance(
  appearance: Appearance,
  prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
) {
  const isDark = appearance === "dark" || (appearance === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
}

export function fontFamilyStack(fontFamily: FontFamily) {
  return fontFamily === DEFAULT_FONT_FAMILY
    ? DEFAULT_FONT_STACK
    : `${JSON.stringify(fontFamily)}, ${SYSTEM_FONT_FALLBACK}`;
}

export function applyFontFamily(fontFamily: FontFamily) {
  document.documentElement.style.setProperty(
    "--app-font-sans",
    fontFamilyStack(fontFamily),
  );
}

export function applyWindowBackgroundOpacity(backgroundOpacity: number) {
  const windowOpacity = Math.min(Math.max(backgroundOpacity, 0), 100);
  const toolbarOpacity = Math.min(windowOpacity + 15, 100);

  document.documentElement.style.setProperty(
    "--window-background-opacity",
    String(windowOpacity / 100),
  );
  document.documentElement.style.setProperty(
    "--toolbar-background-opacity",
    String(toolbarOpacity / 100),
  );
}

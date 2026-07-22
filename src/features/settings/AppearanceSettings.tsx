import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  applyAppearance,
  applyFontFamily,
  type Appearance,
  type AppSettings,
  type FontFamily,
  defaultSettings,
  DEFAULT_FONT_FAMILY,
  fontFamilyStack,
} from "@/lib/appearance";
import { loadAppSettings, saveAppSettings } from "@/lib/settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppearanceSettings() {
  const [appearance, setAppearance] = useState<Appearance>(defaultSettings.appearance);
  const [fontFamily, setFontFamily] = useState<FontFamily>(defaultSettings.fontFamily);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontsLoading, setFontsLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void loadAppSettings()
      .then((settings) => {
        if (active) {
          setAppearance(settings.appearance);
          setFontFamily(settings.fontFamily);
        }
      })
      .finally(() => {
        if (active) {
          setSettingsLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void invoke<string[]>("list_system_fonts")
      .then((fonts) => {
        if (active) {
          setSystemFonts(fonts);
        }
      })
      .catch(() => {
        if (active) {
          setSystemFonts([]);
        }
      })
      .finally(() => {
        if (active) {
          setFontsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateAppearance = () => applyAppearance(appearance, mediaQuery.matches);

    updateAppearance();
    if (appearance !== "system") {
      return;
    }

    mediaQuery.addEventListener("change", updateAppearance);
    return () => mediaQuery.removeEventListener("change", updateAppearance);
  }, [appearance]);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const settings: AppSettings = { appearance, fontFamily };
    void saveAppSettings(settings)
      .then(() => emit("settings-changed", settings))
      .catch(() => undefined);
  }, [appearance, fontFamily, settingsLoaded]);

  return (
    <section className="settings-panel" aria-labelledby="appearance-title">
      <div className="settings-panel-header">
        <h2 id="appearance-title">外观</h2>
      </div>
      <div className="settings-section settings-appearance-row">
        <div className="settings-field-heading">
          <h3>明暗模式</h3>
          <p>选择应用使用的颜色主题。</p>
        </div>
        <ButtonGroup className="appearance-options" aria-label="明暗模式">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={appearance === "system" ? "appearance-option-active" : undefined}
            disabled={!settingsLoaded}
            onClick={() => setAppearance("system")}
          >
            <Monitor aria-hidden="true" />
            跟随系统
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={appearance === "light" ? "appearance-option-active" : undefined}
            disabled={!settingsLoaded}
            onClick={() => setAppearance("light")}
          >
            <Sun aria-hidden="true" />
            浅色
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={appearance === "dark" ? "appearance-option-active" : undefined}
            disabled={!settingsLoaded}
            onClick={() => setAppearance("dark")}
          >
            <Moon aria-hidden="true" />
            深色
          </Button>
        </ButtonGroup>
      </div>
      <div className="settings-section settings-font-row">
        <div className="settings-field-heading">
          <h3>字体</h3>
          <p>设置应用的全局字体和作业文本的默认字体。</p>
        </div>
        <Select
          value={fontFamily}
          onValueChange={(value) => {
            if (value) {
              setFontFamily(value as FontFamily);
            }
          }}
        >
          <SelectTrigger
            className="font-select"
            aria-label="字体"
            disabled={!settingsLoaded}
            style={{ fontFamily: fontFamilyStack(fontFamily) }}
          >
            <SelectValue placeholder="选择字体">
              {fontFamily === DEFAULT_FONT_FAMILY ? "系统默认" : fontFamily}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value={DEFAULT_FONT_FAMILY}
              style={{ fontFamily: fontFamilyStack(DEFAULT_FONT_FAMILY) }}
            >
              系统默认
            </SelectItem>
            {fontsLoading && (
              <SelectItem value="__loading__" disabled>
                正在读取系统字体...
              </SelectItem>
            )}
            {systemFonts.map((font) => (
              <SelectItem
                key={font}
                value={font}
                style={{ fontFamily: fontFamilyStack(font) }}
              >
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

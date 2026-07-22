import { useEffect, useState } from "react";
import { LoaderCircle, Monitor, Moon, Sun } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  type AppSettings,
  type FontFamily,
  DEFAULT_FONT_FAMILY,
  fontFamilyStack,
} from "@/lib/appearance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AppearanceSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

export function AppearanceSettings({
  settings,
  onSettingsChange,
}: AppearanceSettingsProps) {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontsLoading, setFontsLoading] = useState(true);

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
            className={settings.appearance === "system" ? "appearance-option-active" : undefined}
            onClick={() =>
              onSettingsChange({ ...settings, appearance: "system" })
            }
          >
            <Monitor aria-hidden="true" />
            跟随系统
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={settings.appearance === "light" ? "appearance-option-active" : undefined}
            onClick={() =>
              onSettingsChange({ ...settings, appearance: "light" })
            }
          >
            <Sun aria-hidden="true" />
            浅色
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={settings.appearance === "dark" ? "appearance-option-active" : undefined}
            onClick={() =>
              onSettingsChange({ ...settings, appearance: "dark" })
            }
          >
            <Moon aria-hidden="true" />
            深色
          </Button>
        </ButtonGroup>
      </div>
      <div className="settings-section settings-font-row">
        <div className="settings-field-heading">
          <div className="settings-field-title">
            <h3>字体</h3>
            {fontsLoading && (
              <LoaderCircle
                className="font-loading-indicator"
                aria-label="正在读取系统字体"
                role="status"
              />
            )}
          </div>
          <p>设置应用的全局字体和作业文本的默认字体。</p>
        </div>
        <Select
          value={settings.fontFamily}
          onValueChange={(value) => {
            if (value) {
              onSettingsChange({ ...settings, fontFamily: value as FontFamily });
            }
          }}
        >
          <SelectTrigger
            className="font-select"
            aria-label="字体"
            disabled={fontsLoading}
            style={{ fontFamily: fontFamilyStack(settings.fontFamily) }}
          >
            <SelectValue placeholder="选择字体">
              {settings.fontFamily === DEFAULT_FONT_FAMILY ? "系统默认" : settings.fontFamily}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value={DEFAULT_FONT_FAMILY}
              style={{ fontFamily: fontFamilyStack(DEFAULT_FONT_FAMILY) }}
            >
              系统默认
            </SelectItem>
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

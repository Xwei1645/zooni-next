import { useEffect, useState } from "react";
import { LoaderCircle, Monitor, Moon, Sun } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { logError } from "@/lib/logger";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
  const [backgroundOpacity, setBackgroundOpacity] = useState(settings.backgroundOpacity);

  useEffect(() => {
    setBackgroundOpacity(settings.backgroundOpacity);
  }, [settings.backgroundOpacity]);

  useEffect(() => {
    let active = true;

    void invoke<string[]>("list_system_fonts")
      .then((fonts) => {
        if (active) {
          setSystemFonts(fonts);
        }
      })
      .catch((error) => {
        logError("appearance.list-system-fonts", error);
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
      <div className="settings-section settings-option-row">
        <div className="settings-field-heading">
          <h3>明暗模式</h3>
          <p>选择应用使用的颜色主题。</p>
        </div>
        <ButtonGroup className="settings-option-control appearance-options" aria-label="明暗模式">
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
      <div className="settings-section settings-option-row">
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
            className="font-select settings-option-control"
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
      <div className="settings-section settings-option-row">
        <div className="settings-field-heading">
          <h3>背景不透明度</h3>
          <p>调整主窗口背景的不透明程度。</p>
        </div>
        <div className="settings-option-control opacity-control">
          <Slider
            className="opacity-slider"
            min={0}
            max={100}
            step={1}
            value={[backgroundOpacity]}
            aria-label="主窗口背景不透明度"
            aria-valuetext={`${backgroundOpacity}%`}
            onValueChange={(values) => {
              const value = Array.isArray(values) ? values[0] : values;
              setBackgroundOpacity(value);
              onSettingsChange({ ...settings, backgroundOpacity: value });
            }}
          />
          <output className="opacity-value">{backgroundOpacity}%</output>
        </div>
      </div>
      <div className="settings-section settings-option-row">
        <div className="settings-field-heading">
          <h3>窗口缩放动画</h3>
          <p>控制主窗口全屏和收起时的是否显示缩放动画。</p>
        </div>
        <Switch className="settings-option-control"
          checked={settings.windowAnimation}
          aria-label="窗口缩放动画"
          onCheckedChange={() =>
            onSettingsChange({
              ...settings,
              windowAnimation: !settings.windowAnimation,
            })
          }
        />
      </div>
      <div className="settings-section settings-option-row">
        <div className="settings-field-heading">
          <h3>隐藏任务栏图标</h3>
          <p>隐藏主窗口在系统任务栏中的图标。</p>
        </div>
        <Switch className="settings-option-control"
          checked={settings.hideTaskbarIcon}
          aria-label="隐藏任务栏图标"
          onCheckedChange={() =>
            onSettingsChange({
              ...settings,
              hideTaskbarIcon: !settings.hideTaskbarIcon,
            })
          }
        />
      </div>
    </section>
  );
}

import { ArrowDownToLine, ArrowUpToLine, PanelTop } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Switch } from "@/components/ui/switch";
import { type AppSettings } from "@/lib/appearance";

interface GeneralSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

export function GeneralSettings({
  settings,
  onSettingsChange,
}: GeneralSettingsProps) {
  return (
    <section className="settings-panel" aria-labelledby="general-title">
      <div className="settings-panel-header">
        <h2 id="general-title">通用</h2>
      </div>
      <div className="settings-section settings-option-row">
        <div className="settings-field-heading">
          <h3>开机自启动</h3>
          <p>在开启计算机时自动打开应用。</p>
        </div>
        <Switch
          className="settings-option-control"
          checked={settings.launchAtStartup}
          aria-label="开机自启动"
          onCheckedChange={() =>
            onSettingsChange({
              ...settings,
              launchAtStartup: !settings.launchAtStartup,
            })
          }
        />
      </div>
      <div className="settings-section settings-option-row">
        <div className="settings-field-heading">
          <h3>窗口层级</h3>
          <p>控制主窗口相对其他窗口的显示层级。</p>
        </div>
        <ButtonGroup
          className="settings-option-control window-level-options"
          aria-label="窗口层级"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={settings.windowLevel === "top" ? "window-level-option-active" : undefined}
            onClick={() =>
              onSettingsChange({ ...settings, windowLevel: "top" })
            }
          >
            <ArrowUpToLine aria-hidden="true" />
            置顶
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={settings.windowLevel === "normal" ? "window-level-option-active" : undefined}
            onClick={() =>
              onSettingsChange({ ...settings, windowLevel: "normal" })
            }
          >
            <PanelTop aria-hidden="true" />
            普通
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={settings.windowLevel === "bottom" ? "window-level-option-active" : undefined}
            onClick={() =>
              onSettingsChange({ ...settings, windowLevel: "bottom" })
            }
          >
            <ArrowDownToLine aria-hidden="true" />
            置底
          </Button>
        </ButtonGroup>
      </div>
      <div className="settings-section settings-option-row">
        <div className="settings-field-heading">
          <h3>隐藏任务栏图标</h3>
          <p>隐藏主窗口在系统任务栏中的图标。</p>
        </div>
        <Switch
          className="settings-option-control"
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

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

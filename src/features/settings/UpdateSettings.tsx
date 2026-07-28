import { useEffect, useRef } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppSettings, UpdatePolicy } from "@/lib/appearance";
import { logError } from "@/lib/logger";
import { checkForUpdate, useUpdateSnapshot } from "@/lib/updater";

interface UpdateSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

const policyDescriptions: Record<UpdatePolicy, string> = {
  disabled: "不自动检查更新。你仍可在此页面手动检查。",
  notify: "启动后检查更新，发现新版本时通知你。",
};

export function UpdateSettings({ settings, onSettingsChange }: UpdateSettingsProps) {
  const snapshot = useUpdateSnapshot();
  const status = snapshot?.status ?? "idle";
  const title = statusLabel(snapshot);
  const isWorking = status === "checking";
  const reportedError = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (status !== "failed" || !snapshot?.error || reportedError.current === snapshot.error) {
      return;
    }

    reportedError.current = snapshot.error;
    toast.error("检查更新失败", { description: snapshot.error });
  }, [snapshot?.error, status]);

  function run(action: () => Promise<unknown>, scope: string) {
    void action().catch((error) => logError(scope, error));
  }

  return (
    <section className="settings-panel" aria-labelledby="update-title">
      <header className="settings-panel-header"><h2 id="update-title">更新</h2></header>
      <section className="settings-section update-status-section" aria-label="更新状态">
        <div className="update-status-heading">
          <div>
            <h3>{title}</h3>
            <p>{lastCheckedDescription(snapshot?.lastCheckedAt)}</p>
          </div>
          {isWorking && <LoaderCircle className="update-status-spinner" aria-label="正在处理" />}
        </div>
        <div className="update-actions">
          <Button type="button" variant="outline" size="sm" disabled={isWorking} onClick={() => run(checkForUpdate, "updater.check")}><RefreshCw aria-hidden="true" />检查更新</Button>
        </div>
      </section>
      <section className="settings-section settings-update-policy-row">
        <div className="settings-field-heading"><h3>更新策略</h3><p>设置应用何时自动检查更新。</p></div>
        <div className="update-policy-control">
          <Select value={settings.updatePolicy} onValueChange={(value) => { if (value) onSettingsChange({ ...settings, updatePolicy: value as UpdatePolicy }); }}>
            <SelectTrigger className="update-policy-select" aria-label="更新策略"><SelectValue>{policyLabel(settings.updatePolicy)}</SelectValue></SelectTrigger>
            <SelectContent className="update-policy-select-content">
              {Object.keys(policyDescriptions).map((policy) => <SelectItem key={policy} value={policy}>{policyLabel(policy as UpdatePolicy)}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="update-policy-description">{policyDescriptions[settings.updatePolicy]}</p>
        </div>
      </section>
      {snapshot?.notes && <section className="settings-section update-notes-section"><div className="settings-field-heading"><h3>{snapshot.availableVersion ? `版本 ${snapshot.availableVersion}` : "更新日志"}</h3></div><pre className="update-notes">{snapshot.notes}</pre></section>}
    </section>
  );
}

function statusLabel(snapshot: ReturnType<typeof useUpdateSnapshot>) {
  if (snapshot?.status === "checking") return "正在检查更新...";
  if (snapshot?.status === "upToDate") return "当前已是最新版本";
  if (snapshot?.status === "available") return `发现新版本 v${snapshot.availableVersion}`;
  return "检查更新";
}

function lastCheckedDescription(lastCheckedAt?: string) {
  if (!lastCheckedAt) return "上次检查：尚未检查";

  return `上次检查：${new Date(lastCheckedAt).toLocaleString("zh-CN", { hour12: false })}`;
}

function policyLabel(policy: UpdatePolicy) {
  return ({ disabled: "不检查", notify: "检查并通知" })[policy];
}

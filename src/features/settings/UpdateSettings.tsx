import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Download, LoaderCircle, PackageCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppSettings, UpdatePolicy } from "@/lib/appearance";
import { logError } from "@/lib/logger";
import { checkForUpdate, installUpdate, type UpdateSnapshot } from "@/lib/updater";

import changelogMarkdown from "../../../CHANGELOG.md?raw";

const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
};

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  );
}

interface UpdateSettingsProps {
  settings: AppSettings;
  snapshot: UpdateSnapshot | undefined;
  onSettingsChange: (settings: AppSettings) => void;
}

const policyDescriptions: Record<UpdatePolicy, string> = {
  disabled: "不自动检查更新。你可在此页面手动检查。",
  notify: "应用启动后自动检查更新，并在发现新版本时显示通知。",
  autoDownload: "应用启动后自动检查更新，并在后台下载新版本。",
  autoInstall: "应用启动后自动检查更新、下载新版本，并重启完成安装。",
};

export function UpdateSettings({ settings, snapshot, onSettingsChange }: UpdateSettingsProps) {
  const status = snapshot?.status;
  const isWorking = status === "checking" || status === "downloading" || status === "installing";
  const canInstall = status === "available" || status === "downloaded" || (status === "failed" && snapshot?.availableVersion != null);

  function run(action: () => Promise<unknown>, scope: string) {
    void action().catch((error) => logError(scope, error));
  }

  return (
    <section className="settings-panel" aria-labelledby="update-title">
      <header className="settings-panel-header"><h2 id="update-title">更新</h2></header>
      {snapshot && (
        <section className="settings-section update-status-section" aria-label="更新状态">
          <div className="update-status-heading">
            <div>
              <h3>{statusLabel(snapshot)}</h3>
              <p>{lastCheckedDescription(snapshot.lastCheckedAt)}</p>
            </div>
            {isWorking && <LoaderCircle className="update-status-spinner" aria-label="正在处理" />}
          </div>
          <div className="update-actions">
            <Button type="button" variant="outline" size="sm" disabled={isWorking} onClick={() => run(checkForUpdate, "updater.check")}><RefreshCw aria-hidden="true" />检查更新</Button>
            {canInstall && (
              <Button type="button" variant="default" size="sm" disabled={isWorking} onClick={() => run(installUpdate, "updater.install")}>
                {status === "downloaded" ? <PackageCheck aria-hidden="true" /> : <Download aria-hidden="true" />}
                {status === "downloaded" ? "立即安装" : status === "failed" ? "重新下载并安装" : "下载并安装"}
              </Button>
            )}
          </div>
          {status === "failed" && snapshot.error && (
            <div className="update-error-banner" role="alert">
              <span>{snapshot.error}</span>
            </div>
          )}
          {status === "downloading" && (
            <div className="update-progress-track" role="progressbar" aria-label="下载进度">
              <div className="update-progress-bar-indeterminate" />
            </div>
          )}
        </section>
      )}
      <section className="settings-section settings-option-row settings-update-policy-row">
        <div className="settings-field-heading"><h3>更新策略</h3><p>设置应用何时自动检查、下载和安装更新。</p></div>
        <div className="settings-option-control update-policy-block">
          <Select value={settings.updatePolicy} onValueChange={(value) => { if (value) onSettingsChange({ ...settings, updatePolicy: value as UpdatePolicy }); }}>
            <SelectTrigger className="update-policy-select-trigger" aria-label="更新策略"><SelectValue>{policyLabel(settings.updatePolicy)}</SelectValue></SelectTrigger>
            <SelectContent>
              {Object.keys(policyDescriptions).map((policy) => <SelectItem key={policy} value={policy}>{policyLabel(policy as UpdatePolicy)}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="update-policy-description">{policyDescriptions[settings.updatePolicy]}</p>
        </div>
      </section>
      {snapshot?.notes && (
        <section className="settings-section update-notes-section">
          <div className="settings-field-heading"><h3>新版本更新内容</h3></div>
          <ScrollArea className="update-notes-scroll-area" focusable={false}>
            <div className="update-notes">
              <Markdown>{snapshot.notes}</Markdown>
            </div>
          </ScrollArea>
        </section>
      )}
      <section className="settings-section update-changelog-section">
        <div className="settings-field-heading"><h3>更新日志</h3></div>
        <ScrollArea className="update-changelog-scroll-area" focusable={false}>
          <div className="update-notes">
            <Markdown>{changelogMarkdown}</Markdown>
          </div>
        </ScrollArea>
      </section>
    </section>
  );
}

function statusLabel(snapshot: UpdateSnapshot | undefined) {
  if (snapshot?.status === "checking") return "正在检查更新...";
  if (snapshot?.status === "downloading") return "正在下载更新...";
  if (snapshot?.status === "downloaded") return `v${snapshot.availableVersion} 准备就绪`;
  if (snapshot?.status === "installing") return "正在安装更新...";
  if (snapshot?.status === "upToDate") return "当前已是最新版本";
  if (snapshot?.status === "available") return `发现新版本 v${snapshot.availableVersion}`;
  if (snapshot?.status === "failed") return "更新操作失败";
  return "检查更新";
}

function lastCheckedDescription(lastCheckedAt?: string) {
  if (!lastCheckedAt) return "上次检查：尚未检查";

  return `上次检查：${new Date(lastCheckedAt).toLocaleString("zh-CN", { hour12: false })}`;
}

function policyLabel(policy: UpdatePolicy) {
  return ({ disabled: "不检查", notify: "检查并通知", autoDownload: "自动下载", autoInstall: "自动安装" })[policy];
}
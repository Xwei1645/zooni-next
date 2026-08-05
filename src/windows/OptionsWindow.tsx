import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Info,
  Minus,
  Palette,
  RefreshCw,
  Settings2,
  Square,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AboutSettings } from "@/features/settings/AboutSettings";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";
import { UpdateSettings } from "@/features/settings/UpdateSettings";
import { type AppSettings } from "@/lib/appearance";
import { logError } from "@/lib/logger";
import { updateAppSettings, useWindowSettings } from "@/lib/settings";

import "./OptionsWindow.css";

export function OptionsWindow() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeSection, setActiveSection] = useState<"appearance" | "update" | "about">("appearance");
  const settings = useWindowSettings();
  const readySignaled = useRef(false);

  useEffect(() => {
    void getCurrentWindow().isMaximized().then(setIsMaximized);
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        void invoke("hide_options_window");
      })
      .then((cleanup) => {
        if (active) {
          unlisten = cleanup;
          return;
        }

        cleanup();
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!settings || readySignaled.current) {
      return;
    }

    let active = true;

    void document.fonts.ready.then(() => {
      if (active && !readySignaled.current) {
        readySignaled.current = true;
        void invoke("options_window_ready");
      }
    });

    return () => {
      active = false;
    };
  }, [settings]);

  async function toggleMaximize() {
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  }

  function handleSettingsChange(nextSettings: AppSettings) {
    void updateAppSettings(nextSettings).catch((error) => logError("options.update-settings", error));
  }

  return (
    <main className="options-window">
      <header className="options-titlebar">
        <div
          className="options-drag-region"
          data-tauri-drag-region
          onDoubleClick={() => void toggleMaximize()}
        >
          <Settings2 aria-hidden="true" />
          <span>更多选项</span>
        </div>
        <div className="window-controls" aria-label="窗口控件">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="最小化"
            onClick={() => void getCurrentWindow().minimize()}
          >
            <Minus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={isMaximized ? "还原窗口" : "最大化"}
            onClick={() => void toggleMaximize()}
          >
            {isMaximized ? (
              <Copy aria-hidden="true" />
            ) : (
              <Square aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="window-close-button"
            aria-label="关闭窗口"
            onClick={() => void invoke("hide_options_window")}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类">
          <Button
            type="button"
            variant={activeSection === "appearance" ? "secondary" : "ghost"}
            className="settings-nav-item"
            aria-current={activeSection === "appearance" ? "page" : undefined}
            onClick={() => setActiveSection("appearance")}
          >
            <Palette aria-hidden="true" />
            外观
          </Button>
          <Button
            type="button"
            variant={activeSection === "update" ? "secondary" : "ghost"}
            className="settings-nav-item"
            aria-current={activeSection === "update" ? "page" : undefined}
            onClick={() => setActiveSection("update")}
          >
            <RefreshCw aria-hidden="true" />
            更新
          </Button>
          <Button
            type="button"
            variant={activeSection === "about" ? "secondary" : "ghost"}
            className="settings-nav-item"
            aria-current={activeSection === "about" ? "page" : undefined}
            onClick={() => setActiveSection("about")}
          >
            <Info aria-hidden="true" />
            关于
          </Button>
        </nav>
        <ScrollArea key={activeSection} className="settings-panel-scroll-area">
          {activeSection === "appearance" && settings && (
            <AppearanceSettings
              settings={settings}
              onSettingsChange={handleSettingsChange}
            />
          )}
          {activeSection === "update" && settings && (
            <UpdateSettings settings={settings} onSettingsChange={handleSettingsChange} />
          )}
          {activeSection === "about" && <AboutSettings />}
        </ScrollArea>
      </div>
      <Toaster position="bottom-right" richColors theme={settings?.appearance ?? "system"} />
    </main>
  );
}

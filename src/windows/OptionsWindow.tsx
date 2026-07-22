import { useEffect, useState } from "react";
import {
  Copy,
  Minus,
  Palette,
  Settings2,
  Square,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { Button } from "@/components/ui/button";
import { AppearanceSettings } from "@/features/settings";
import {
  applyAppearance,
  applyFontFamily,
  defaultSettings,
} from "@/lib/appearance";
import { loadAppSettings } from "@/lib/settings";

import "./OptionsWindow.css";

export function OptionsWindow() {
  const [isMaximized, setIsMaximized] = useState(false);

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
    let active = true;

    void loadAppSettings()
      .then((settings) => {
        applyAppearance(settings.appearance);
        applyFontFamily(settings.fontFamily);
      })
      .catch(() => {
        applyAppearance(defaultSettings.appearance);
        applyFontFamily(defaultSettings.fontFamily);
      })
      .finally(() => {
        void document.fonts.ready.then(() => {
          if (active) {
            void invoke("options_window_ready");
          }
        });
      });

    return () => {
      active = false;
    };
  }, []);

  async function toggleMaximize() {
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  }

  return (
    <main className="options-window">
      <header className="options-titlebar">
        <div className="options-drag-region" data-tauri-drag-region>
          <Settings2 aria-hidden="true" />
          <span>Zooni Next 选项</span>
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
            variant="secondary"
            className="settings-nav-item"
            aria-current="page"
          >
            <Palette aria-hidden="true" />
            外观
          </Button>
        </nav>
        <AppearanceSettings />
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import {
  BookOpen,
  Ellipsis,
  LockOpen,
  LogOut,
  Menu,
  Minus,
  PanelTopClose,
  Plus,
  Tags,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applyAppearance,
  applyFontFamily,
  type AppSettings,
  defaultSettings,
} from "@/lib/appearance";
import { loadAppSettings } from "@/lib/settings";
import { openOptionsWindow } from "@/lib/windows";

import "./App.css";

function App() {
  const [zoom, setZoom] = useState(100);
  const [columnCount, setColumnCount] = useState(3);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applySettings = (settings: AppSettings) => {
      applyAppearance(settings.appearance, mediaQuery.matches);
      applyFontFamily(settings.fontFamily);
    };
    let active = true;
    let unlisten: (() => void) | undefined;

    void loadAppSettings().then(applySettings).catch(() => applySettings(defaultSettings));

    if (isTauri()) {
      void listen<AppSettings>("settings-changed", ({ payload }) => {
        applySettings(payload);
      }).then((cleanup) => {
        if (active) {
          unlisten = cleanup;
          return;
        }

        cleanup();
      });
    }

    const updateSystemTheme = () => {
      loadAppSettings().then(applySettings).catch(() => applySettings(defaultSettings));
    };
    mediaQuery.addEventListener("change", updateSystemTheme);

    return () => {
      active = false;
      unlisten?.();
      mediaQuery.removeEventListener("change", updateSystemTheme);
    };
  }, []);

  return (
    <main>
      <div className="window-drag-handle" data-tauri-drag-region></div>
      <DropdownMenu>
        <ButtonGroup className="toolbar" role="toolbar" aria-label="页面工具栏">
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="添加"
          >
            <Plus aria-hidden="true" />
          </Button>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="菜单"
              />
            }
          >
            <Menu aria-hidden="true" />
          </DropdownMenuTrigger>
        </ButtonGroup>
        <DropdownMenuContent
          className="menu-content"
          align="end"
          side="top"
          sideOffset={8}
        >
          <DropdownMenuGroup className="menu-grid">
            <DropdownMenuItem
              className="menu-wide"
              onClick={() => void openOptionsWindow()}
            >
              <Ellipsis aria-hidden="true" />
              更多选项...
            </DropdownMenuItem>
            <DropdownMenuItem>
              <BookOpen aria-hidden="true" />
              科目
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Tags aria-hidden="true" />
              标签
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LockOpen aria-hidden="true" />
              解锁
            </DropdownMenuItem>
            <DropdownMenuItem>
              <PanelTopClose aria-hidden="true" />
              收起
            </DropdownMenuItem>
            <div className="menu-control">
              <span>界面缩放</span>
              <div className="menu-stepper" aria-label="界面缩放">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="缩小界面"
                  onClick={() => setZoom((value) => Math.max(50, value - 10))}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <span className="menu-stepper-value">{zoom}%</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="放大界面"
                  onClick={() => setZoom((value) => Math.min(200, value + 10))}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="menu-control">
              <span>作业列数</span>
              <div className="menu-stepper" aria-label="作业列数">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="减少作业列数"
                  onClick={() =>
                    setColumnCount((value) => Math.max(1, value - 1))
                  }
                >
                  <Minus aria-hidden="true" />
                </Button>
                <span className="menu-stepper-value">{columnCount} 列</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="增加作业列数"
                  onClick={() =>
                    setColumnCount((value) => Math.min(10, value + 1))
                  }
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </div>
            <DropdownMenuItem variant="destructive" className="menu-wide">
              <LogOut aria-hidden="true" />
              退出...
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </main>
  );
}

export default App;

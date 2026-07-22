import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  Ellipsis,
  LogOut,
  Maximize,
  Menu,
  Minimize,
  Minus,
  PanelRightClose,
  Plus,
  Tags,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow, monitorFromPoint } from "@tauri-apps/api/window";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyWindowBackgroundOpacity } from "@/lib/appearance";
import { useWindowSettings } from "@/lib/settings";
import {
  loadMainWindowState,
  type MainWindowState,
  type WindowBounds,
  updateMainWindowState,
} from "@/lib/window-state";
import { openOptionsWindow } from "@/lib/windows";

import "./App.css";

const COLLAPSED_WIDTH = 24;
const COLLAPSED_HEIGHT = 96;
const WINDOW_TRANSITION_DURATION = 280;

function windowBounds(position: PhysicalPosition, size: PhysicalSize): WindowBounds {
  return { x: position.x, y: position.y, width: size.width, height: size.height };
}

async function animateWindowBounds(
  appWindow: ReturnType<typeof getCurrentWindow>,
  fromPosition: PhysicalPosition,
  fromSize: PhysicalSize,
  toPosition: PhysicalPosition,
  toSize: PhysicalSize,
) {
  const startedAt = performance.now();
  let progress = 0;

  while (progress < 1) {
    const elapsed = performance.now() - startedAt;
    progress = Math.min(elapsed / WINDOW_TRANSITION_DURATION, 1);
    const easedProgress = 1 - (1 - progress) ** 3;
    const position = new PhysicalPosition(
      Math.round(fromPosition.x + (toPosition.x - fromPosition.x) * easedProgress),
      Math.round(fromPosition.y + (toPosition.y - fromPosition.y) * easedProgress),
    );
    const size = new PhysicalSize(
      Math.round(fromSize.width + (toSize.width - fromSize.width) * easedProgress),
      Math.round(fromSize.height + (toSize.height - fromSize.height) * easedProgress),
    );

    await Promise.all([appWindow.setPosition(position), appWindow.setSize(size)]);

    if (progress < 1) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
  }
}

function App() {
  const settings = useWindowSettings();
  const mainWindowShown = useRef(false);
  const backgroundOpacity = settings?.backgroundOpacity;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenTransitioning, setIsFullscreenTransitioning] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [columnCount, setColumnCount] = useState(3);
  const collapsedTab = useRef<{
    x: number;
    y: number;
    minY: number;
    maxY: number;
  } | undefined>(undefined);
  const tabDrag = useRef<{
    pointerY: number;
    startY: number;
    moved: boolean;
  } | undefined>(undefined);
  const tabWasDragged = useRef(false);
  const lastCollapsedTabY = useRef<number | undefined>(undefined);
  const isCollapsedRef = useRef(false);
  const isFullscreenRef = useRef(false);
  const isWindowTransitioning = useRef(false);
  const isFullscreenTransitioningRef = useRef(false);
  const windowState = useRef<MainWindowState>({});

  useEffect(() => {
    if (backgroundOpacity !== undefined) {
      applyWindowBackgroundOpacity(backgroundOpacity);
    }
  }, [backgroundOpacity]);

  useEffect(() => {
    if (!isTauri() || !settings || mainWindowShown.current) {
      return;
    }

    mainWindowShown.current = true;
    void getCurrentWindow().show().catch(() => undefined);
  }, [settings]);

  useEffect(() => {
    if (isTauri()) {
      void getCurrentWindow().isFullscreen().then((fullscreen) => {
        isFullscreenRef.current = fullscreen;
        setIsFullscreen(fullscreen);
      });
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void loadMainWindowState()
      .then((state) => {
        windowState.current = state;
        lastCollapsedTabY.current = state.collapsedY;
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let active = true;
    let timeout: number | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    const persistNormalBounds = () => {
      if (isCollapsedRef.current || isFullscreenRef.current) {
        return;
      }

      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        const appWindow = getCurrentWindow();

        void Promise.all([appWindow.outerPosition(), appWindow.outerSize()]).then(
          ([position, size]) => {
            if (!active || isCollapsedRef.current || isFullscreenRef.current) {
              return;
            }

            const nextState = {
              ...windowState.current,
              normalBounds: windowBounds(position, size),
            };
            windowState.current = nextState;
            void updateMainWindowState(nextState).catch(() => undefined);
          },
        );
      }, 150);
    };

    void getCurrentWindow().onMoved(persistNormalBounds).then((cleanup) => {
      if (active) {
        unlistenMoved = cleanup;
      } else {
        cleanup();
      }
    });
    void getCurrentWindow().onResized(persistNormalBounds).then((cleanup) => {
      if (active) {
        unlistenResized = cleanup;
      } else {
        cleanup();
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri() || !isFullscreen) {
      return;
    }

    const exitFullscreen = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void toggleFullscreen();
      }
    };

    window.addEventListener("keydown", exitFullscreen);
    return () => window.removeEventListener("keydown", exitFullscreen);
  }, [isFullscreen]);

  async function toggleFullscreen() {
    if (!isTauri() || isFullscreenTransitioningRef.current) {
      return;
    }

    const appWindow = getCurrentWindow();
    const nextFullscreen = !isFullscreen;
    isFullscreenTransitioningRef.current = true;
    setIsFullscreenTransitioning(true);

    try {
      if (nextFullscreen) {
        const [position, size] = await Promise.all([
          appWindow.outerPosition(),
          appWindow.outerSize(),
        ]);
        const monitor = await monitorFromPoint(position.x, position.y);
        const normalBounds = windowBounds(position, size);
        const nextState = { ...windowState.current, normalBounds };
        windowState.current = nextState;
        void updateMainWindowState(nextState).catch(() => undefined);

        // Suppress geometry persistence while expanding toward the fullscreen target.
        isFullscreenRef.current = true;
        if (monitor) {
          await animateWindowBounds(
            appWindow,
            position,
            size,
            monitor.workArea.position,
            monitor.workArea.size,
          );
        }
      }

      await appWindow.setFullscreen(nextFullscreen);

      if (!nextFullscreen) {
        const bounds = windowState.current.normalBounds;

        if (bounds) {
          await appWindow.setSize(new PhysicalSize(bounds.width, bounds.height));
          await appWindow.setPosition(new PhysicalPosition(bounds.x, bounds.y));
        }
      }

      isFullscreenRef.current = nextFullscreen;
      setIsFullscreen(nextFullscreen);
    } catch {
      isFullscreenRef.current = isFullscreen;
    } finally {
      window.requestAnimationFrame(() => {
        isFullscreenTransitioningRef.current = false;
        setIsFullscreenTransitioning(false);
      });
    }
  }

  async function collapseWindow() {
    if (!isTauri() || isCollapsed || isWindowTransitioning.current) {
      return;
    }

    const appWindow = getCurrentWindow();
    isWindowTransitioning.current = true;

    try {
      if (isFullscreen) {
        await appWindow.setFullscreen(false);
        isFullscreenRef.current = false;
        setIsFullscreen(false);
      }

      const [position, size] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.outerSize(),
      ]);
      const monitor = await monitorFromPoint(position.x, position.y);

      if (!monitor) {
        return;
      }

      const normalBounds = windowBounds(position, size);

      const minY = monitor.workArea.position.y;
      const maxY = monitor.workArea.position.y + monitor.workArea.size.height - COLLAPSED_HEIGHT;
      const defaultY = minY + Math.round((monitor.workArea.size.height - COLLAPSED_HEIGHT) / 2);
      const collapsedPosition = new PhysicalPosition(
        monitor.workArea.position.x + monitor.workArea.size.width - COLLAPSED_WIDTH,
        Math.min(maxY, Math.max(minY, lastCollapsedTabY.current ?? defaultY)),
      );
      collapsedTab.current = {
        x: collapsedPosition.x,
        y: collapsedPosition.y,
        minY,
        maxY,
      };
      lastCollapsedTabY.current = collapsedPosition.y;
      const nextState = {
        ...windowState.current,
        normalBounds,
        collapsedY: collapsedPosition.y,
      };
      windowState.current = nextState;

      isCollapsedRef.current = true;
      await appWindow.setResizable(false);
      await appWindow.setAlwaysOnTop(true);
      await animateWindowBounds(
        appWindow,
        position,
        size,
        collapsedPosition,
        new PhysicalSize(COLLAPSED_WIDTH, COLLAPSED_HEIGHT),
      );
      setIsCollapsed(true);
      void updateMainWindowState(nextState).catch(() => undefined);
    } catch {
      isCollapsedRef.current = false;
    } finally {
      isWindowTransitioning.current = false;
    }
  }

  async function restoreWindow() {
    const bounds = windowState.current.normalBounds;

    if (!bounds) {
      return;
    }

    if (isWindowTransitioning.current) {
      return;
    }

    try {
      const appWindow = getCurrentWindow();
      isWindowTransitioning.current = true;
      const [position, size] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.outerSize(),
      ]);
      setIsCollapsed(false);
      await animateWindowBounds(
        appWindow,
        position,
        size,
        new PhysicalPosition(bounds.x, bounds.y),
        new PhysicalSize(bounds.width, bounds.height),
      );
      await appWindow.setResizable(true);
      await appWindow.setAlwaysOnTop(false);
      isCollapsedRef.current = false;
      collapsedTab.current = undefined;
    } catch {
      // Keep the side tab available when restoration fails.
      isCollapsedRef.current = true;
      setIsCollapsed(true);
    } finally {
      isWindowTransitioning.current = false;
    }
  }

  function startTabDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const tab = collapsedTab.current;

    if (!tab) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    tabWasDragged.current = false;
    tabDrag.current = {
      pointerY: event.screenY * window.devicePixelRatio,
      startY: tab.y,
      moved: false,
    };
  }

  function moveTab(event: React.PointerEvent<HTMLButtonElement>) {
    const tab = collapsedTab.current;
    const drag = tabDrag.current;

    if (!tab || !drag) {
      return;
    }

    const y = Math.min(
      tab.maxY,
      Math.max(
        tab.minY,
        drag.startY + event.screenY * window.devicePixelRatio - drag.pointerY,
      ),
    );

    if (Math.abs(y - drag.startY) > 3) {
      drag.moved = true;
    }

    tab.y = y;
    lastCollapsedTabY.current = y;
    void getCurrentWindow()
      .setPosition(new PhysicalPosition(tab.x, y))
      .catch(() => undefined);
  }

  function endTabDrag() {
    const drag = tabDrag.current;
    tabDrag.current = undefined;
    tabWasDragged.current = drag?.moved ?? false;

    if (drag?.moved) {
      const nextState = { ...windowState.current, collapsedY: lastCollapsedTabY.current };
      windowState.current = nextState;
      void updateMainWindowState(nextState).catch(() => undefined);
    }
  }

  function restoreFromTabClick() {
    if (tabWasDragged.current) {
      tabWasDragged.current = false;
      return;
    }

    void restoreWindow();
  }

  return (
    <main
      className={
        isCollapsed
          ? "app-collapsed"
          : isFullscreenTransitioning
            ? "app-fullscreen-transition"
            : undefined
      }
    >
      {isCollapsed ? (
        <button
          type="button"
          className="collapsed-side-tab"
          aria-label="恢复窗口"
          onPointerDown={startTabDrag}
          onPointerMove={moveTab}
          onPointerUp={endTabDrag}
          onPointerCancel={endTabDrag}
          onClick={restoreFromTabClick}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
      ) : (
        <>
          {!isFullscreen && (
            <div className="window-drag-handle" data-tauri-drag-region></div>
          )}
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
            <DropdownMenuItem onClick={() => void toggleFullscreen()}>
              {isFullscreen ? (
                <Minimize aria-hidden="true" />
              ) : (
                <Maximize aria-hidden="true" />
              )}
              {isFullscreen ? "恢复" : "全屏"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void collapseWindow()}>
              <PanelRightClose aria-hidden="true" />
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
                  disabled={zoom <= 50}
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
                  disabled={zoom >= 200}
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
                  disabled={columnCount <= 1}
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
                  disabled={columnCount >= 10}
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
        </>
      )}
    </main>
  );
}

export default App;

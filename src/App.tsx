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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyWindowBackgroundOpacity } from "@/lib/appearance";
import {
  clearAssignmentDraft,
  getAssignmentDraft,
  saveAssignmentDraft,
} from "@/lib/assignment-drafts";
import {
  createAssignment,
  deleteAssignment,
  updateAssignment,
  useAssignments,
  type Assignment,
  type AssignmentInput,
} from "@/lib/assignments";
import { useBoardState } from "@/lib/board-state";
import { useWindowSettings } from "@/lib/settings";
import { useSubjects } from "@/lib/subjects";
import {
  loadMainWindowState,
  type MainWindowState,
  type WindowPlacement,
  updateMainWindowState,
} from "@/lib/window-state";
import { exitApp, openOptionsWindow, openSubjectsWindow } from "@/lib/windows";
import { AssignmentsBoard } from "@/features/assignments/AssignmentsBoard";
import { AssignmentComposer } from "@/features/assignments/AssignmentComposer";

import "./App.css";

const COLLAPSED_WIDTH = 24;
const COLLAPSED_HEIGHT = 96;
const WINDOW_TRANSITION_DURATION = 280;

interface OuterRect {
  position: PhysicalPosition;
  size: PhysicalSize;
}

interface WindowFrameInsets {
  width: number;
  height: number;
}

interface AssignmentComposerState {
  assignment?: Assignment;
  draft?: AssignmentInput;
}

interface AssignmentTransition {
  id: string;
  previousContent?: string;
  type: "created" | "updated";
}

interface UpdatingAssignment {
  active: boolean;
  id: string;
  previousContent: string;
}

function physicalPosition(placement: WindowPlacement) {
  return new PhysicalPosition(placement.outerPosition.x, placement.outerPosition.y);
}

function physicalSize(placement: WindowPlacement) {
  return new PhysicalSize(placement.innerSize.width, placement.innerSize.height);
}

function windowPlacement(position: PhysicalPosition, size: PhysicalSize): WindowPlacement {
  return {
    outerPosition: { x: position.x, y: position.y },
    innerSize: { width: size.width, height: size.height },
  };
}

async function readWindowPlacement(appWindow: ReturnType<typeof getCurrentWindow>) {
  const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.innerSize()]);
  return windowPlacement(position, size);
}

async function readWindowFrameInsets(appWindow: ReturnType<typeof getCurrentWindow>) {
  const [outerSize, innerSize] = await Promise.all([appWindow.outerSize(), appWindow.innerSize()]);
  return {
    width: Math.max(0, outerSize.width - innerSize.width),
    height: Math.max(0, outerSize.height - innerSize.height),
  };
}

function placementForOuterRect(rect: OuterRect, frameInsets: WindowFrameInsets): WindowPlacement {
  return windowPlacement(
    rect.position,
    new PhysicalSize(
      Math.max(1, rect.size.width - frameInsets.width),
      Math.max(1, rect.size.height - frameInsets.height),
    ),
  );
}

async function applyWindowPlacement(
  appWindow: ReturnType<typeof getCurrentWindow>,
  placement: WindowPlacement,
) {
  // A size change can reposition a native window; restore the intended origin afterward.
  await appWindow.setSize(physicalSize(placement));
  await appWindow.setPosition(physicalPosition(placement));
}

async function animateWindowPlacement(
  appWindow: ReturnType<typeof getCurrentWindow>,
  from: WindowPlacement,
  to: WindowPlacement,
  enabled: boolean,
) {
  if (!enabled) {
    await applyWindowPlacement(appWindow, to);
    return;
  }

  const startedAt = performance.now();
  let progress = 0;

  while (progress < 1) {
    const elapsed = performance.now() - startedAt;
    progress = Math.min(elapsed / WINDOW_TRANSITION_DURATION, 1);
    const easedProgress = 1 - (1 - progress) ** 3;
    const placement = windowPlacement(
      new PhysicalPosition(
        Math.round(
          from.outerPosition.x + (to.outerPosition.x - from.outerPosition.x) * easedProgress,
        ),
        Math.round(
          from.outerPosition.y + (to.outerPosition.y - from.outerPosition.y) * easedProgress,
        ),
      ),
      new PhysicalSize(
        Math.round(
          from.innerSize.width + (to.innerSize.width - from.innerSize.width) * easedProgress,
        ),
        Math.round(
          from.innerSize.height + (to.innerSize.height - from.innerSize.height) * easedProgress,
        ),
      ),
    );

    await applyWindowPlacement(appWindow, placement);

    if (progress < 1) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
  }
}

function waitForWindowFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function App() {
  const settings = useWindowSettings();
  const { assignments } = useAssignments();
  const { boardState, saveBoardState } = useBoardState();
  const { subjects } = useSubjects();
  const mainWindowShown = useRef(false);
  const backgroundOpacity = settings?.backgroundOpacity;
  const windowAnimation = settings?.windowAnimation ?? true;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenTransitioning, setIsFullscreenTransitioning] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [composer, setComposer] = useState<AssignmentComposerState>();
  const [poppingAssignmentId, setPoppingAssignmentId] = useState<string>();
  const [updatingAssignment, setUpdatingAssignment] = useState<UpdatingAssignment>();
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
  const isChangingWindow = useRef(false);
  const normalPlacementPersistenceVersion = useRef(0);
  const fullscreenTransition = useRef<
    | {
        normal: WindowPlacement;
        fullscreen: WindowPlacement;
      }
    | undefined
  >(undefined);
  const collapsedRestoreTarget = useRef<
    | {
        placement: WindowPlacement;
        restoreFullscreen: boolean;
        fullscreenNormal?: WindowPlacement;
      }
    | undefined
  >(undefined);
  const windowState = useRef<MainWindowState>({});
  const assignmentCards = useRef(new Map<string, HTMLElement>());
  const assignmentSubjectGroups = useRef(new Map<string, HTMLElement>());
  const deletingAssignmentIds = useRef(new Set<string>());
  const pendingAssignmentTransition = useRef<AssignmentTransition | undefined>(undefined);

  useEffect(() => {
    if (backgroundOpacity !== undefined) {
      applyWindowBackgroundOpacity(backgroundOpacity);
    }
  }, [backgroundOpacity]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--assignment-content-zoom",
      String(boardState.zoom / 100),
    );

    return () => {
      document.documentElement.style.removeProperty("--assignment-content-zoom");
    };
  }, [boardState.zoom]);

  useEffect(() => {
    if (!poppingAssignmentId) {
      return;
    }

    const timeout = window.setTimeout(() => setPoppingAssignmentId(undefined), 300);
    return () => window.clearTimeout(timeout);
  }, [poppingAssignmentId]);

  useEffect(() => {
    if (!updatingAssignment?.active) {
      return;
    }

    const timeout = window.setTimeout(() => setUpdatingAssignment(undefined), 360);
    return () => window.clearTimeout(timeout);
  }, [updatingAssignment]);

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

    const persistNormalPlacement = () => {
      if (
        isCollapsedRef.current ||
        isFullscreenRef.current ||
        isChangingWindow.current
      ) {
        return;
      }

      const persistenceVersion = normalPlacementPersistenceVersion.current;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        const appWindow = getCurrentWindow();

        void readWindowPlacement(appWindow).then((placement) => {
            if (
              !active ||
              persistenceVersion !== normalPlacementPersistenceVersion.current ||
              isCollapsedRef.current ||
              isFullscreenRef.current ||
              isChangingWindow.current
            ) {
              return;
            }

            const nextState = {
              ...windowState.current,
              normalPlacement: placement,
            };
            windowState.current = nextState;
            void updateMainWindowState(nextState).catch(() => undefined);
          })
          .catch(() => undefined);
      }, 150);
    };

    void getCurrentWindow().onMoved(persistNormalPlacement).then((cleanup) => {
      if (active) {
        unlistenMoved = cleanup;
      } else {
        cleanup();
      }
    });
    void getCurrentWindow().onResized(persistNormalPlacement).then((cleanup) => {
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
    if (!isTauri() || isChangingWindow.current) {
      return;
    }

    const appWindow = getCurrentWindow();
    const nextFullscreen = !isFullscreenRef.current;
    isChangingWindow.current = true;
    normalPlacementPersistenceVersion.current += 1;
    setIsFullscreenTransitioning(true);

    try {
      if (!windowAnimation) {
        await appWindow.setFullscreen(nextFullscreen);
        if (!nextFullscreen && fullscreenTransition.current) {
          await waitForWindowFrame();
          await applyWindowPlacement(appWindow, fullscreenTransition.current.normal);
        }
        fullscreenTransition.current = undefined;
      } else if (nextFullscreen) {
        isFullscreenRef.current = true;

        const normal = await readWindowPlacement(appWindow);
        const monitor = await monitorFromPoint(
          normal.outerPosition.x,
          normal.outerPosition.y,
        );

        if (monitor) {
          const frameInsets = await readWindowFrameInsets(appWindow);
          const fullscreen = placementForOuterRect(
            {
              position: monitor.workArea.position,
              size: monitor.workArea.size,
            },
            frameInsets,
          );
          fullscreenTransition.current = { normal, fullscreen };
          await animateWindowPlacement(
            appWindow,
            normal,
            fullscreen,
            true,
          );
        } else {
          fullscreenTransition.current = undefined;
        }

        await appWindow.setFullscreen(true);
      } else {
        const transition = fullscreenTransition.current;
        const fullscreen = transition?.fullscreen ?? await readWindowPlacement(appWindow);
        await appWindow.setFullscreen(false);
        await waitForWindowFrame();

        const normal = transition?.normal ?? await readWindowPlacement(appWindow);
        await animateWindowPlacement(appWindow, fullscreen, normal, true);
        fullscreenTransition.current = undefined;
      }

      isFullscreenRef.current = nextFullscreen;
      setIsFullscreen(nextFullscreen);
    } catch (error) {
      console.error("Fullscreen transition failed", error);
      const fullscreen = await appWindow
        .isFullscreen()
        .catch(() => isFullscreenRef.current);
      isFullscreenRef.current = fullscreen;
      setIsFullscreen(fullscreen);
    } finally {
      window.requestAnimationFrame(() => {
        isChangingWindow.current = false;
        setIsFullscreenTransitioning(false);
      });
    }
  }

  async function collapseWindow() {
    if (!isTauri() || isCollapsed || isChangingWindow.current) {
      return;
    }

    const appWindow = getCurrentWindow();
    const restoreFullscreen = isFullscreenRef.current;
    isChangingWindow.current = true;
    normalPlacementPersistenceVersion.current += 1;

    try {
      let placement: WindowPlacement;
      let fullscreenNormal: WindowPlacement | undefined;

      if (restoreFullscreen) {
        await appWindow.setFullscreen(false);
        await waitForWindowFrame();
        placement = await readWindowPlacement(appWindow);
        fullscreenNormal = fullscreenTransition.current?.normal ?? placement;
        fullscreenTransition.current = undefined;
        isFullscreenRef.current = false;
        setIsFullscreen(false);
      } else {
        placement = await readWindowPlacement(appWindow);
      }

      const monitor = await monitorFromPoint(
        placement.outerPosition.x,
        placement.outerPosition.y,
      );

      if (!monitor) {
        return;
      }

      const minY = monitor.workArea.position.y;
      const maxY = monitor.workArea.position.y + monitor.workArea.size.height - COLLAPSED_HEIGHT;
      const defaultY = minY + Math.round((monitor.workArea.size.height - COLLAPSED_HEIGHT) / 2);
      const collapsedPosition = new PhysicalPosition(
        monitor.workArea.position.x + monitor.workArea.size.width - COLLAPSED_WIDTH,
        Math.min(maxY, Math.max(minY, lastCollapsedTabY.current ?? defaultY)),
      );
      const collapsed = windowPlacement(
        collapsedPosition,
        new PhysicalSize(COLLAPSED_WIDTH, COLLAPSED_HEIGHT),
      );
      collapsedTab.current = {
        x: collapsedPosition.x,
        y: collapsedPosition.y,
        minY,
        maxY,
      };
      lastCollapsedTabY.current = collapsedPosition.y;
      collapsedRestoreTarget.current = {
        placement,
        restoreFullscreen,
        fullscreenNormal,
      };

      isCollapsedRef.current = true;
      await appWindow.setAlwaysOnTop(true);
      await appWindow.setResizable(false);
      await animateWindowPlacement(appWindow, placement, collapsed, windowAnimation);
      setIsCollapsed(true);
      if (!restoreFullscreen) {
        const nextState = {
          ...windowState.current,
          normalPlacement: placement,
          collapsedY: collapsedPosition.y,
        };
        windowState.current = nextState;
        void updateMainWindowState(nextState).catch(() => undefined);
      }
    } catch (error) {
      console.error("Window collapse failed", error);
      isCollapsedRef.current = false;
    } finally {
      window.requestAnimationFrame(() => {
        isChangingWindow.current = false;
      });
    }
  }

  async function restoreWindow() {
    const target = collapsedRestoreTarget.current;

    if (!target || isChangingWindow.current) {
      return;
    }

    const appWindow = getCurrentWindow();
    isChangingWindow.current = true;
    normalPlacementPersistenceVersion.current += 1;
    try {
      const collapsed = await readWindowPlacement(appWindow);
      setIsCollapsed(false);
      await animateWindowPlacement(appWindow, collapsed, target.placement, windowAnimation);
      await appWindow.setResizable(true);
      await appWindow.setAlwaysOnTop(false);
      isCollapsedRef.current = false;
      collapsedTab.current = undefined;
      if (target.restoreFullscreen) {
        await appWindow.setFullscreen(true);
        isFullscreenRef.current = true;
        setIsFullscreen(true);
        fullscreenTransition.current = {
          normal: target.fullscreenNormal ?? target.placement,
          fullscreen: target.placement,
        };
      }
      collapsedRestoreTarget.current = undefined;
    } catch (error) {
      console.error("Window restore failed", error);
      // Keep the side tab available when restoration fails.
      isCollapsedRef.current = true;
      setIsCollapsed(true);
    } finally {
      window.requestAnimationFrame(() => {
        isChangingWindow.current = false;
      });
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

  function registerAssignmentCard(id: string, element: HTMLElement | null) {
    if (element) {
      assignmentCards.current.set(id, element);
    } else {
      assignmentCards.current.delete(id);
    }
  }

  function openNewAssignment() {
    setComposer({ draft: getAssignmentDraft("new") });
  }

  function editAssignment(assignment: Assignment) {
    setComposer({
      assignment,
      draft: getAssignmentDraft(assignment.id),
    });
  }

  async function saveAssignment(input: AssignmentInput) {
    if (composer?.assignment) {
      const existing = composer.assignment;
      setUpdatingAssignment({
        active: false,
        id: existing.id,
        previousContent: existing.content,
      });

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

      try {
        await updateAssignment(existing.id, input);
        pendingAssignmentTransition.current = {
          id: existing.id,
          previousContent: existing.content,
          type: "updated",
        };
      } catch (error) {
        setUpdatingAssignment(undefined);
        throw error;
      }
      return;
    }

    const nextAssignments = await createAssignment(input);
    const createdAssignment = nextAssignments[0];

    if (!createdAssignment) {
      throw new Error("Assignment was not created");
    }

    pendingAssignmentTransition.current = { id: createdAssignment.id, type: "created" };
  }

  function dismissComposer(draft?: AssignmentInput) {
    const currentComposer = composer;

    if (!currentComposer) {
      return;
    }

    const draftKey = currentComposer.assignment?.id ?? "new";
    if (draft) {
      saveAssignmentDraft(draftKey, draft);
    } else {
      clearAssignmentDraft(draftKey);
    }

    const transition = pendingAssignmentTransition.current;
    pendingAssignmentTransition.current = undefined;
    setComposer(undefined);

    if (transition?.type === "created") {
      setPoppingAssignmentId(transition.id);
    } else if (transition?.type === "updated" && transition.previousContent !== undefined) {
      setUpdatingAssignment((current) =>
        current?.id === transition.id
          ? { ...current, active: true }
          : {
              active: true,
              id: transition.id,
              previousContent: transition.previousContent ?? "",
            },
      );
    }
  }

  function removeAssignment(assignment: Assignment) {
    if (deletingAssignmentIds.current.has(assignment.id)) {
      return;
    }

    deletingAssignmentIds.current.add(assignment.id);
    const card = assignmentCards.current.get(assignment.id);
    const subjectIds = new Set(subjects.map((subject) => subject.id));
    const groupId = subjectIds.has(assignment.subjectId)
      ? assignment.subjectId
      : "unclassified";
    const isLastInGroup = assignments.filter((item) => (
      subjectIds.has(item.subjectId) ? item.subjectId : "unclassified"
    ) === groupId).length === 1;
    const subjectGroup = isLastInGroup
      ? assignmentSubjectGroups.current.get(groupId)
      : undefined;
    const animation = card?.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(4px)" },
      ],
      { duration: 160, easing: "ease-out", fill: "forwards" },
    );
    const groupAnimation = subjectGroup?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 160, easing: "ease-out", fill: "forwards" },
    );

    void Promise.all([
      animation?.finished ?? Promise.resolve(),
      groupAnimation?.finished ?? Promise.resolve(),
    ])
      .catch(() => undefined)
      .then(() => deleteAssignment(assignment.id))
      .catch((error) => console.error("Failed to delete assignment", error))
      .finally(() => {
        deletingAssignmentIds.current.delete(assignment.id);
      });
  }

  return (
    <main
      className={[
        isCollapsed ? "app-collapsed" : undefined,
        isFullscreenTransitioning && windowAnimation ? "app-fullscreen-transition" : undefined,
        composer ? "app-composer-active" : undefined,
      ].filter(Boolean).join(" ") || undefined}
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
          <ScrollArea className="assignments-scroll-area" horizontal>
            <AssignmentsBoard
              assignments={assignments}
              autoColumnCount={boardState.autoColumnCount}
              autoZoom={boardState.autoZoom}
              columnCount={boardState.columnCount}
              contentZoom={boardState.zoom / 100}
              onCardRef={registerAssignmentCard}
              onDelete={removeAssignment}
              onEdit={editAssignment}
              onSubjectGroupRef={(id, element) => {
                if (element) {
                  assignmentSubjectGroups.current.set(id, element);
                } else {
                  assignmentSubjectGroups.current.delete(id);
                }
              }}
              poppingAssignmentId={poppingAssignmentId}
              subjects={subjects}
              updatingAssignment={updatingAssignment}
            />
          </ScrollArea>
          {composer && (
            <AssignmentComposer
              assignment={composer.assignment}
              draft={composer.draft}
              key={composer.assignment?.id ?? "new"}
              subjects={subjects}
              onDismiss={dismissComposer}
              onSubmit={saveAssignment}
            />
          )}
          <DropdownMenu>
        <ButtonGroup className="toolbar" role="toolbar" aria-label="页面工具栏">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="添加"
            disabled={subjects.length === 0 || Boolean(composer)}
            onClick={openNewAssignment}
          >
            <Plus aria-hidden="true" />
          </Button>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
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
            <DropdownMenuItem onClick={() => void openSubjectsWindow()}>
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
            <div className="menu-control menu-control-auto">
              <span>界面缩放</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="menu-auto-button"
                aria-label="自动计算界面缩放"
                aria-pressed={boardState.autoZoom}
                onClick={() =>
                  saveBoardState({
                    ...boardState,
                    autoZoom: !boardState.autoZoom,
                  })
                }
              >
                A
              </Button>
              <div className="menu-stepper" aria-label="界面缩放">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="缩小界面"
                  disabled={boardState.autoZoom || boardState.zoom <= 50}
                  onClick={() =>
                    saveBoardState({
                      ...boardState,
                      zoom: Math.max(50, boardState.zoom - 10),
                    })
                  }
                >
                  <Minus aria-hidden="true" />
                </Button>
                <span className="menu-stepper-value">
                  {boardState.autoZoom ? "自动" : `${boardState.zoom}%`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="放大界面"
                  disabled={boardState.autoZoom || boardState.zoom >= 200}
                  onClick={() =>
                    saveBoardState({
                      ...boardState,
                      zoom: Math.min(200, boardState.zoom + 10),
                    })
                  }
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="menu-control menu-control-auto">
              <span>作业列数</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="menu-auto-button"
                aria-label="自动计算作业列数"
                aria-pressed={boardState.autoColumnCount}
                onClick={() =>
                  saveBoardState({
                    ...boardState,
                    autoColumnCount: !boardState.autoColumnCount,
                  })
                }
              >
                A
              </Button>
              <div className="menu-stepper" aria-label="作业列数">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="减少作业列数"
                    disabled={boardState.autoColumnCount || boardState.columnCount <= 1}
                    onClick={() =>
                      saveBoardState({
                        ...boardState,
                        columnCount: Math.max(1, boardState.columnCount - 1),
                      })
                    }
                  >
                    <Minus aria-hidden="true" />
                  </Button>
                  <span className="menu-stepper-value">
                    {boardState.autoColumnCount ? "自动" : `${boardState.columnCount} 列`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="增加作业列数"
                    disabled={boardState.autoColumnCount || boardState.columnCount >= 10}
                    onClick={() =>
                      saveBoardState({
                        ...boardState,
                        columnCount: Math.min(10, boardState.columnCount + 1),
                      })
                    }
                  >
                    <Plus aria-hidden="true" />
                  </Button>
              </div>
            </div>
            <DropdownMenuItem
              variant="destructive"
              className="menu-wide"
              onClick={() => void exitApp()}
            >
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

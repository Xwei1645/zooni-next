import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { Assignment } from "@/lib/assignments";
import type { Subject } from "@/lib/subjects";

import { AssignmentCard } from "./AssignmentCard";
import "./Assignments.css";

const GROUP_GAP = 16;
const MAX_AUTO_COLUMNS = 10;
const MIN_AUTO_CARD_WIDTH = 220;
const AUTO_ZOOM_MIN = 0.6;
const AUTO_ZOOM_MAX = 2.4;
const ZOOM_TRANSITION_DURATION = 220;
const LAYOUT_TRANSITION_DURATION = 280;

interface AssignmentsBoardProps {
  assignments: Assignment[];
  autoColumnCount: boolean;
  autoZoom: boolean;
  columnCount: number;
  contentZoom: number;
  onCardRef: (id: string, element: HTMLElement | null) => void;
  onDelete: (assignment: Assignment) => void;
  onEdit: (assignment: Assignment) => void;
  onSubjectGroupRef?: (id: string, element: HTMLElement | null) => void;
  poppingAssignmentId?: string;
  subjects: Subject[];
  updatingAssignment?: {
    active: boolean;
    id: string;
    previousContent: string;
  };
}

interface AssignmentGroup {
  id: string;
  name: string;
  assignments: Assignment[];
}

interface SubjectGroupPlacement {
  cardColumns: number;
  height: number;
  width: number;
  x: number;
  y: number;
}

interface BoardLayout {
  height: number;
  placements: Map<string, SubjectGroupPlacement>;
}

interface AutomaticLayout {
  columnCount: number;
  contentZoom: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function contentLength(content: string) {
  try {
    const editorState = JSON.parse(content) as unknown;
    let length = 0;

    function readNode(node: unknown): void {
      if (Array.isArray(node)) {
        node.forEach(readNode);
        return;
      }

      if (!node || typeof node !== "object") {
        return;
      }

      const record = node as { children?: unknown; text?: unknown };
      if (typeof record.text === "string") {
        length += record.text.length;
      }
      readNode(record.children);
    }

    readNode(editorState);
    return length || content.length;
  } catch {
    return content.length;
  }
}

function preferredCardColumns(
  group: AssignmentGroup,
  columnCount: number,
  groupCount: number,
) {
  if (columnCount === 1) {
    return 1;
  }

  if (groupCount === 1) {
    return columnCount;
  }

  const assignmentCount = group.assignments.length;
  let cardColumns = assignmentCount >= 8 ? 3 : assignmentCount >= 3 ? 2 : 1;

  return Math.min(columnCount, cardColumns);
}

function estimateGroupHeightFromData(
  group: AssignmentGroup,
  width: number,
  cardColumns: number,
  contentZoom: number,
) {
  const cardWidth = width / cardColumns;
  const charactersPerLine = Math.max(16, Math.floor(cardWidth / (7.8 * contentZoom)));
  const cardHeights = group.assignments.map((assignment) => {
    const lines = Math.max(1, Math.ceil(contentLength(assignment.content) / charactersPerLine));
    return 56 + lines * 23 * contentZoom;
  });
  const cardHeight = cardHeights.reduce((height, nextHeight) => height + nextHeight + 12, 0) / cardColumns;

  return 42 * contentZoom + cardHeight;
}

function createLayout(
  canvasWidth: number,
  columnCount: number,
  groups: AssignmentGroup[],
  groupHeights: (group: AssignmentGroup, width: number, cardColumns: number) => number,
) {
  const safeColumnCount = Math.max(1, columnCount);
  const columnWidth =
    (canvasWidth - (safeColumnCount - 1) * GROUP_GAP) / safeColumnCount;
  const columnHeights = Array.from({ length: safeColumnCount }, () => 0);
  const placements = new Map<string, SubjectGroupPlacement>();

  for (const group of groups) {
    const cardColumns = preferredCardColumns(
      group,
      safeColumnCount,
      groups.length,
    );
    const width = columnWidth * cardColumns + GROUP_GAP * (cardColumns - 1);
    let targetColumn = 0;
    let targetY = Number.POSITIVE_INFINITY;

    for (let column = 0; column <= safeColumnCount - cardColumns; column += 1) {
      const y = Math.max(...columnHeights.slice(column, column + cardColumns));

      if (y < targetY) {
        targetColumn = column;
        targetY = y;
      }
    }

    const height = groupHeights(group, width, cardColumns);
    const x = targetColumn * (columnWidth + GROUP_GAP);
    placements.set(group.id, { cardColumns, height, width, x, y: targetY });

    for (let column = targetColumn; column < targetColumn + cardColumns; column += 1) {
      columnHeights[column] = targetY + height + GROUP_GAP;
    }
  }

  return {
    height: Math.max(0, ...columnHeights) - GROUP_GAP,
    placements,
  } satisfies BoardLayout;
}

function measureTargetGroupHeights(
  canvas: HTMLElement,
  canvasWidth: number,
  columnCount: number,
  groups: AssignmentGroup[],
  groupElements: Map<string, HTMLElement>,
) {
  const columnWidth =
    (canvasWidth - (Math.max(1, columnCount) - 1) * GROUP_GAP) / Math.max(1, columnCount);
  const host = document.createElement("div");
  const heights = new Map<string, number>();

  host.style.position = "absolute";
  host.style.top = "0";
  host.style.left = "-100000px";
  host.style.width = `${canvasWidth}px`;
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  host.style.contain = "layout style";
  host.setAttribute("aria-hidden", "true");
  canvas.append(host);

  try {
    for (const group of groups) {
      const source = groupElements.get(group.id);
      if (!source) {
        continue;
      }

      const cardColumns = preferredCardColumns(group, columnCount, groups.length);
      const clone = source.cloneNode(true) as HTMLElement;
      const width = columnWidth * cardColumns + GROUP_GAP * (cardColumns - 1);
      const cards = clone.querySelector<HTMLElement>(".assignment-subject-group-cards");

      clone.style.position = "static";
      clone.style.top = "auto";
      clone.style.left = "auto";
      clone.style.width = `${width}px`;
      clone.style.transform = "none";
      clone.style.visibility = "visible";
      clone.style.opacity = "1";
      clone.style.transition = "none";
      cards?.style.setProperty("--assignment-subject-card-columns", String(cardColumns));
      host.append(clone);
      heights.set(group.id, clone.offsetHeight);
    }
  } finally {
    host.remove();
  }

  return heights;
}

function solveAutomaticLayout({
  autoColumnCount,
  autoZoom,
  availableHeight,
  canvasWidth,
  groups,
  manualColumnCount,
  manualZoom,
}: {
  autoColumnCount: boolean;
  autoZoom: boolean;
  availableHeight: number;
  canvasWidth: number;
  groups: AssignmentGroup[];
  manualColumnCount: number;
  manualZoom: number;
}) {
  const maximumColumns = Math.max(
    1,
    Math.min(
      MAX_AUTO_COLUMNS,
      Math.floor((canvasWidth + GROUP_GAP) / (MIN_AUTO_CARD_WIDTH + GROUP_GAP)),
    ),
  );
  const candidates = autoColumnCount
    ? Array.from({ length: maximumColumns }, (_, index) => index + 1)
    : [manualColumnCount];
  const evaluatedCandidates: Array<{
    areaFill: number;
    columnCount: number;
    contentZoom: number;
    overflow: number;
    viewportFill: number;
  }> = [];

  for (const candidateColumnCount of candidates) {
    let candidateZoom = autoZoom ? 1 : manualZoom;
    let estimatedLayout = createLayout(
      canvasWidth,
      candidateColumnCount,
      groups,
      (group, width, cardColumns) =>
        estimateGroupHeightFromData(group, width, cardColumns, candidateZoom),
    );

    if (autoZoom && estimatedLayout.height > 0) {
      for (let iteration = 0; iteration < 2; iteration += 1) {
        candidateZoom = clamp(
          candidateZoom * (availableHeight / estimatedLayout.height),
          AUTO_ZOOM_MIN,
          AUTO_ZOOM_MAX,
        );
        estimatedLayout = createLayout(
          canvasWidth,
          candidateColumnCount,
          groups,
          (group, width, cardColumns) =>
            estimateGroupHeightFromData(group, width, cardColumns, candidateZoom),
        );
      }
    }

    const overflow = Math.max(0, estimatedLayout.height - availableHeight);
    const viewportFill = Math.min(1, estimatedLayout.height / availableHeight);
    const occupiedArea = [...estimatedLayout.placements.values()].reduce(
      (area, placement) => area + placement.width * placement.height,
      0,
    );
    const areaFill = occupiedArea / Math.max(canvasWidth * estimatedLayout.height, 1);
    evaluatedCandidates.push({
      areaFill,
      columnCount: candidateColumnCount,
      contentZoom: candidateZoom,
      overflow,
      viewportFill,
    });
  }

  const fittingCandidates = evaluatedCandidates.filter((candidate) => candidate.overflow <= 1);
  const wellFilledCandidates = fittingCandidates.filter(
    (candidate) => candidate.viewportFill >= 0.9,
  );
  const candidatesToRank = wellFilledCandidates.length > 0
    ? wellFilledCandidates
    : fittingCandidates.length > 0
      ? fittingCandidates
      : evaluatedCandidates;

  candidatesToRank.sort((first, second) => {
    if (wellFilledCandidates.length > 0) {
      return second.contentZoom - first.contentZoom
        || second.viewportFill - first.viewportFill
        || second.areaFill - first.areaFill;
    }

    if (fittingCandidates.length > 0) {
      return second.viewportFill - first.viewportFill
        || second.contentZoom - first.contentZoom
        || second.areaFill - first.areaFill;
    }

    return first.overflow - second.overflow
      || second.contentZoom - first.contentZoom
      || second.areaFill - first.areaFill;
  });

  return candidatesToRank[0] ?? { columnCount: manualColumnCount, contentZoom: manualZoom };
}

function layoutsMatch(first: BoardLayout, second: BoardLayout) {
  if (first.height !== second.height || first.placements.size !== second.placements.size) {
    return false;
  }

  for (const [id, placement] of first.placements) {
    const nextPlacement = second.placements.get(id);
    if (!nextPlacement) {
      return false;
    }

    if (
      placement.cardColumns !== nextPlacement.cardColumns ||
      Math.abs(placement.height - nextPlacement.height) > 1 ||
      Math.abs(placement.width - nextPlacement.width) > 1 ||
      Math.abs(placement.x - nextPlacement.x) > 1 ||
      Math.abs(placement.y - nextPlacement.y) > 1
    ) {
      return false;
    }
  }

  return true;
}

export function AssignmentsBoard({
  assignments,
  autoColumnCount,
  autoZoom,
  columnCount,
  contentZoom,
  onCardRef,
  onDelete,
  onEdit,
  onSubjectGroupRef,
  poppingAssignmentId,
  subjects,
  updatingAssignment,
}: AssignmentsBoardProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const subjectGroups = useRef(new Map<string, HTMLElement>());
  const observedHeights = useRef(new Map<string, number>());
  const previousTopology = useRef<string | undefined>(undefined);
  const previousAutomaticLayoutInput = useRef<string | undefined>(undefined);
  const isLayoutTransitioning = useRef(false);
  const layoutTransitionTimeout = useRef<number | undefined>(undefined);
  const pendingCardPositions = useRef<Map<string, DOMRect> | undefined>(undefined);
  const cardPositionAnimations = useRef<Animation[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [layout, setLayout] = useState<BoardLayout>({ height: 0, placements: new Map() });
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const [automaticLayout, setAutomaticLayout] = useState<AutomaticLayout>({
    columnCount: 1,
    contentZoom,
  });
  const [contentZoomTarget, setContentZoomTarget] = useState(contentZoom);
  const [effectiveContentZoom, setEffectiveContentZoom] = useState(contentZoom);
  const renderedContentZoom = useRef(contentZoom);
  const assignmentsBySubject = new Map<string, Assignment[]>();

  for (const assignment of assignments) {
    const groupedAssignments = assignmentsBySubject.get(assignment.subjectId) ?? [];
    groupedAssignments.push(assignment);
    assignmentsBySubject.set(assignment.subjectId, groupedAssignments);
  }

  const groups: AssignmentGroup[] = subjects.flatMap((subject) => {
    const groupedAssignments = assignmentsBySubject.get(subject.id);
    return groupedAssignments
      ? [{ id: subject.id, name: subject.name, assignments: groupedAssignments }]
      : [];
  });
  const knownSubjectIds = new Set(subjects.map((subject) => subject.id));
  const unclassifiedAssignments = assignments.filter(
    (assignment) => !knownSubjectIds.has(assignment.subjectId),
  );

  if (unclassifiedAssignments.length > 0) {
    groups.push({ id: "unclassified", name: "未分类", assignments: unclassifiedAssignments });
  }

  const groupsKey = groups
    .map((group) => `${group.id}:${group.assignments.map((assignment) => `${assignment.id}:${assignment.updatedAt}:${contentLength(assignment.content)}`).join(",")}`)
    .join("|");
  const effectiveColumnCount = autoColumnCount
    ? automaticLayout.columnCount
    : columnCount;
  const availableHeight = Math.max(200, (viewportHeight || window.innerHeight) - 132);
  const automaticLayoutInput = [
    groupsKey,
    canvasWidth,
    viewportHeight,
    autoColumnCount,
    autoZoom,
    columnCount,
    contentZoom,
  ].join(":");

  useEffect(() => {
    setContentZoomTarget(autoZoom ? automaticLayout.contentZoom : contentZoom);
  }, [autoZoom, automaticLayout.contentZoom, contentZoom]);

  useEffect(() => {
    const from = renderedContentZoom.current;
    const difference = contentZoomTarget - from;

    if (Math.abs(difference) < 0.001) {
      setEffectiveContentZoom(contentZoomTarget);
      return;
    }

    const startedAt = performance.now();
    let animationFrame: number | undefined;

    function animate(now: number) {
      const progress = Math.min(1, (now - startedAt) / ZOOM_TRANSITION_DURATION);
      const easedProgress = 1 - (1 - progress) ** 3;
      const nextZoom = from + difference * easedProgress;

      renderedContentZoom.current = nextZoom;
      setEffectiveContentZoom(nextZoom);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    }

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [contentZoomTarget]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const viewport = canvas.closest<HTMLElement>("[data-slot='scroll-area-viewport']");

    if (viewport) {
      setViewportHeight(viewport.clientHeight);
    }

    const observer = new ResizeObserver((entries) => {
      let shouldMeasure = false;

      for (const entry of entries) {
        if (entry.target === viewport) {
          const nextHeight = Math.round(entry.contentRect.height);
          setViewportHeight((height) => (height === nextHeight ? height : nextHeight));
          continue;
        }

        if (entry.target === canvas) {
          const nextWidth = Math.round(entry.contentRect.width);
          setCanvasWidth((width) => {
            if (width === nextWidth) {
              return width;
            }

            shouldMeasure = true;
            return nextWidth;
          });
          continue;
        }

        const group = entry.target as HTMLElement;
        const id = group.dataset.subjectGroupId ?? "";
        const nextHeight = Math.round(entry.contentRect.height);
        if (observedHeights.current.get(id) !== nextHeight) {
          observedHeights.current.set(id, nextHeight);
          shouldMeasure = true;
        }
      }

      if (shouldMeasure) {
        if (!isLayoutTransitioning.current) {
          setMeasurementVersion((version) => version + 1);
        }
      }
    });

    observer.observe(canvas);
    if (viewport) {
      observer.observe(viewport);
    }
    for (const group of subjectGroups.current.values()) {
      observer.observe(group);
    }

    return () => observer.disconnect();
  }, [groupsKey]);

  useLayoutEffect(() => {
    if (canvasWidth <= 0 || groups.length === 0) {
      return;
    }

    if (previousAutomaticLayoutInput.current === automaticLayoutInput) {
      return;
    }

    previousAutomaticLayoutInput.current = automaticLayoutInput;

    const next = solveAutomaticLayout({
      autoColumnCount,
      autoZoom,
      availableHeight,
      canvasWidth,
      groups,
      manualColumnCount: columnCount,
      manualZoom: contentZoom,
    });

    setAutomaticLayout((previous) => (
      previous.columnCount === next.columnCount &&
      Math.abs(previous.contentZoom - next.contentZoom) < 0.01
        ? previous
        : { columnCount: next.columnCount, contentZoom: next.contentZoom }
    ));
  }, [automaticLayoutInput]);

  function beginLayoutTransition() {
    isLayoutTransitioning.current = true;

    if (layoutTransitionTimeout.current !== undefined) {
      window.clearTimeout(layoutTransitionTimeout.current);
    }

    layoutTransitionTimeout.current = window.setTimeout(() => {
      isLayoutTransitioning.current = false;
      layoutTransitionTimeout.current = undefined;
      setMeasurementVersion((version) => version + 1);
    }, LAYOUT_TRANSITION_DURATION + 40);
  }

  useEffect(() => () => {
    if (layoutTransitionTimeout.current !== undefined) {
      window.clearTimeout(layoutTransitionTimeout.current);
    }
    for (const animation of cardPositionAnimations.current) {
      animation.cancel();
    }
  }, []);

  function captureCardPositions() {
    const canvas = canvasRef.current;
    const positions = new Map<string, DOMRect>();

    if (!canvas) {
      return positions;
    }

    for (const card of canvas.querySelectorAll<HTMLElement>("[data-assignment-id]")) {
      const id = card.dataset.assignmentId;
      if (id) {
        positions.set(id, card.getBoundingClientRect());
      }
    }

    return positions;
  }

  useLayoutEffect(() => {
    if (canvasWidth <= 0) {
      return;
    }

    if (isLayoutTransitioning.current) {
      return;
    }

    const topology = `${effectiveColumnCount}:${groups.map((group) => `${group.id}:${preferredCardColumns(group, effectiveColumnCount, groups.length)}`).join("|")}`;
    const topologyChanged = previousTopology.current !== undefined && previousTopology.current !== topology;
    const measuredTargetHeights = topologyChanged && canvasRef.current
      ? measureTargetGroupHeights(
        canvasRef.current,
        canvasWidth,
        effectiveColumnCount,
        groups,
        subjectGroups.current,
      )
      : undefined;

    const nextLayout = createLayout(
      canvasWidth,
      effectiveColumnCount,
      groups,
      (group, width, cardColumns) => {
        if (topologyChanged) {
          return measuredTargetHeights?.get(group.id)
            ?? estimateGroupHeightFromData(group, width, cardColumns, effectiveContentZoom);
        }

        return subjectGroups.current.get(group.id)?.offsetHeight
          ?? observedHeights.current.get(group.id)
          ?? estimateGroupHeightFromData(group, width, cardColumns, effectiveContentZoom);
      },
    );
    const layoutChanged = !layoutsMatch(layout, nextLayout);

    if (topologyChanged && layoutChanged) {
      pendingCardPositions.current = captureCardPositions();
      for (const animation of cardPositionAnimations.current) {
        animation.cancel();
      }
      cardPositionAnimations.current = [];
    }

    previousTopology.current = topology;
    setLayout((previous) => (layoutChanged ? nextLayout : previous));

    if (topologyChanged && layoutChanged) {
      beginLayoutTransition();
    }
  }, [canvasWidth, effectiveColumnCount, effectiveContentZoom, groupsKey, measurementVersion]);

  useLayoutEffect(() => {
    const sourcePositions = pendingCardPositions.current;
    const canvas = canvasRef.current;

    if (!sourcePositions || !canvas) {
      return;
    }

    pendingCardPositions.current = undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const animations: Animation[] = [];
    for (const [id, source] of sourcePositions) {
      const card = [...canvas.querySelectorAll<HTMLElement>("[data-assignment-id]")]
        .find((element) => element.dataset.assignmentId === id);
      if (!card) {
        continue;
      }

      const target = card.getBoundingClientRect();
      const offsetX = source.left - target.left;
      const offsetY = source.top - target.top;
      const heightChanged = Math.abs(source.height - target.height) > 1;
      if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1 && !heightChanged) {
        continue;
      }

      animations.push(card.animate(
        [
          { transform: `translate3d(${offsetX}px, ${offsetY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        { duration: LAYOUT_TRANSITION_DURATION, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      ));

      const frame = card.querySelector<HTMLElement>(".assignment-card-frame");
      if (frame && heightChanged) {
        animations.push(frame.animate(
          [{ height: `${source.height}px` }, { height: `${target.height}px` }],
          { duration: LAYOUT_TRANSITION_DURATION, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        ));
      }
    }

    cardPositionAnimations.current = animations;
  }, [layout]);

  function registerSubjectGroup(id: string, element: HTMLElement | null) {
    if (element) {
      subjectGroups.current.set(id, element);
    } else {
      subjectGroups.current.delete(id);
      observedHeights.current.delete(id);
    }
    onSubjectGroupRef?.(id, element);
  }

  return (
    <section
      className="assignments-board"
      style={{ "--assignment-content-zoom": String(effectiveContentZoom) } as CSSProperties}
      aria-label="作业"
    >
      <div
        className="assignment-subject-groups"
        ref={canvasRef}
        style={{ height: layout.height > 0 ? `${layout.height}px` : undefined }}
      >
        {groups.map((group) => {
          const placement = layout.placements.get(group.id);
          const cardColumns = placement?.cardColumns ?? 1;

          return (
            <section
              className="assignment-subject-group"
              data-subject-group-id={group.id}
              key={group.id}
              ref={(element) => registerSubjectGroup(group.id, element)}
              style={{
                opacity: placement ? 1 : 0,
                transform: placement ? `translate3d(${placement.x}px, ${placement.y}px, 0)` : undefined,
                visibility: canvasWidth > 0 ? "visible" : "hidden",
                width: placement?.width ?? `${100 / Math.max(effectiveColumnCount, 1)}%`,
              }}
              aria-labelledby={`subject-${group.id}`}
            >
              <h1 id={`subject-${group.id}`} className="assignment-group-title">
                {group.name}
              </h1>
              <div
                className="assignment-subject-group-cards"
                style={{ "--assignment-subject-card-columns": String(cardColumns) } as CSSProperties}
              >
                {group.assignments.map((assignment) => (
                  <div
                    className={
                      placement && assignment.id === poppingAssignmentId
                        ? "assignment-card-position assignment-card-position-is-popping"
                        : "assignment-card-position"
                    }
                    data-assignment-id={assignment.id}
                    key={assignment.id}
                  >
                    <div className="assignment-card-frame" aria-hidden="true" />
                    <AssignmentCard
                      assignment={assignment}
                      cardRef={(element) => onCardRef(assignment.id, element)}
                      contentZoom={effectiveContentZoom}
                      isUpdating={assignment.id === updatingAssignment?.id && updatingAssignment.active}
                      onDelete={onDelete}
                      onEdit={onEdit}
                      previousContent={
                        assignment.id === updatingAssignment?.id
                          ? updatingAssignment.previousContent
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

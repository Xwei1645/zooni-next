import { useLayoutEffect, useRef, type CSSProperties } from "react";

import type { Assignment } from "@/lib/assignments";
import type { Subject } from "@/lib/subjects";

import { AssignmentCard } from "./AssignmentCard";
import "./Assignments.css";

interface AssignmentsBoardProps {
  assignments: Assignment[];
  columnCount: number;
  contentZoom: number;
  onCardRef: (id: string, element: HTMLElement | null) => void;
  onDelete: (assignment: Assignment) => void;
  onEdit: (assignment: Assignment) => void;
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

export function AssignmentsBoard({
  assignments,
  columnCount,
  contentZoom,
  onCardRef,
  onDelete,
  onEdit,
  poppingAssignmentId,
  subjects,
  updatingAssignment,
}: AssignmentsBoardProps) {
  const cards = useRef(new Map<string, HTMLElement>());
  const previousCardPositions = useRef(new Map<string, DOMRect>());
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
    groups.push({
      id: "unclassified",
      name: "未分类",
      assignments: unclassifiedAssignments,
    });
  }

  useLayoutEffect(() => {
    const nextPositions = new Map<string, DOMRect>();

    for (const [id, card] of cards.current) {
      const nextPosition = card.getBoundingClientRect();
      const previousPosition = previousCardPositions.current.get(id);

      if (previousPosition) {
        const horizontalDistance = previousPosition.left - nextPosition.left;
        const verticalDistance = previousPosition.top - nextPosition.top;

        if (horizontalDistance !== 0 || verticalDistance !== 0) {
          card.animate(
            [
              { transform: `translate(${horizontalDistance}px, ${verticalDistance}px)` },
              { transform: "translate(0, 0)" },
            ],
            {
              duration: 260,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
          );
        }
      }

      nextPositions.set(id, nextPosition);
    }

    previousCardPositions.current = nextPositions;
  }, [assignments, columnCount]);

  function registerCard(id: string, element: HTMLElement | null) {
    if (element) {
      cards.current.set(id, element);
    } else {
      cards.current.delete(id);
    }

    onCardRef(id, element);
  }

  return (
    <section
      className="assignments-board"
      style={{ "--assignment-column-count": String(columnCount) } as CSSProperties}
      aria-label="作业"
    >
      {groups.map((group) => (
        <section className="assignment-group" key={group.id} aria-labelledby={`subject-${group.id}`}>
          <h1 id={`subject-${group.id}`} className="assignment-group-title">
            {group.name}
          </h1>
          <div className="assignment-grid">
            {group.assignments.map((assignment) => (
              <AssignmentCard
                assignment={assignment}
                cardRef={(element) => registerCard(assignment.id, element)}
                contentZoom={contentZoom}
                isPopping={assignment.id === poppingAssignmentId}
                isUpdating={assignment.id === updatingAssignment?.id && updatingAssignment.active}
                key={assignment.id}
                onDelete={onDelete}
                onEdit={onEdit}
                previousContent={
                  assignment.id === updatingAssignment?.id
                    ? updatingAssignment.previousContent
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

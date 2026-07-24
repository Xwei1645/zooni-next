import { useLayoutEffect, useRef } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Assignment } from "@/lib/assignments";

import { AssignmentContent } from "./AssignmentContent";

interface AssignmentCardProps {
  assignment: Assignment;
  cardRef?: (element: HTMLElement | null) => void;
  isPopping?: boolean;
  onDelete: (assignment: Assignment) => void;
  onEdit: (assignment: Assignment) => void;
  isUpdating?: boolean;
  previousContent?: string;
}

export function AssignmentCard({
  assignment,
  cardRef,
  isPopping,
  onDelete,
  onEdit,
  isUpdating = false,
  previousContent,
}: AssignmentCardProps) {
  const cardElement = useRef<HTMLElement | null>(null);
  const previousHeight = useRef<number | undefined>(undefined);
  const isTransitionActive = isUpdating && previousContent !== undefined;

  useLayoutEffect(() => {
    const card = cardElement.current;

    if (!card) {
      return;
    }

    const nextHeight = card.getBoundingClientRect().height;
    const previous = previousHeight.current;

    if (isTransitionActive && previous && previous !== nextHeight) {
      card.animate(
        [{ height: `${previous}px` }, { height: `${nextHeight}px` }],
        {
          duration: 300,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    }

    if (previousContent === undefined || isTransitionActive) {
      previousHeight.current = nextHeight;
    }
  }, [assignment.content, isTransitionActive, previousContent]);

  function registerCard(element: HTMLElement | null) {
    cardElement.current = element;
    cardRef?.(element);
  }

  return (
    <article
      className={
        isTransitionActive
          ? "assignment-card assignment-card-is-updating"
          : previousContent !== undefined
            ? "assignment-card assignment-card-is-preparing"
            : isPopping
              ? "assignment-card assignment-card-is-popping"
              : "assignment-card"
      }
      ref={registerCard}
      tabIndex={0}
    >
      <div className="assignment-card-content-stack">
        <div className="assignment-card-current-content">
          <AssignmentContent content={assignment.content} />
        </div>
        {previousContent !== undefined && (
          <div
            className={
              isTransitionActive
                ? "assignment-card-previous-content assignment-card-previous-content-is-leaving"
                : "assignment-card-previous-content"
            }
          >
            <AssignmentContent content={previousContent} />
          </div>
        )}
      </div>
      <div className="assignment-card-actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="assignment-card-action"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(assignment);
          }}
        >
          <Pencil aria-hidden="true" />
          编辑
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="assignment-card-action"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(assignment);
          }}
        >
          <Trash2 aria-hidden="true" />
          删除
        </Button>
      </div>
    </article>
  );
}

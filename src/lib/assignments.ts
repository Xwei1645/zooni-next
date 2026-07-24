import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Assignment {
  id: string;
  subjectId: string;
  // Plain text for now; this will hold Lexical's serialized editor state later.
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentInput {
  subjectId: string;
  content: string;
}

export function createAssignment(assignment: AssignmentInput) {
  return invoke<Assignment[]>("create_assignment", { assignment });
}

export function updateAssignment(id: string, assignment: AssignmentInput) {
  return invoke<Assignment[]>("update_assignment", { id, assignment });
}

export function deleteAssignment(id: string) {
  return invoke<Assignment[]>("delete_assignment", { id });
}

export function useAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void listen<Assignment[]>("assignments-changed", ({ payload }) => {
      if (active) {
        setAssignments(payload);
      }
    }).then((cleanup) => {
      if (!active) {
        cleanup();
        return;
      }

      unlisten = cleanup;
      void invoke<Assignment[]>("get_assignments")
        .then((nextAssignments) => {
          if (active) {
            setAssignments(nextAssignments);
          }
        })
        .catch(() => {
          if (active) {
            setAssignments([]);
          }
        })
        .finally(() => {
          if (active) {
            setLoaded(true);
          }
        });
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return { assignments, loaded };
}

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { logError } from "@/lib/logger";

export interface Subject {
  id: string;
  name: string;
}

interface SubjectInput {
  name: string;
}

export function createSubject(subject: SubjectInput) {
  return invoke<Subject[]>("create_subject", { subject });
}

export function updateSubject(id: string, subject: SubjectInput) {
  return invoke<Subject[]>("update_subject", { id, subject });
}

export function deleteSubject(id: string) {
  return invoke<Subject[]>("delete_subject", { id });
}

export function useSubjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void listen<Subject[]>("subjects-changed", ({ payload }) => {
      if (active) {
        setSubjects(payload);
      }
    }).then((cleanup) => {
      if (!active) {
        cleanup();
        return;
      }

      unlisten = cleanup;
      void invoke<Subject[]>("get_subjects")
        .then((nextSubjects) => {
          if (active) {
            setSubjects(nextSubjects);
          }
        })
        .catch((error) => {
          logError("subjects.load", error);
          if (active) {
            setSubjects([]);
          }
        })
        .finally(() => {
          if (active) {
            setLoaded(true);
          }
        });
    }).catch((error) => logError("subjects.listen", error));

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return { subjects, loaded };
}

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { UpdatePolicy } from "@/lib/appearance";
import { logError } from "@/lib/logger";

export type UpdateStatus = "idle" | "checking" | "upToDate" | "available" | "downloading" | "downloaded" | "installing" | "failed";

export type UpdateErrorKind = "check" | "download" | "signature" | "install" | "cache";

export interface UpdateSnapshot {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  notes?: string;
  lastCheckedAt?: string;
  errorKind?: UpdateErrorKind;
  error?: string;
}

export const checkForUpdate = () => invoke("check_for_update");
export const installUpdate = () => invoke("install_update");
export const applyUpdatePolicy = (policy: UpdatePolicy) => invoke("apply_update_policy", { policy });

export function useUpdateSnapshot() {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot>();

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void listen<UpdateSnapshot>("updater-changed", ({ payload }) => {
      if (active) setSnapshot(payload);
    })
      .then((cleanup) => { unlisten = cleanup; })
      .catch((error) => logError("updater.listen", error));

    void invoke<UpdateSnapshot>("get_update_snapshot")
      .then((nextSnapshot) => { if (active) setSnapshot(nextSnapshot); })
      .catch((error) => logError("updater.snapshot", error));

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return snapshot;
}

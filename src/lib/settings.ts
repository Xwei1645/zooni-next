import { useEffect, useRef, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import {
  applyAppearance,
  applyFontFamily,
  type AppSettings,
  defaultSettings,
} from "@/lib/appearance";
import { logError } from "@/lib/logger";

export interface AppSettingsSnapshot {
  settings: AppSettings;
  revision: number;
}

export function loadAppSettings() {
  return invoke<AppSettingsSnapshot>("get_app_settings");
}

export function updateAppSettings(settings: AppSettings) {
  return invoke<AppSettingsSnapshot>("update_app_settings", { settings });
}

export function useWindowSettings() {
  const [settings, setSettings] = useState<AppSettings>();
  const snapshotRef = useRef<AppSettingsSnapshot | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applySnapshot = (snapshot: AppSettingsSnapshot) => {
      const previous = snapshotRef.current;

      if (previous && snapshot.revision <= previous.revision) {
        return;
      }

      snapshotRef.current = snapshot;

      if (!previous || previous.settings.appearance !== snapshot.settings.appearance) {
        applyAppearance(snapshot.settings.appearance, mediaQuery.matches);
      }

      if (!previous || previous.settings.fontFamily !== snapshot.settings.fontFamily) {
        applyFontFamily(snapshot.settings.fontFamily);
      }

      if (active) {
        setSettings(snapshot.settings);
      }
    };

    const applySystemAppearance = (event: MediaQueryListEvent) => {
      if (snapshotRef.current?.settings.appearance === "system") {
        applyAppearance("system", event.matches);
      }
    };

    mediaQuery.addEventListener("change", applySystemAppearance);

    if (!isTauri()) {
      applySnapshot({ settings: defaultSettings, revision: 0 });
    } else {
      void listen<AppSettingsSnapshot>("settings-changed", ({ payload }) => {
        applySnapshot(payload);
      })
        .then((cleanup) => {
          if (!active) {
            cleanup();
            return;
          }

          unlisten = cleanup;
          void loadAppSettings().then(applySnapshot).catch((error) => logError("settings.load", error));
        })
        .catch((error) => {
          logError("settings.listen", error);
          if (active) {
            void loadAppSettings().then(applySnapshot).catch((loadError) => logError("settings.load", loadError));
          }
        });
    }

    return () => {
      active = false;
      unlisten?.();
      mediaQuery.removeEventListener("change", applySystemAppearance);
    };
  }, []);

  return settings;
}

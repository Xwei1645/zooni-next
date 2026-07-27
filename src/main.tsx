import { lazy, StrictMode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { logError, logInfo } from "@/lib/logger";
import "./index.css";

const App = lazy(() => import("./App"));
const OptionsWindow = lazy(() =>
  import("./windows/OptionsWindow").then(({ OptionsWindow }) => ({
    default: OptionsWindow,
  })),
);
const SubjectsWindow = lazy(() =>
  import("./windows/SubjectsWindow").then(({ SubjectsWindow }) => ({
    default: SubjectsWindow,
  })),
);

window.addEventListener("contextmenu", (event) => event.preventDefault());

const windowLabel = isTauri() ? getCurrentWindow().label : "main";
const Root =
  windowLabel === "options" ? OptionsWindow : windowLabel === "subjects" ? SubjectsWindow : App;

window.addEventListener("error", (event) => {
  logError(`frontend.${windowLabel}.error`, event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  logError(`frontend.${windowLabel}.unhandled-rejection`, event.reason);
});

logInfo(`frontend.${windowLabel}`, "renderer initialized");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
);

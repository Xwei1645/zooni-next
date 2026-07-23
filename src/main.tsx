import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "./index.css";
import { OptionsWindow } from "./windows/OptionsWindow";
import { SubjectsWindow } from "./windows/SubjectsWindow";

window.addEventListener("contextmenu", (event) => event.preventDefault());

const windowLabel = isTauri() ? getCurrentWindow().label : "main";
const Root =
  windowLabel === "options" ? OptionsWindow : windowLabel === "subjects" ? SubjectsWindow : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

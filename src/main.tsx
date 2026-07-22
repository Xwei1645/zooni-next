import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "./index.css";
import { OptionsWindow } from "./windows/OptionsWindow";

window.addEventListener("contextmenu", (event) => event.preventDefault());

const Root = isTauri() && getCurrentWindow().label === "options" ? OptionsWindow : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./polish.css";
import "./style.css";
import "./voice.css";
import "./desktop.css";

import "../../../packages/ui/companion-tokens.css";
import "./workspace.css";
import "./play-desk.css";
import "./studio.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

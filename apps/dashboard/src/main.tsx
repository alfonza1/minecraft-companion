import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./polish.css";
import "./style.css";
import "./voice.css";
import "./desktop.css";

import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "../../../packages/ui/companion-tokens.css";
import "./workspace.css";
import "./play-desk.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

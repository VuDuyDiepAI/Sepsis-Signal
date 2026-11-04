import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./enterprise.css";
import "./learning.css";
import "./admin.css";
import "./dashboard.css";
import "./course-workflow.css";
import "./calendar-chat.css";
import "./task-dashboard.css";
import "./reports.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

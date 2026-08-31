import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HrReporting, LeaveReporting } from "./Reporting";
import "./styles.css";

// Temporary source-integrity guard: eortologio.gr is currently serving stale
// "today" data for 2026-08-31. Their authoritative monthly calendar marks
// this date as having no widely known nameday, so block that stale payload.
function installNamedaysSourceGuard() {
  const knownEmptyNamedayDates = new Set(["2026-08-31"]);

  window.addEventListener(
    "message",
    (event) => {
      const data = event.data as { type?: string; dateKey?: string } | undefined;
      if (
        data?.type === "celebrations:namedays" &&
        data.dateKey &&
        knownEmptyNamedayDates.has(data.dateKey)
      ) {
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
}

installNamedaysSourceGuard();

function Root() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/hr-reporting") return <HrReporting />;
  if (path === "/leave-reporting") return <LeaveReporting />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

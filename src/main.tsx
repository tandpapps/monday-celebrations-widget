import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HrReporting, LeaveReporting } from "./Reporting";
import "./styles.css";

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

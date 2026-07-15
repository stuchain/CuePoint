import { useEffect, useState } from "react";
import type { EngineStatus } from "../api/cuepointBridge.types";
import "./EngineStatusBanner.css";

export function EngineStatusBanner() {
  const [status, setStatus] = useState<EngineStatus | null>(null);

  useEffect(() => {
    if (!window.cuepoint?.getEngineStatus) {
      setStatus(null);
      return;
    }
    void window.cuepoint.getEngineStatus().then(setStatus);
  }, []);

  if (!status) return null;

  return (
    <div
      className={`engine-status ${status.connected ? "engine-status--ok" : "engine-status--error"}`}
      role="status"
    >
      {status.connected
        ? `Engine connected${status.version ? ` · v${status.version}` : ""}`
        : `Engine offline${status.error ? `: ${status.error}` : ""}`}
    </div>
  );
}

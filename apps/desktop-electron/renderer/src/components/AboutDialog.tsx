import { useEffect, useState } from "react";
import { Modal } from "./index";
import { hasEngineBridge, type AppBuildInfo } from "../api/cuepointBridge.types";

export const DESKTOP_ENGINE_VERSION = "1.0.0-feb1";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [engineVersion, setEngineVersion] = useState<string | null>(null);
  const [engineConnected, setEngineConnected] = useState(false);
  const [build, setBuild] = useState<AppBuildInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    if (hasEngineBridge()) {
      void window.cuepoint?.getEngineStatus().then((status) => {
        if (!live) return;
        setEngineConnected(status.connected);
        setEngineVersion(status.version ?? null);
      });
    }
    // The app's own version and build come from Electron main (REPORT-07); an older main has none.
    void window.cuepoint
      ?.buildInfo?.()
      .then((info) => {
        if (live) setBuild(info);
      })
      .catch(() => {
        // About still shows the engine's line.
      });
    return () => {
      live = false;
    };
  }, [open]);

  return (
    <Modal open={open} title="About CuePoint" onClose={onClose} secondaryAction={{ label: "Close", onClick: onClose }}>
      <div className="about-dialog">
        <p>
          <strong>CuePoint</strong> — Rekordbox ↔ Beatport matching and discovery.
        </p>
        <ul>
          <li data-testid="about-version">Version: {build?.version ?? DESKTOP_ENGINE_VERSION}</li>
          <li data-testid="about-build">
            Build: {build ? (build.dist ?? "not recorded") : "unknown"}
            {build?.environment === "development" ? " (development)" : ""}
          </li>
          <li>
            Engine:{" "}
            {engineConnected
              ? `connected${engineVersion ? ` (${engineVersion})` : ""}`
              : "not connected"}
          </li>
        </ul>
      </div>
    </Modal>
  );
}

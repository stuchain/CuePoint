import { useEffect, useState } from "react";
import { Modal } from "./index";
import { hasEngineBridge } from "../api/cuepointBridge.types";

const DESKTOP_ENGINE_VERSION = "1.0.0-feb1";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const [engineVersion, setEngineVersion] = useState<string | null>(null);
  const [engineConnected, setEngineConnected] = useState(false);

  useEffect(() => {
    if (!open || !hasEngineBridge()) return;
    void window.cuepoint?.getEngineStatus().then((status) => {
      setEngineConnected(status.connected);
      setEngineVersion(status.version ?? null);
    });
  }, [open]);

  return (
    <Modal open={open} title="About CuePoint" onClose={onClose} secondaryAction={{ label: "Close", onClick: onClose }}>
      <div className="about-dialog">
        <p>
          <strong>CuePoint</strong> — Rekordbox ↔ Beatport matching and inCrate discovery.
        </p>
        <ul>
          <li>Desktop shell: Electron lab ({DESKTOP_ENGINE_VERSION} target)</li>
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

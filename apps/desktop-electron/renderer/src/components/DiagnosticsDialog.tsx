import { useEffect, useState } from "react";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { Modal } from "./Modal";
import "./DiagnosticsDialog.css";

interface DiagnosticsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DiagnosticsDialog({ open, onClose }: DiagnosticsDialogProps) {
  const [lines, setLines] = useState<string[]>(["Loading…"]);

  useEffect(() => {
    if (!open) return;
    if (!hasEngineBridge()) {
      setLines(["Engine bridge unavailable (browser-only mode)."]);
      return;
    }
    void window.cuepoint?.getEngineStatus().then((status) => {
      setLines([
        `Engine connected: ${status.connected}`,
        `Engine version: ${status.version ?? "unknown"}`,
        `Session ID: ${status.sessionId ?? "n/a"}`,
        status.error ? `Error: ${status.error}` : "",
      ].filter(Boolean));
    });
  }, [open]);

  return (
    <Modal
      open={open}
      title="Diagnostics"
      onClose={onClose}
      secondaryAction={{ label: "Close", onClick: onClose }}
    >
      <pre className="diagnostics-dialog__output">{lines.join("\n")}</pre>
    </Modal>
  );
}

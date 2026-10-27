import { useEffect, useState } from "react";
import { hasEngineBridge, type AppBuildInfo, type EngineStatus } from "../api/cuepointBridge.types";
import { appVersion, versionWords } from "./AboutDialog";
import { needsDesktopApp } from "../api/userMessage";
import { Loading } from "./Loading";
import { Modal } from "./Modal";

interface DiagnosticsDialogProps {
  open: boolean;
  onClose: () => void;
}

type Reading = { kind: "loading" } | { kind: "none" } | { kind: "status"; status: EngineStatus };

export function DiagnosticsDialog({ open, onClose }: DiagnosticsDialogProps) {
  const [reading, setReading] = useState<Reading>({ kind: "loading" });
  const [build, setBuild] = useState<AppBuildInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    setReading({ kind: "loading" });
    if (!hasEngineBridge()) {
      setReading({ kind: "none" });
      return;
    }
    let live = true;
    void window.cuepoint
      ?.buildInfo?.()
      .then((info) => {
        if (live) setBuild(info);
      })
      .catch(() => undefined);
    void window.cuepoint?.getEngineStatus().then((status) => {
      if (live) setReading({ kind: "status", status });
    });
    return () => {
      live = false;
    };
  }, [open]);

  return (
    <Modal open={open} title="Diagnostics" onClose={onClose} closeLabel="Close">
      {reading.kind === "loading" && <Loading what="diagnostics" />}
      {reading.kind === "none" && (
        <p className="cp-modal__lead">{needsDesktopApp("Diagnostics")}</p>
      )}
      {reading.kind === "status" && (
        <dl className="cp-facts cp-facts--dialog">
          <dt>Version</dt>
          <dd data-testid="diagnostics-version">{versionWords(appVersion(build), build)}</dd>
          <dt>Engine connected</dt>
          <dd>{reading.status.connected ? "Yes" : "No"}</dd>
          <dt>Engine version</dt>
          <dd>{reading.status.version ?? "—"}</dd>
          <dt>Session ID</dt>
          <dd className="cp-data">{reading.status.sessionId ?? "—"}</dd>
          {reading.status.error ? (
            <>
              <dt>Error</dt>
              <dd>{reading.status.error}</dd>
            </>
          ) : null}
        </dl>
      )}
    </Modal>
  );
}

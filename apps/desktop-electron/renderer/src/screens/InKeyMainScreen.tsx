import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Panel,
  ProgressBar,
  Tabs,
  ToolbarIcon,
  useToast,
} from "../components";
import { idleProgress, sampleProgress } from "../mocks/fixtures";
import type { ProgressInfo } from "../mocks/types";
import "./screens.css";

export function InKeyMainScreen() {
  const { push } = useToast();
  const [tab, setTab] = useState("main");
  const [filePath, setFilePath] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo>(idleProgress);

  const simulateRun = () => {
    if (!filePath) {
      push("Select a Rekordbox XML file first.", "warning");
      return;
    }
    setRunning(true);
    setProgress(sampleProgress);
    push("Processing started (mock).", "info");
    window.setTimeout(() => {
      setRunning(false);
      setProgress({ ...sampleProgress, completed_tracks: sampleProgress.total_tracks, percentage: 100, reliability_state: "completed", status_message: "Complete" });
      push("Batch complete — review results.", "success");
    }, 2500);
  };

  return (
    <div className="screen screen--stack">
      <header className="screen-toolbar">
        <Link to="/" className="screen-toolbar__brand">
          ← CuePoint / inKey
        </Link>
        <div className="screen-toolbar__actions">
          <ToolbarIcon label="Settings" glyph="⚙" />
          <ToolbarIcon label="Export" glyph="⬇" />
          <Link to="/results">
            <Button variant="secondary">View results</Button>
          </Link>
        </div>
      </header>

      <Tabs
        tabs={[
          { id: "main", label: "Main" },
          { id: "history", label: "Past searches" },
        ]}
        activeId={tab}
        onChange={setTab}
      />

      {tab === "main" ? (
        <div className="match-layout">
          <Panel title="Input" badge={<Badge variant="info">XML</Badge>}>
            <div className="drop-zone">
              <p>Drop Rekordbox collection XML here</p>
              <p className="drop-zone__hint">or use Browse (mock)</p>
              <div className="drop-zone__actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilePath("C:\\Music\\collection.xml");
                    push("File selected (mock).", "success");
                  }}
                >
                  Browse…
                </Button>
                {filePath && <Badge variant="success">{filePath.split("\\").pop()}</Badge>}
              </div>
            </div>
          </Panel>

          <Panel title="Processing" badge={<Badge>{progress.reliability_state ?? "idle"}</Badge>}>
            <ProgressBar
              value={progress.percentage}
              label={
                progress.status_message ??
                (filePath ? "Ready to process" : "Waiting for input file")
              }
            />
            <dl className="stats-grid">
              <div>
                <dt>Matched</dt>
                <dd>{progress.matched_count}</dd>
              </div>
              <div>
                <dt>Unmatched</dt>
                <dd>{progress.unmatched_count}</dd>
              </div>
              <div>
                <dt>Current</dt>
                <dd>
                  {progress.current_track.title
                    ? `${progress.current_track.title} — ${progress.current_track.artists}`
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="match-actions">
              <Button variant="primary" loading={running} onClick={simulateRun}>
                {running ? "Processing…" : "Start matching"}
              </Button>
              <Button variant="secondary" disabled={!running}>
                Cancel
              </Button>
            </div>
          </Panel>
        </div>
      ) : (
        <Panel title="Past searches">
          <p className="screen__muted">History list will mirror Qt Past Searches tab in parity phase.</p>
        </Panel>
      )}
    </div>
  );
}

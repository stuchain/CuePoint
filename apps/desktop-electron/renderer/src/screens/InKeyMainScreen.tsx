import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Panel,
  ProgressBar,
  Tabs,
  TextField,
  ToolbarIcon,
  useToast,
} from "../components";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { idleProgress } from "../mocks/fixtures";
import { useMatchJob, type FileSource } from "../hooks/useMatchJob";
import "./screens.css";

export function InKeyMainScreen() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [tab, setTab] = useState("main");
  const [filePath, setFilePath] = useState("");
  const [fileSource, setFileSource] = useState<FileSource>("none");
  const [playlistName, setPlaylistName] = useState("My Playlist");
  const engineAvailable = hasEngineBridge();

  const { running, cancelling, progress, startMatch, cancelMatch } = useMatchJob({
    onComplete: () => {
      push(
        engineAvailable ? "Batch complete — review results." : "Batch complete (mock).",
        "success",
      );
    },
    onCancelled: () => push("Processing cancelled.", "info"),
    onError: (message) => push(message, "warning"),
  });

  const handleBrowse = async () => {
    if (window.cuepoint?.openXmlFileDialog) {
      const result = await window.cuepoint.openXmlFileDialog();
      if (result.canceled) return;
      setFilePath(result.filePath);
      setFileSource("native");
      push("File selected.", "success");
      return;
    }

    setFilePath("C:\\Music\\collection.xml");
    setFileSource("mock");
    push("File selected (mock).", "success");
  };

  const handleStart = () => {
    if (!engineAvailable && !filePath) {
      push("Select a Rekordbox XML file first.", "warning");
      return;
    }

    void startMatch(filePath, fileSource, playlistName);
    if (engineAvailable) {
      push(fileSource === "native" ? "Match job started." : "Demo job started.", "info");
    } else {
      push("Processing started (mock).", "info");
    }
  };

  const displayProgress = running || progress.reliability_state !== "idle" ? progress : idleProgress;

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
              <p className="drop-zone__hint">
                {engineAvailable ? "Browse opens a native file dialog" : "or use Browse (mock)"}
              </p>
              <div className="drop-zone__actions">
                <Button variant="secondary" onClick={() => void handleBrowse()}>
                  Browse…
                </Button>
                {filePath && <Badge variant="success">{filePath.split(/[/\\]/).pop()}</Badge>}
              </div>
            </div>
            <TextField
              label="Playlist name"
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
              hint={
                engineAvailable
                  ? "Required for real XML jobs; demo jobs ignore this field."
                  : "Used when wired to the engine."
              }
            />
          </Panel>

          <Panel title="Processing" badge={<Badge>{displayProgress.reliability_state ?? "idle"}</Badge>}>
            <ProgressBar
              value={displayProgress.percentage}
              label={
                displayProgress.status_message ??
                (filePath || engineAvailable ? "Ready to process" : "Waiting for input file")
              }
            />
            <dl className="stats-grid">
              <div>
                <dt>Matched</dt>
                <dd>{displayProgress.matched_count}</dd>
              </div>
              <div>
                <dt>Unmatched</dt>
                <dd>{displayProgress.unmatched_count}</dd>
              </div>
              <div>
                <dt>Current</dt>
                <dd>
                  {displayProgress.current_track.title
                    ? `${displayProgress.current_track.title} — ${displayProgress.current_track.artists}`
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="match-actions">
              <Button variant="primary" loading={running && !cancelling} onClick={handleStart}>
                {running ? (cancelling ? "Cancelling…" : "Processing…") : engineAvailable && fileSource !== "native" ? "Start demo job" : "Start matching"}
              </Button>
              <Button variant="secondary" disabled={!running} loading={cancelling} onClick={() => void cancelMatch()}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                disabled={running}
                onClick={() => navigate("/results")}
              >
                Open results
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

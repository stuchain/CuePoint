import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Panel,
  ProgressBar,
  RunSummaryDialog,
  Tabs,
  TextField,
  ToolbarIcon,
  useToast,
} from "../components";
import type { InKeyRerunRequest } from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import {
  buildBatchRunSummary,
  buildRunSummary,
  type RunSummaryView,
} from "../api/runSummaryUtils";
import { idleProgress } from "../mocks/fixtures";
import { useMatchJob, type FileSource, type MatchInputSource } from "../hooks/useMatchJob";
import { useFileDrop } from "../hooks/useFileDrop";
import { useMatchResults } from "../context/MatchResultsContext";
import { useXmlPlaylists } from "../hooks/useXmlPlaylists";
import { BatchPlaylistPicker } from "./BatchPlaylistPicker";
import { PastSearchesPanel } from "./PastSearchesPanel";
import "./screens.css";

type ProcessingMode = "single" | "batch";

export function InKeyMainScreen({
  onOpenPlaylistExportInstructions,
}: {
  onOpenPlaylistExportInstructions?: () => void;
}) {
  const navigate = useNavigate();
  const { push } = useToast();
  const [tab, setTab] = useState("main");
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("single");
  const [inputSource, setInputSource] = useState<MatchInputSource>("collection");
  const [filePath, setFilePath] = useState("");
  const [fileSource, setFileSource] = useState<FileSource>("none");
  const [playlistName, setPlaylistName] = useState("My Playlist");
  const [selectedBatchPaths, setSelectedBatchPaths] = useState<string[]>([]);
  const engineAvailable = hasEngineBridge();
  const { setMatchMeta } = useMatchResults();
  const [runSummary, setRunSummary] = useState<RunSummaryView | null>(null);

  const { running, cancelling, progress, startMatch, cancelMatch } = useMatchJob({
    onComplete: (payload) => {
      if (payload?.batchResults && Object.keys(payload.batchResults).length > 0) {
        setRunSummary(buildBatchRunSummary(payload.batchResults, payload.durationSec));
      } else if (payload?.results.length) {
        setRunSummary(
          buildRunSummary(payload.results, playlistName, payload.durationSec),
        );
      }
      push(
        engineAvailable ? "Processing complete — review results." : "Processing complete (mock).",
        "success",
      );
    },
    onCancelled: () => push("Processing cancelled.", "info"),
    onError: (message) => push(message, "warning"),
  });

  const {
    loading: playlistsLoading,
    playlists,
    error: playlistsError,
  } = useXmlPlaylists(filePath, inputSource === "collection" ? fileSource : "none");

  useEffect(() => {
    setSelectedBatchPaths([]);
  }, [filePath, processingMode, inputSource]);

  const handleInputSourceChange = (source: MatchInputSource) => {
    setInputSource(source);
    setFilePath("");
    setFileSource("none");
    if (source === "playlist_file") {
      setProcessingMode("single");
    }
  };

  const handleBrowse = async () => {
    if (inputSource === "playlist_file") {
      if (window.cuepoint?.openM3uFileDialog) {
        const result = await window.cuepoint.openM3uFileDialog();
        if (result.canceled) return;
        setFilePath(result.filePath);
        setFileSource("native");
        push("Playlist file selected.", "success");
        return;
      }

      setFilePath("C:\\Music\\set.m3u");
      setFileSource("mock");
      push("Playlist file selected (mock).", "success");
      return;
    }

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

  const applyDroppedFile = useCallback(
    (path: string) => {
      setFilePath(path);
      setFileSource(engineAvailable ? "native" : "mock");
      push(
        inputSource === "playlist_file" ? "Playlist file dropped." : "XML file dropped.",
        "success",
      );
    },
    [engineAvailable, inputSource, push],
  );

  const { dragOver, dropHandlers } = useFileDrop({
    kind: inputSource === "playlist_file" ? "m3u" : "xml",
    onFile: applyDroppedFile,
    onError: (message) => push(message, "warning"),
  });

  const handleStart = () => {
    if (inputSource === "playlist_file") {
      if (!filePath) {
        push("Select an M3U playlist file first.", "warning");
        return;
      }
      setMatchMeta({
        source: "playlist_file",
        m3uPath: filePath,
        playlistName: filePath.split(/[/\\]/).pop(),
      });
      void startMatch(filePath, fileSource, playlistName, { inputSource: "playlist_file" });
      if (engineAvailable && fileSource === "native") {
        push("M3U match job started.", "info");
      } else {
        push("Processing started (mock).", "info");
      }
      return;
    }

    if (!engineAvailable && !filePath) {
      push("Select a Rekordbox XML file first.", "warning");
      return;
    }

    if (processingMode === "batch") {
      if (engineAvailable && fileSource === "native") {
        if (selectedBatchPaths.length === 0) {
          push("Select at least one playlist for batch processing.", "warning");
          return;
        }
        setMatchMeta({
          source: "collection",
          xmlPath: filePath,
          playlistName: selectedBatchPaths[0],
        });
        void startMatch(filePath, fileSource, playlistName, { playlistNames: selectedBatchPaths });
        push(`Batch job started (${selectedBatchPaths.length} playlists).`, "info");
        return;
      }
      void startMatch(filePath, fileSource, playlistName, { demoBatch: true });
      push("Batch demo job started.", "info");
      return;
    }

    setMatchMeta({
      source: "collection",
      xmlPath: fileSource === "native" ? filePath : undefined,
      playlistName,
    });
    void startMatch(filePath, fileSource, playlistName);
    if (engineAvailable) {
      push(fileSource === "native" ? "Match job started." : "Demo job started.", "info");
    } else {
      push("Processing started (mock).", "info");
    }
  };

  const handleStartBatchDemo = () => {
    if (!engineAvailable) {
      push("Batch demo requires the Electron engine.", "warning");
      return;
    }
    void startMatch(filePath, fileSource, playlistName, { demoBatch: true });
    push("Batch demo job started.", "info");
  };

  const applyRerun = useCallback(
    (request: InKeyRerunRequest) => {
      setTab("main");
      setProcessingMode("single");
      if (request.source === "playlist_file" && request.m3uPath) {
        setInputSource("playlist_file");
        setFilePath(request.m3uPath);
        setFileSource("native");
        if (request.autoStart) {
          void startMatch(request.m3uPath, "native", "", { inputSource: "playlist_file" });
          push("Re-run M3U match job started.", "info");
        }
        return;
      }
      setInputSource("collection");
      if (request.playlistName) {
        setPlaylistName(request.playlistName);
      }
      if (request.xmlPath) {
        setFilePath(request.xmlPath);
        setFileSource("native");
      }
      if (request.autoStart && request.xmlPath && request.playlistName) {
        void startMatch(request.xmlPath, "native", request.playlistName, {
          inputSource: "collection",
        });
        push("Re-run match job started.", "info");
      }
    },
    [push, startMatch],
  );

  const displayProgress = running || progress.reliability_state !== "idle" ? progress : idleProgress;
  const canStartBatchReal = engineAvailable && fileSource === "native" && selectedBatchPaths.length > 0;

  return (
    <div className="screen screen--stack">
      <header className="screen-toolbar">
        <Link to="/" className="screen-toolbar__brand">
          ← CuePoint / inKey
        </Link>
        <div className="screen-toolbar__actions">
          <ToolbarIcon label="Settings" icon="settings" />
          <ToolbarIcon label="Export" icon="export" />
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
        <>
          <div className="match-mode-toggle">
            <Button
              className="match-mode-toggle__btn"
              variant={inputSource === "collection" ? "primary" : "secondary"}
              onClick={() => handleInputSourceChange("collection")}
            >
              Collection (XML)
            </Button>
            <Button
              className="match-mode-toggle__btn"
              variant={inputSource === "playlist_file" ? "primary" : "secondary"}
              onClick={() => handleInputSourceChange("playlist_file")}
            >
              Playlist file (M3U)
            </Button>
          </div>

          {inputSource === "collection" && (
            <div className="match-mode-toggle">
              <Button
                className="match-mode-toggle__btn"
                variant={processingMode === "single" ? "primary" : "secondary"}
                onClick={() => setProcessingMode("single")}
              >
                Single playlist
              </Button>
              <Button
                className="match-mode-toggle__btn"
                variant={processingMode === "batch" ? "primary" : "secondary"}
                onClick={() => setProcessingMode("batch")}
              >
                Batch
              </Button>
            </div>
          )}

          <div className="match-layout">
            <Panel
              title="Input"
              badge={
                <Badge variant="info">{inputSource === "playlist_file" ? "M3U" : "XML"}</Badge>
              }
            >
              <div
                className={`drop-zone ${dragOver ? "drop-zone--active" : ""}`}
                {...dropHandlers}
              >
                <p>
                  {inputSource === "playlist_file"
                    ? "Drop M3U / M3U8 playlist file here"
                    : "Drop Rekordbox collection XML here"}
                </p>
                <p className="drop-zone__hint">
                  {engineAvailable ? "Browse opens a native file dialog" : "or use Browse (mock)"}
                </p>
                <div className="drop-zone__actions">
                  <Button variant="secondary" onClick={() => void handleBrowse()}>
                    Browse…
                  </Button>
                  {inputSource === "playlist_file" ? (
                    <Button
                      variant="secondary"
                      onClick={() => onOpenPlaylistExportInstructions?.()}
                    >
                      How to export M3U…
                    </Button>
                  ) : null}
                  {filePath && <Badge variant="success">{filePath.split(/[/\\]/).pop()}</Badge>}
                </div>
              </div>

              {inputSource === "collection" && processingMode === "single" ? (
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
              ) : inputSource === "collection" ? (
                <BatchPlaylistPicker
                  playlists={playlists}
                  selectedPaths={selectedBatchPaths}
                  loading={playlistsLoading}
                  error={playlistsError}
                  onChange={setSelectedBatchPaths}
                />
              ) : (
                <p className="screen__muted">
                  Tracks are read directly from the playlist file. Batch mode is not available for
                  M3U sources.
                </p>
              )}
            </Panel>

            <Panel title="Processing" badge={<Badge>{displayProgress.reliability_state ?? "idle"}</Badge>}>
              <ProgressBar
                value={displayProgress.percentage}
                label={
                  displayProgress.status_message ??
                  (filePath || engineAvailable
                    ? inputSource === "playlist_file"
                      ? "Ready to process playlist file"
                      : "Ready to process"
                    : "Waiting for input file")
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
                  {running
                    ? cancelling
                      ? "Cancelling…"
                      : "Processing…"
                    : processingMode === "batch" && inputSource === "collection"
                      ? canStartBatchReal
                        ? `Start batch (${selectedBatchPaths.length})`
                        : engineAvailable
                          ? "Start batch demo"
                          : "Start batch (mock)"
                      : inputSource === "playlist_file"
                        ? engineAvailable && fileSource === "native"
                          ? "Start M3U matching"
                          : "Start matching (mock)"
                        : engineAvailable && fileSource !== "native"
                          ? "Start demo job"
                          : "Start matching"}
                </Button>
                {engineAvailable && processingMode === "single" && inputSource === "collection" && (
                  <Button
                    variant="secondary"
                    disabled={running}
                    loading={running && !cancelling}
                    onClick={handleStartBatchDemo}
                  >
                    Start batch demo
                  </Button>
                )}
                <Button variant="secondary" disabled={!running} loading={cancelling} onClick={() => void cancelMatch()}>
                  Cancel
                </Button>
                <Button variant="secondary" disabled={running} onClick={() => navigate("/results")}>
                  Open results
                </Button>
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <PastSearchesPanel onRerun={applyRerun} />
      )}
      <RunSummaryDialog
        open={runSummary != null}
        summary={runSummary}
        onClose={() => setRunSummary(null)}
        onViewResults={() => {
          setRunSummary(null);
          navigate("/results");
        }}
      />
    </div>
  );
}

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  CandidateDialog,
  ExportResultsButton,
  Panel,
  ResultsTable,
  Select,
  SyncCompleteDialog,
  SyncTagsDialog,
  Tabs,
  ToolbarIcon,
  useToast,
} from "../components";
import { useResultsFrameLayout } from "../components/useResultsFrameLayout";
import { applyCandidateToResult, hasCandidates } from "../api/candidateUtils";
import { needsReviewTrack } from "../api/reviewUtils";
import {
  filterWriteRows,
  selectedWriteRows,
  syncSummaryMessage,
  type SyncTagsOptions,
  type SyncTagsResponse,
} from "../api/syncTagsUtils";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { sampleBatchResults, sampleResults } from "../mocks/fixtures";
import { useMatchResults } from "../context/MatchResultsContext";
import { useSyncTags } from "../hooks/useSyncTags";
import { useScale } from "../tokens/ScaleContext";
import type { TrackResult } from "../mocks/types";
import "./screens.css";

export function ResultsScreen() {
  const { scale } = useScale();
  const { push } = useToast();
  const [searchParams] = useSearchParams();
  const {
    mode,
    results: engineResults,
    batchResults,
    activePlaylist,
    source,
    setActivePlaylist,
    updateTrackResult,
    matchMeta,
    batchResults: allBatchResults,
  } = useMatchResults();
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched" | "needs_review">("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [candidateRow, setCandidateRow] = useState<TrackResult | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncCompleteOpen, setSyncCompleteOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncTagsResponse | null>(null);
  const { syncing, runSync } = useSyncTags({ onError: (message) => push(message, "warning") });
  const { frameRef, frameWidth, frameHeight, isSized, startFrameResize, resetFrameSize } =
    useResultsFrameLayout(scale);

  const engineAvailable = hasEngineBridge();
  const playlistNames = useMemo(() => Object.keys(batchResults), [batchResults]);

  const activeRows = useMemo(() => {
    if (mode === "batch") {
      if (source === "engine") {
        return activePlaylist ? (batchResults[activePlaylist] ?? []) : [];
      }
      return activePlaylist ? (sampleBatchResults[activePlaylist] ?? []) : [];
    }
    return source === "engine" ? engineResults : engineAvailable ? [] : sampleResults;
  }, [activePlaylist, batchResults, engineAvailable, engineResults, mode, source]);

  useEffect(() => {
    const urlFilter = searchParams.get("filter");
    if (urlFilter === "needs_review") {
      setFilter("needs_review");
    }
  }, [searchParams]);

  useEffect(() => {
    document.body.classList.toggle("results-page-scrollable", isSized);
    return () => document.body.classList.remove("results-page-scrollable");
  }, [isSized]);

  useEffect(() => {
    if (mode !== "batch") return;
    if (source === "engine" && playlistNames.length > 0 && !activePlaylist) {
      setActivePlaylist(playlistNames[0]!);
      return;
    }
    if (source === "fixtures" && !activePlaylist) {
      setActivePlaylist(Object.keys(sampleBatchResults)[0] ?? null);
    }
  }, [activePlaylist, mode, playlistNames, setActivePlaylist, source]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || selected == null) return;
      const row = activeRows.find((entry) => entry.playlist_index === selected);
      if (row && hasCandidates(row)) {
        event.preventDefault();
        setCandidateRow(row);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeRows, selected]);

  const rows = useMemo(() => {
    if (filter === "matched") return activeRows.filter((r) => r.matched);
    if (filter === "unmatched") return activeRows.filter((r) => !r.matched);
    if (filter === "needs_review") return activeRows.filter(needsReviewTrack);
    return activeRows;
  }, [activeRows, filter]);

  const exportPlaylistName =
    mode === "batch" && activePlaylist ? activePlaylist : "match-results";

  const handleOpenCandidates = (row: TrackResult) => {
    if (!hasCandidates(row)) {
      push("No candidates available for this track.", "info");
      return;
    }
    setCandidateRow(row);
  };

  const handleSelectCandidate = (candidate: Parameters<typeof applyCandidateToResult>[1]) => {
    if (!candidateRow) return;
    updateTrackResult(
      mode === "batch" ? activePlaylist : null,
      candidateRow.playlist_index,
      (row) => applyCandidateToResult(row, candidate),
    );
    push("Candidate applied to result row.", "success");
  };

  const handleToggleWrite = (playlistIndex: number) => {
    updateTrackResult(mode === "batch" ? activePlaylist : null, playlistIndex, (row) => ({
      ...row,
      write: !row.write,
    }));
  };

  const syncSourceRows = useMemo(() => {
    if (mode === "batch" && source === "engine") {
      return Object.values(allBatchResults).flat();
    }
    return source === "engine" ? engineResults : [];
  }, [allBatchResults, engineResults, mode, source]);

  const canSync = engineAvailable && source === "engine" && syncSourceRows.length > 0;

  const handleOpenSync = () => {
    if (!canSync) {
      push("Run a real match job before syncing tags.", "warning");
      return;
    }
    if (!selectedWriteRows(syncSourceRows)) {
      push("Select at least one track (Write column) to sync.", "warning");
      return;
    }
    setSyncDialogOpen(true);
  };

  const handleConfirmSync = async (options: SyncTagsOptions) => {
    setSyncDialogOpen(false);
    const meta = matchMeta ?? {
      source: syncSourceRows.some((row) => row.file_path) ? "playlist_file" as const : "collection",
    };

    if (mode === "batch") {
      const batchPayload: Record<string, TrackResult[]> = {};
      for (const [playlistName, playlistRows] of Object.entries(allBatchResults)) {
        const selected = filterWriteRows(playlistRows);
        if (selected.length > 0) {
          batchPayload[playlistName] = selected;
        }
      }
      const response = await runSync({
        options,
        meta,
        mode: "batch",
        batchResults: batchPayload,
      });
      if (response) {
        setSyncResult(response);
        setSyncCompleteOpen(true);
        push(syncSummaryMessage(response), response.failed > 0 ? "warning" : "success");
      }
      return;
    }

    const selected = filterWriteRows(engineResults);
    const response = await runSync({
      options,
      meta,
      mode: "single",
      results: selected,
      playlistName: exportPlaylistName,
    });
    if (response) {
      setSyncResult(response);
      setSyncCompleteOpen(true);
      push(syncSummaryMessage(response), response.failed > 0 ? "warning" : "success");
    }
  };

  const frameStyle = {
    ...(frameWidth != null ? { width: `${frameWidth}px`, maxWidth: "var(--results-frame-max-width)" } : {}),
    ...(frameHeight != null ? { height: `${frameHeight}px` } : {}),
  } as CSSProperties;

  const batchTabs =
    mode === "batch"
      ? (source === "engine" ? playlistNames : Object.keys(sampleBatchResults)).map((name) => ({
          id: name,
          label: name,
        }))
      : [];

  const matchedCount = rows.filter((r) => r.matched).length;

  return (
    <div className={`screen screen--stack screen--fill ${isSized ? "screen--scrollable" : ""}`}>
      <header className="screen-toolbar">
        <Link to="/match" className="screen-toolbar__brand">
          ← Back to inKey
        </Link>
        <div className="screen-toolbar__actions">
          <ToolbarIcon label="Filter" icon="filter" active />
          <Button variant="secondary" disabled={!canSync || syncing} loading={syncing} onClick={handleOpenSync}>
            Sync with Rekordbox
          </Button>
          <ExportResultsButton rows={rows} playlistName={exportPlaylistName} label="Export" />
          <Link to="/settings">
            <Button variant="secondary">Settings</Button>
          </Link>
        </div>
      </header>

      {mode === "batch" && batchTabs.length > 0 && (
        <Tabs
          tabs={batchTabs}
          activeId={activePlaylist ?? batchTabs[0]!.id}
          onChange={setActivePlaylist}
        />
      )}

      <div
        ref={frameRef}
        className={`results-frame ${isSized ? "results-frame--sized" : ""}`}
        style={frameStyle}
      >
        <Panel
          className="cp-panel--fill cp-panel--in-frame"
          title="Results"
          badge={
            <Badge variant="info">
              {rows.length} tracks · {matchedCount} matched
              {source === "engine" ? " · live" : ""}
              {mode === "batch" && activePlaylist ? ` · ${activePlaylist}` : ""}
            </Badge>
          }
        >
          <div className="results-panel-body">
            <div className="results-toolbar">
              <Select
                label="Show"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                options={[
                  { value: "all", label: "All tracks" },
                  { value: "matched", label: "Matched only" },
                  { value: "unmatched", label: "Unmatched only" },
                  { value: "needs_review", label: "Needs review" },
                ]}
              />
              {selected != null && (
                <Button variant="secondary" onClick={() => {
                  const row = rows.find((entry) => entry.playlist_index === selected);
                  if (row) handleOpenCandidates(row);
                }}>
                  View candidates
                </Button>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="screen__muted">
                {source === "engine"
                  ? mode === "batch"
                    ? "No batch results yet. Run a batch demo job from inKey."
                    : "No match results yet. Run a job from inKey to populate this table."
                  : engineAvailable
                    ? "No results loaded."
                    : "Sample data is shown in browser-only mode."}
              </p>
            ) : (
              <ResultsTable
                rows={rows}
                selectedIndex={selected}
                onSelectRow={setSelected}
                onRowDoubleClick={handleOpenCandidates}
                onToggleWrite={source === "engine" ? handleToggleWrite : undefined}
              />
            )}
          </div>
        </Panel>
        <button
          type="button"
          className="results-frame__resizer"
          aria-label="Resize results panel"
          title="Drag to resize panel. Double-click to reset size."
          onMouseDown={(event) => {
            event.preventDefault();
            startFrameResize(event.clientX, event.clientY);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            resetFrameSize();
          }}
        />
      </div>

      <CandidateDialog
        open={candidateRow != null}
        row={candidateRow}
        onClose={() => setCandidateRow(null)}
        onSelectCandidate={handleSelectCandidate}
      />
      <SyncTagsDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
        onConfirm={(options) => void handleConfirmSync(options)}
        loading={syncing}
      />
      <SyncCompleteDialog
        open={syncCompleteOpen}
        result={syncResult}
        onClose={() => setSyncCompleteOpen(false)}
      />
    </div>
  );
}

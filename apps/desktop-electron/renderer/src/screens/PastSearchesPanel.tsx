import { useNavigate } from "react-router-dom";
import { Badge, Button, ListRow, Panel, useToast } from "../components";
import type { HistoryLoadResponse, InKeyRerunRequest } from "../api/cuepointBridge.types";
import { useMatchResults } from "../context/MatchResultsContext";
import { usePastSearches } from "../hooks/usePastSearches";
import "./screens.css";

export interface PastSearchesPanelProps {
  onRerun?: (request: InKeyRerunRequest) => void;
}

function formatModified(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function rerunHint(loaded: HistoryLoadResponse): string | null {
  const rerun = loaded.rerun;
  if (!rerun) return null;
  if (rerun.source === "playlist_file") {
    return rerun.m3u_exists
      ? `M3U: ${rerun.m3u_path}`
      : "Original M3U file not found on disk.";
  }
  if (rerun.xml_path && rerun.playlist_name) {
    return rerun.xml_exists
      ? `${rerun.playlist_name} · ${rerun.xml_path}`
      : "Original XML file not found — re-run will prompt for a new file.";
  }
  return "Re-run metadata unavailable for this export.";
}

export function PastSearchesPanel({ onRerun }: PastSearchesPanelProps) {
  const navigate = useNavigate();
  const { push } = useToast();
  const { setEngineResults } = useMatchResults();
  const {
    engineAvailable,
    loading,
    files,
    directory,
    loaded,
    selectedPath,
    refreshRecent,
    loadCsv,
    browseCsv,
  } = usePastSearches({
    onError: (message) => push(message, "warning"),
  });

  const handleOpenInResults = (filter: "all" | "review" = "all") => {
    if (!loaded) return;
    setEngineResults(loaded.results, `history:${loaded.file_path}`);
    push(`Loaded ${loaded.row_count} tracks from ${loaded.file_name}.`, "success");
    navigate(filter === "review" ? "/results?filter=needs_review" : "/results");
  };

  const handleRerun = async () => {
    if (!loaded?.rerun) {
      push("Re-run metadata not available for this file.", "warning");
      return;
    }

    const { rerun } = loaded;
    if (rerun.source === "playlist_file") {
      let m3uPath = rerun.m3u_path ?? "";
      if (!m3uPath || !rerun.m3u_exists) {
        if (!window.cuepoint?.openM3uFileDialog) {
          push("Select the M3U file on the Main tab to re-run.", "info");
          onRerun?.({ source: "playlist_file" });
          return;
        }
        const picked = await window.cuepoint.openM3uFileDialog();
        if (picked.canceled) return;
        m3uPath = picked.filePath;
      }

      onRerun?.({ m3uPath, source: "playlist_file", autoStart: true });
      push("Re-run loaded on Main tab.", "success");
      return;
    }

    let xmlPath = rerun.xml_path ?? "";
    if (!xmlPath || !rerun.xml_exists) {
      if (!window.cuepoint?.openXmlFileDialog) {
        push("Select the original XML file on the Main tab to re-run.", "info");
        onRerun?.({ playlistName: rerun.playlist_name ?? loaded.meta?.playlist_name ?? "" });
        return;
      }
      const picked = await window.cuepoint.openXmlFileDialog();
      if (picked.canceled) return;
      xmlPath = picked.filePath;
    }

    if (!rerun.playlist_name) {
      push("Playlist name missing from export metadata.", "warning");
      return;
    }

    onRerun?.({
      xmlPath,
      playlistName: rerun.playlist_name,
      source: "collection",
      autoStart: true,
    });
    push("Re-run loaded on Main tab.", "success");
  };

  const reviewCount = loaded?.review_count ?? 0;
  const hasReviewCandidates = Boolean(
    loaded?.related_files?.review_candidates_csv ?? loaded?.related_files?.candidates_csv,
  );

  return (
    <div className="past-searches">
      <Panel title="Select past search">
        <p className="screen__muted">
          {directory
            ? `Exports folder: ${directory}`
            : engineAvailable
              ? "Loading exports folder…"
              : "Browser-only mock history."}
        </p>
        <div className="past-searches__actions">
          <Button variant="secondary" loading={loading} onClick={() => void refreshRecent()}>
            Refresh list
          </Button>
          <Button variant="secondary" disabled={!engineAvailable} onClick={() => void browseCsv()}>
            Browse CSV…
          </Button>
        </div>

        {files.length === 0 ? (
          <p className="screen__muted">
            {engineAvailable
              ? "No exported CSV files yet. Run a match job and export results to populate this list."
              : "No mock history entries."}
          </p>
        ) : (
          <ul className="past-searches__list">
            {files.map((file) => {
              const active = selectedPath === file.file_path;
              return (
                <li key={file.file_path}>
                  <ListRow
                    primary={file.playlist_name ?? file.file_name}
                    secondary={`${formatModified(file.modified_at)} · ${formatBytes(file.size_bytes)}`}
                    meta={active ? <Badge variant="info">Loaded</Badge> : undefined}
                    selected={active}
                    onClick={() => void loadCsv(file.file_path)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Search results"
        badge={
          loaded ? (
            <Badge variant="info">
              {loaded.row_count} tracks · {loaded.matched_count} matched
              {reviewCount > 0 ? ` · ${reviewCount} need review` : ""}
            </Badge>
          ) : undefined
        }
      >
        {!loaded ? (
          <p className="screen__muted">
            Select a recent CSV or browse to preview a past search. Open in Results for full table
            tools.
          </p>
        ) : (
          <>
            <p className="past-searches__summary">
              <strong>{loaded.file_name}</strong>
              {loaded.meta?.playlist_name ? ` · Playlist: ${loaded.meta.playlist_name}` : ""}
              {loaded.meta?.xml_path ? ` · XML: ${loaded.meta.xml_path}` : ""}
            </p>
            {rerunHint(loaded) && <p className="screen__muted">{rerunHint(loaded)}</p>}
            {hasReviewCandidates && (
              <p className="screen__muted">Review candidates CSV found — merged into loaded rows.</p>
            )}
            <div className="past-searches__preview">
              <table className="past-searches__table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Title</th>
                    <th>Artist</th>
                    <th>Matched</th>
                    <th>Beatport title</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {loaded.results.slice(0, 12).map((row) => (
                    <tr key={row.playlist_index}>
                      <td>{row.playlist_index}</td>
                      <td>{row.title}</td>
                      <td>{row.artist}</td>
                      <td>{row.matched ? "Yes" : "No"}</td>
                      <td>{row.beatport_title ?? "—"}</td>
                      <td>{row.match_score != null ? row.match_score.toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loaded.results.length > 12 && (
                <p className="screen__muted">Showing first 12 of {loaded.results.length} rows.</p>
              )}
            </div>
            <div className="past-searches__actions">
              <Button variant="primary" onClick={() => handleOpenInResults("all")}>
                Open in Results
              </Button>
              {reviewCount > 0 && (
                <Button variant="secondary" onClick={() => handleOpenInResults("review")}>
                  Open review tracks ({reviewCount})
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={!loaded.rerun?.can_rerun && !loaded.rerun?.playlist_name}
                onClick={() => void handleRerun()}
              >
                Re-run processing
              </Button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

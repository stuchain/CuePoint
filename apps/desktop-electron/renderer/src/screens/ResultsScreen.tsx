import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, ExportResultsButton, Panel, ResultsTable, Select, ToolbarIcon } from "../components";
import { useResultsFrameLayout } from "../components/useResultsFrameLayout";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { sampleResults } from "../mocks/fixtures";
import { useMatchResults } from "../context/MatchResultsContext";
import { useScale } from "../tokens/ScaleContext";
import "./screens.css";

export function ResultsScreen() {
  const { scale } = useScale();
  const { results: engineResults, source } = useMatchResults();
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [selected, setSelected] = useState<number | null>(null);
  const { frameRef, frameWidth, frameHeight, isSized, startFrameResize, resetFrameSize } =
    useResultsFrameLayout(scale);

  const engineAvailable = hasEngineBridge();
  const allRows =
    source === "engine" ? engineResults : engineAvailable ? [] : sampleResults;

  useEffect(() => {
    document.body.classList.toggle("results-page-scrollable", isSized);
    return () => document.body.classList.remove("results-page-scrollable");
  }, [isSized]);

  const rows = useMemo(() => {
    if (filter === "matched") return allRows.filter((r) => r.matched);
    if (filter === "unmatched") return allRows.filter((r) => !r.matched);
    return allRows;
  }, [allRows, filter]);

  const frameStyle = {
    ...(frameWidth != null ? { width: `${frameWidth}px`, maxWidth: "var(--results-frame-max-width)" } : {}),
    ...(frameHeight != null ? { height: `${frameHeight}px` } : {}),
  } as CSSProperties;

  return (
    <div className={`screen screen--stack screen--fill ${isSized ? "screen--scrollable" : ""}`}>
      <header className="screen-toolbar">
        <Link to="/match" className="screen-toolbar__brand">
          ← Back to inKey
        </Link>
        <div className="screen-toolbar__actions">
          <ToolbarIcon label="Filter" glyph="☰" active />
          <ExportResultsButton rows={rows} playlistName="match-results" label="Export" />
          <Link to="/settings">
            <Button variant="secondary">Settings</Button>
          </Link>
        </div>
      </header>

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
              {rows.length} tracks · {rows.filter((r) => r.matched).length} matched
              {source === "engine" ? " · live" : ""}
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
                ]}
              />
            </div>

            {rows.length === 0 ? (
              <p className="screen__muted">
                {source === "engine"
                  ? "No match results yet. Run a job from inKey to populate this table."
                  : engineAvailable
                    ? "No results loaded."
                    : "Sample data is shown in browser-only mode."}
              </p>
            ) : (
              <ResultsTable
                rows={rows}
                selectedIndex={selected}
                onSelectRow={setSelected}
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
    </div>
  );
}

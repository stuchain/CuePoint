import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge, Button, ListRow, Panel, Select, ToolbarIcon } from "../components";
import { sampleResults } from "../mocks/fixtures";
import type { TrackResult } from "../mocks/types";
import "./screens.css";

export function ResultsScreen() {
  const parentRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [selected, setSelected] = useState<number | null>(null);

  const rows = useMemo(() => {
    if (filter === "matched") return sampleResults.filter((r) => r.matched);
    if (filter === "unmatched") return sampleResults.filter((r) => !r.matched);
    return sampleResults;
  }, [filter]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  return (
    <div className="screen screen--stack">
      <header className="screen-toolbar">
        <Link to="/match" className="screen-toolbar__brand">
          ← Back to inKey
        </Link>
        <div className="screen-toolbar__actions">
          <ToolbarIcon label="Filter" glyph="☰" active />
          <ToolbarIcon label="Export CSV" glyph="⬇" />
          <Link to="/settings">
            <Button variant="secondary">Settings</Button>
          </Link>
        </div>
      </header>

      <Panel
        title="Results"
        badge={
          <Badge variant="info">
            {rows.length} tracks · {rows.filter((r) => r.matched).length} matched
          </Badge>
        }
      >
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

        <div className="results-header">
          <span>#</span>
          <span>Track</span>
          <span>Key</span>
          <span>BPM</span>
          <span>Score</span>
        </div>

        <div ref={parentRef} className="results-list">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index] as TrackResult;
              return (
                <div
                  key={row.playlist_index}
                  className="results-list__row-wrap"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <ListRow
                    selected={selected === row.playlist_index}
                    matched={row.matched}
                    onClick={() => setSelected(row.playlist_index)}
                    primary={row.title}
                    secondary={row.artist}
                    meta={
                      <>
                        <div>{row.beatport_key_camelot ?? "—"}</div>
                        <div>{row.beatport_bpm ?? "—"}</div>
                        <div>{row.match_score?.toFixed(0) ?? "—"}</div>
                      </>
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
    </div>
  );
}

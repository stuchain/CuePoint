import { useMemo, useState } from "react";
import { Badge, Button, Panel, TextField } from "../components";
import type { XmlPlaylistEntry } from "../api/cuepointBridge.types";
import "./screens.css";

export interface BatchPlaylistPickerProps {
  playlists: XmlPlaylistEntry[];
  selectedPaths: string[];
  loading?: boolean;
  error?: string | null;
  onChange: (paths: string[]) => void;
}

export function BatchPlaylistPicker({
  playlists,
  selectedPaths,
  loading = false,
  error = null,
  onChange,
}: BatchPlaylistPickerProps) {
  const [filter, setFilter] = useState("");
  const selected = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return playlists;
    return playlists.filter(
      (entry) =>
        entry.display_name.toLowerCase().includes(query) ||
        entry.path.toLowerCase().includes(query),
    );
  }, [filter, playlists]);

  const togglePath = (path: string) => {
    if (selected.has(path)) {
      onChange(selectedPaths.filter((entry) => entry !== path));
      return;
    }
    onChange([...selectedPaths, path]);
  };

  const selectVisible = () => {
    const merged = new Set(selectedPaths);
    for (const entry of visible) merged.add(entry.path);
    onChange([...merged]);
  };

  const clearSelection = () => onChange([]);

  return (
    <Panel title="Select playlists" badge={<Badge variant="info">{selectedPaths.length} selected</Badge>}>
      {error && <p className="screen__muted">{error}</p>}
      <TextField
        label="Search playlists"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        hint="Matches playlist path and display name."
      />
      <div className="past-searches__actions">
        <Button variant="secondary" disabled={loading || visible.length === 0} onClick={selectVisible}>
          Select visible
        </Button>
        <Button variant="secondary" disabled={loading || selectedPaths.length === 0} onClick={clearSelection}>
          Deselect all
        </Button>
      </div>
      {loading ? (
        <p className="screen__muted">Loading playlists from XML…</p>
      ) : playlists.length === 0 ? (
        <p className="screen__muted">Browse a Rekordbox XML file to list playlists.</p>
      ) : (
        <ul className="batch-playlist-picker__list">
          {visible.map((entry) => {
            const checked = selected.has(entry.path);
            return (
              <li key={entry.path}>
                <label className="batch-playlist-picker__row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePath(entry.path)}
                  />
                  <span className="batch-playlist-picker__label">
                    <strong>{entry.display_name}</strong>
                    <span className="screen__muted">
                      {entry.track_count} track{entry.track_count === 1 ? "" : "s"}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

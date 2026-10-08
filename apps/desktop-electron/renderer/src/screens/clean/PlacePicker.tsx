/**
 * Choosing playlists, Collections and Sets (PAGES-07B, FLW-7, FLW-12, FLW-13).
 *
 * The same places and the same "choose any" ticks as the Library's "In
 * playlist" field, so a scope picked here is the rule the Library would make.
 * Fix values and the match window both use it.
 */
import type { RuleSource } from "../library/filterText";
import { sourceKey } from "../library/filterText";
import type { CleanSource } from "./useCleanSources";

interface PlacePickerProps {
  sources: readonly CleanSource[];
  chosen: readonly RuleSource[];
  onChange: (next: RuleSource[]) => void;
}

const HEADINGS = { playlist: "Rekordbox playlists", collection: "Collections", set: "Sets" };

export function PlacePicker({ sources, chosen, onChange }: PlacePickerProps) {
  const ticked = new Set(chosen.map((source) => sourceKey(source.kind, source.id)));
  const toggle = (source: CleanSource) => {
    const token = sourceKey(source.kind, source.id);
    onChange(
      ticked.has(token)
        ? chosen.filter((entry) => sourceKey(entry.kind, entry.id) !== token)
        : [...chosen, { kind: source.kind, id: source.id }],
    );
  };

  return (
    <div
      className="clean-places"
      role="group"
      aria-label="Playlists, Collections and Sets — choose any"
    >
      {sources.length === 0 && (
        <span className="clean-places__hint">No playlists, Collections or Sets yet.</span>
      )}
      {sources.map((source, index) => (
        <div key={sourceKey(source.kind, source.id)}>
          {sources[index - 1]?.kind !== source.kind && (
            <span className="clean-places__heading">{HEADINGS[source.kind]}</span>
          )}
          <label className="clean-places__item" style={{ "--depth": source.depth } as React.CSSProperties}>
            <input
              type="checkbox"
              checked={ticked.has(sourceKey(source.kind, source.id))}
              onChange={() => toggle(source)}
            />
            {source.name}
          </label>
        </div>
      ))}
    </div>
  );
}

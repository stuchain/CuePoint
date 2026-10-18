/**
 * Where the Keys page counts (PAGES-16): the whole library, or ticked playlists,
 * Collections and Sets.
 *
 * The Library's own trees, drawn flat with a box on every row that can be counted:
 * a Rekordbox playlist folder counts everything under it, a Collections folder is only
 * a place and a Smart Collection holds a question rather than tracks, so neither of
 * those two has a box. Ticking is `toggleSource`; the page remembers it.
 */
import { useMemo, useState } from "react";

import { PixelIcon } from "../../components/PixelIcon";
import type { PixelIconName } from "../../components/pixelIcons";
import { SearchField } from "../../components/SearchField";
import { nothingMatches } from "../../format/words";
import { flatten, type PlaylistTreeNode } from "../library/playlistTree";
import {
  collectionPickerNodes,
  flattenCollections,
  holdsTracks,
  iconForKind,
  isCollection,
  isSet,
  setPickerNodes,
  type CollectionTreeNode,
} from "../library/collectionTree";
import "../library/PlaylistPane.css";
import { sameSource, type PickedSource } from "./keysSources";

interface KeysSourcePickerProps {
  playlists: readonly PlaylistTreeNode[];
  collections: readonly CollectionTreeNode[];
  picked: readonly PickedSource[];
  onToggle: (source: PickedSource) => void;
  /** Back to the whole library. */
  onClear: () => void;
  /** Tracks in the whole library, shown at the right of its row when known. */
  libraryTrackCount?: number | null;
}

interface Row {
  rowId: string;
  label: string;
  depth: number;
  icon: PixelIconName;
  /** `folder` rows are drawn brighter and bolder, as the Library's tree draws them. */
  kind: string;
  count: number | null;
  /** Absent for a row that is only a place. */
  source?: PickedSource;
}

function matches(label: string, needle: string): boolean {
  return label.toLocaleLowerCase().includes(needle);
}

export function KeysSourcePicker({
  playlists,
  collections,
  picked,
  onToggle,
  onClear,
  libraryTrackCount = null,
}: KeysSourcePickerProps) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLocaleLowerCase();

  const sections = useMemo(() => {
    const playlistRows: Row[] = flatten(playlists).map((node) => ({
      rowId: `playlist:${node.id}`,
      label: node.name,
      depth: node.depth,
      icon: node.kind === "folder" ? "folder" : "playlist",
      kind: node.kind,
      count: node.kind === "playlist" ? node.track_count : null,
      source: { kind: "playlist", id: node.id },
    }));
    const collectionRows: Row[] = collectionPickerNodes(collections).map((node) => ({
      rowId: `collection:${node.id}`,
      label: node.name,
      depth: node.depth,
      icon: iconForKind(node.kind),
      kind: node.kind,
      count: holdsTracks(node) ? node.entry_count : null,
      source: isCollection(node) ? { kind: "collection", id: node.id } : undefined,
    }));
    const setRows: Row[] = setPickerNodes(collections).map((node) => ({
      rowId: `set:${node.id}`,
      label: node.name,
      depth: node.depth,
      icon: iconForKind(node.kind),
      kind: node.kind,
      count: holdsTracks(node) ? node.entry_count : null,
      source: isSet(node) ? { kind: "set", id: node.id } : undefined,
    }));
    const narrow = (rows: Row[]) =>
      needle === "" ? rows : rows.filter((row) => row.source && matches(row.label, needle));
    return [
      { title: "Playlists", rows: narrow(playlistRows) },
      { title: "Collections", rows: narrow(collectionRows) },
      { title: "Sets", rows: narrow(setRows) },
    ].filter((section) => section.rows.length > 0);
  }, [collections, needle, playlists]);

  const everything = picked.length === 0;
  const any = flattenCollections(collections).length > 0 || playlists.length > 0;

  return (
    <section className="keys-sources" aria-labelledby="keys-sources-title">
      <h2 id="keys-sources-title" className="cp-text-section">
        Sources
      </h2>
      <div className="keys-sources__body" role="group" aria-label="Sources">
        <label className="cp-playlist-pane__row keys-sources__row keys-sources__row--whole">
          <input
            type="checkbox"
            aria-label="Whole library"
            checked={everything}
            // Unticking it with nothing else ticked would leave nothing to count.
            onChange={() => {
              if (!everything) onClear();
            }}
          />
          <PixelIcon name="library" className="cp-playlist-pane__icon" />
          <span className="cp-playlist-pane__name">Whole library</span>
          {libraryTrackCount != null && (
            <span className="cp-playlist-pane__count">{libraryTrackCount.toLocaleString()}</span>
          )}
        </label>

        {any && (
          <SearchField
            thing="sources"
            className="keys-sources__filter"
            // "Search sources…" is cut off in the narrow box, so it shortens to "Search…" when it does
            // not fit. The field's accessible name stays "Search sources".
            fitPlaceholder
            value={filter}
            onValueChange={setFilter}
          />
        )}

        {sections.map((section) => (
          <div key={section.title} className="keys-sources__section">
            <h3 className="cp-text-label keys-sources__title">{section.title}</h3>
            <ul className="keys-sources__list">
              {section.rows.map((row) => {
                const indent = {
                  paddingLeft: `calc(var(--space-sm) + ${row.depth} * var(--tree-step))`,
                } as React.CSSProperties;
                const body = (
                  <>
                    {Array.from({ length: row.depth }, (_, level) => (
                      <span
                        key={level}
                        className="cp-playlist-pane__guide"
                        aria-hidden
                        style={{
                          left: `calc(var(--space-sm) + ${level} * var(--tree-step) + var(--tree-step) / 2)`,
                        }}
                      />
                    ))}
                    {row.source ? (
                      <input
                        type="checkbox"
                        aria-label={row.label}
                        checked={picked.some((item) => sameSource(item, row.source!))}
                        onChange={() => onToggle(row.source!)}
                      />
                    ) : (
                      <span className="keys-sources__no-box" aria-hidden />
                    )}
                    <PixelIcon name={row.icon} className="cp-playlist-pane__icon" />
                    <span className="cp-playlist-pane__name">{row.label}</span>
                    {row.count != null && (
                      <span className="cp-playlist-pane__count">{row.count.toLocaleString()}</span>
                    )}
                  </>
                );
                return (
                  <li key={row.rowId} className="keys-sources__item">
                    {row.source ? (
                      <label
                        className="cp-playlist-pane__row keys-sources__row"
                        data-kind={row.kind}
                        style={indent}
                      >
                        {body}
                      </label>
                    ) : (
                      <span
                        className="cp-playlist-pane__row keys-sources__row keys-sources__place"
                        data-kind={row.kind}
                        style={indent}
                      >
                        {body}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {needle !== "" && sections.length === 0 && (
          <p className="keys-note">{nothingMatches(filter.trim())}</p>
        )}
      </div>
    </section>
  );
}

/**
 * Where the Keys page counts (PAGES-16): the whole library, or ticked playlists,
 * Collections and Sets.
 *
 * The Library's own trees, drawn flat with a box on every row that can be counted. A
 * Rekordbox playlist folder counts everything under it; a Collections or Sets folder is only a
 * place, so its box ticks everything under it at once and shows a dash while only some of it is
 * ticked (C40). A Smart Collection holds a question rather than tracks, so it has no box. The
 * Select at the top is the page's "Which tracks" control, the same one Statistics has (C222):
 * it names the choice and takes it back to the whole library. Ticking is `toggleSource`; the
 * page remembers it.
 */
import { useMemo, useRef, useState } from "react";

import { PixelIcon } from "../../components/PixelIcon";
import type { PixelIconName } from "../../components/pixelIcons";
import { SearchField } from "../../components/SearchField";
import { Select } from "../../components/Select";
import { usePageSearch } from "../../components/usePageSearch";
import { formatCount } from "../../format/counts";
import { nothingMatches } from "../../format/words";
import { WHICH_TRACKS } from "../../words";
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
import { folderTick, sameSource, sourcesWords, type PickedSource } from "./keysSources";

interface KeysSourcePickerProps {
  playlists: readonly PlaylistTreeNode[];
  collections: readonly CollectionTreeNode[];
  picked: readonly PickedSource[];
  onToggle: (source: PickedSource) => void;
  /** A Collections or Sets folder's box: everything under it ticked or unticked together. */
  onToggleMany?: (sources: readonly PickedSource[], on: boolean) => void;
  /** Back to the whole library. */
  onClear: () => void;
  /** Tracks in the whole library, written in the Select's first choice when known. */
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
  /** The row's own source; absent for a folder that is only a place. */
  source?: PickedSource;
  /** What a folder holds, in the tree's order: what its box ticks. */
  under: PickedSource[];
}

function matches(label: string, needle: string): boolean {
  return label.toLocaleLowerCase().includes(needle);
}

/** Each row with the sources of the rows nested under it (the rows that follow it and are deeper). */
function withUnder(rows: Omit<Row, "under">[]): Row[] {
  return rows.map((row, index) => {
    const under: PickedSource[] = [];
    for (let next = index + 1; next < rows.length && rows[next]!.depth > row.depth; next += 1) {
      const source = rows[next]!.source;
      if (source) under.push(source);
    }
    return { ...row, under };
  });
}

export function KeysSourcePicker({
  playlists,
  collections,
  picked,
  onToggle,
  onToggleMany,
  onClear,
  libraryTrackCount = null,
}: KeysSourcePickerProps) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLocaleLowerCase();
  const search = useRef<HTMLInputElement>(null);
  // Ctrl+F goes to the search box, only while it is showing (C189).
  const hasSearch = flattenCollections(collections).length > 0 || playlists.length > 0;
  usePageSearch(hasSearch ? search : undefined);

  const sections = useMemo(() => {
    const playlistRows = withUnder(
      flatten(playlists).map((node) => ({
        rowId: `playlist:${node.id}`,
        label: node.name,
        depth: node.depth,
        icon: (node.kind === "folder" ? "folder" : "playlist") as PixelIconName,
        kind: node.kind,
        count: node.kind === "playlist" ? node.track_count : null,
        source: { kind: "playlist", id: node.id } as PickedSource,
      })),
    );
    const collectionRows = withUnder(
      collectionPickerNodes(collections).map((node) => ({
        rowId: `collection:${node.id}`,
        label: node.name,
        depth: node.depth,
        icon: iconForKind(node.kind) as PixelIconName,
        kind: node.kind,
        count: holdsTracks(node) ? node.entry_count : null,
        source: isCollection(node) ? ({ kind: "collection", id: node.id } as PickedSource) : undefined,
      })),
    );
    const setRows = withUnder(
      setPickerNodes(collections).map((node) => ({
        rowId: `set:${node.id}`,
        label: node.name,
        depth: node.depth,
        icon: iconForKind(node.kind) as PixelIconName,
        kind: node.kind,
        count: holdsTracks(node) ? node.entry_count : null,
        source: isSet(node) ? ({ kind: "set", id: node.id } as PickedSource) : undefined,
      })),
    );
    const narrow = (rows: Row[]) =>
      needle === ""
        ? rows
        : rows.filter((row) => (row.source || row.under.length > 0) && matches(row.label, needle));
    return [
      { title: "Playlists", rows: narrow(playlistRows) },
      { title: "Collections", rows: narrow(collectionRows) },
      { title: "Sets", rows: narrow(setRows) },
    ].filter((section) => section.rows.length > 0);
  }, [collections, needle, playlists]);

  const everything = picked.length === 0;
  const any = hasSearch;
  const wholeLabel =
    libraryTrackCount != null ? `All tracks · ${formatCount(libraryTrackCount)}` : "All tracks";

  return (
    <section className="keys-sources" aria-labelledby="keys-sources-title">
      <h2 id="keys-sources-title" className="cp-visually-hidden">
        Sources
      </h2>
      <div className="keys-sources__body" role="group" aria-label="Sources">
        <Select
          label={WHICH_TRACKS}
          inlineLabel
          width="full"
          className="keys-sources__scope"
          value={everything ? "whole" : "ticked"}
          options={[
            { value: "whole", label: wholeLabel },
            { value: "ticked", label: everything ? "Ticked sources" : sourcesWords(picked), disabled: everything },
          ]}
          // The other choice is made by ticking; going back to everything lets go of the ticks.
          onChange={(event) => {
            if (event.target.value === "whole" && !everything) onClear();
          }}
        />

        {any && (
          <SearchField
            ref={search}
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
                  paddingLeft: `calc(var(--space-sm) + ${row.depth} * var(--tree-indent))`,
                } as React.CSSProperties;
                // A row with a source of its own is ticked on its own. A folder that is only a place is
                // ticked by what is under it: all, some (dashed) or none.
                const own = row.source ? picked.some((item) => sameSource(item, row.source!)) : false;
                const tick = folderTick(picked, row.under);
                const checked = row.source ? own : tick === "all";
                const dashed = !checked && tick !== "none";
                const boxed = row.source !== undefined || (row.under.length > 0 && onToggleMany !== undefined);
                const body = (
                  <>
                    {Array.from({ length: row.depth }, (_, level) => (
                      <span
                        key={level}
                        className="cp-playlist-pane__guide"
                        aria-hidden
                        style={{
                          left: `calc(var(--space-sm) + ${level} * var(--tree-indent) + var(--tree-indent) / 2)`,
                        }}
                      />
                    ))}
                    {boxed ? (
                      <input
                        type="checkbox"
                        aria-label={row.label}
                        checked={checked}
                        ref={(box) => {
                          if (box) box.indeterminate = dashed;
                        }}
                        onChange={() => {
                          if (row.source) onToggle(row.source);
                          else onToggleMany?.(row.under, !checked);
                        }}
                      />
                    ) : (
                      <span className="keys-sources__no-box" aria-hidden />
                    )}
                    <PixelIcon name={row.icon} className="cp-playlist-pane__icon" />
                    <span className="cp-playlist-pane__name">{row.label}</span>
                    {row.count != null && (
                      <span className="cp-playlist-pane__count cp-data">{formatCount(row.count)}</span>
                    )}
                  </>
                );
                return (
                  <li key={row.rowId} className="keys-sources__item">
                    {boxed ? (
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

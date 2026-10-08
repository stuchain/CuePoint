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

import { TextField } from "../../components/TextField";
import { flatten, type PlaylistTreeNode } from "../library/playlistTree";
import {
  collectionPickerNodes,
  flattenCollections,
  isCollection,
  isSet,
  setPickerNodes,
  type CollectionTreeNode,
} from "../library/collectionTree";
import { sameSource, type PickedSource } from "./keysSources";

interface KeysSourcePickerProps {
  playlists: readonly PlaylistTreeNode[];
  collections: readonly CollectionTreeNode[];
  picked: readonly PickedSource[];
  onToggle: (source: PickedSource) => void;
  /** Back to the whole library. */
  onClear: () => void;
}

interface Row {
  rowId: string;
  label: string;
  depth: number;
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
}: KeysSourcePickerProps) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLocaleLowerCase();

  const sections = useMemo(() => {
    const playlistRows: Row[] = flatten(playlists).map((node) => ({
      rowId: `playlist:${node.id}`,
      label: node.name,
      depth: node.depth,
      source: { kind: "playlist", id: node.id },
    }));
    const collectionRows: Row[] = collectionPickerNodes(collections).map((node) => ({
      rowId: `collection:${node.id}`,
      label: node.name,
      depth: node.depth,
      source: isCollection(node) ? { kind: "collection", id: node.id } : undefined,
    }));
    const setRows: Row[] = setPickerNodes(collections).map((node) => ({
      rowId: `set:${node.id}`,
      label: node.name,
      depth: node.depth,
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
      <h2 id="keys-sources-title" className="keys-section-title">
        Sources
      </h2>
      <div className="keys-sources__body" role="group" aria-label="Sources">
        <label className="keys-sources__row keys-sources__row--whole">
          <input
            type="checkbox"
            checked={everything}
            // Unticking it with nothing else ticked would leave nothing to count.
            onChange={() => {
              if (!everything) onClear();
            }}
          />
          <span>Whole library</span>
        </label>

        {any && (
          <TextField
            label="Find a source"
            className="keys-sources__filter"
            value={filter}
            placeholder="Find a source"
            onChange={(event) => setFilter(event.target.value)}
          />
        )}

        {sections.map((section) => (
          <div key={section.title} className="keys-sources__section">
            <h3 className="keys-sources__title">{section.title}</h3>
            <ul className="keys-sources__list">
              {section.rows.map((row) => (
                <li
                  key={row.rowId}
                  className="keys-sources__item"
                  style={{ "--keys-depth": row.depth } as React.CSSProperties}
                >
                  {row.source ? (
                    <label className="keys-sources__row">
                      <input
                        type="checkbox"
                        checked={picked.some((item) => sameSource(item, row.source!))}
                        onChange={() => onToggle(row.source!)}
                      />
                      <span>{row.label}</span>
                    </label>
                  ) : (
                    <span className="keys-sources__place">{row.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {needle !== "" && sections.length === 0 && (
          <p className="keys-note">Nothing here is called that.</p>
        )}
      </div>
    </section>
  );
}

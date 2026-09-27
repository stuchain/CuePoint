/**
 * Choosing the artists or labels a run looks for (DISCOVER-10).
 *
 * The Library's own facet over the name field (DISCOVER-03), with how many
 * tracks each name has, so the names a person plays most are the ones at the
 * top. A filter box narrows it, because a library has hundreds of each.
 *
 * When the facet was cut short — the engine sends the most common names, not
 * all of them — the dialog says so, rather than let a missing name read as
 * one the library does not have.
 */
import { useEffect, useMemo, useState } from "react";

import type { DiscoverFacet } from "../../api/cuepointBridge.types";
import { Modal } from "../../components/Modal";
import { TextField } from "../../components/TextField";
import { formatCount, pluralize } from "../library/libraryFormat";

export interface ScopeDialogProps {
  open: boolean;
  /** "artist" or "label", for the wording. */
  noun: string;
  facet: DiscoverFacet;
  chosen: readonly string[];
  onDone: (chosen: string[]) => void;
  onClose: () => void;
}

export function ScopeDialog({ open, noun, facet, chosen, onDone, onClose }: ScopeDialogProps) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(chosen));

  useEffect(() => {
    if (!open) return;
    setText("");
    setPicked(new Set(chosen));
  }, [chosen, open]);

  const names = useMemo(
    () =>
      facet.values
        .filter((value): value is typeof value & { value: string } => value.value !== null)
        .map((value) => ({ name: value.value, label: value.label ?? value.value, count: value.count })),
    [facet.values],
  );
  const needle = text.trim().toLocaleLowerCase();
  const shown = needle
    ? names.filter((entry) => entry.label.toLocaleLowerCase().includes(needle))
    : names;

  const flip = (name: string) =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // In the facet's order — most tracks first — rather than the order clicked.
  const done = () => onDone(names.map((entry) => entry.name).filter((name) => picked.has(name)));

  return (
    <Modal
      open={open}
      title={`Choose ${noun}s`}
      onClose={onClose}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
      primaryAction={{ label: "Done", onClick: done }}
    >
      <div className="discover-dialog">
        <TextField
          label={`Find ${noun}s`}
          id={`discover-scope-${noun}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type to narrow the list"
        />
        <p className="discover-dialog__text" role="status">
          {pluralize(picked.size, `${noun} chosen`, `${noun}s chosen`)}
        </p>
        <ul className="discover-scope" aria-label={`${noun}s in your library`}>
          {shown.map((entry) => (
            <li key={entry.name}>
              <label className="discover-scope__row">
                <input
                  type="checkbox"
                  checked={picked.has(entry.name)}
                  onChange={() => flip(entry.name)}
                />
                <span className="discover-scope__name">{entry.label}</span>
                <span className="discover-scope__count">{formatCount(entry.count)}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="discover-dialog__text">Nothing matches.</li>}
        </ul>
        {facet.truncated && (
          <p className="discover-dialog__text">
            The list holds the {formatCount(names.length)} {noun}s with the most tracks, of{" "}
            {formatCount(facet.total_values)} in your library.
          </p>
        )}
      </div>
    </Modal>
  );
}

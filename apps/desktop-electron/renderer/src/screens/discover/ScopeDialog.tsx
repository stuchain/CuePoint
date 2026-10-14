/**
 * Editing a saved artist or label list: its name and the names in it
 * (DISCOVER-10, New dig).
 *
 * The Library's own facet over the name field (DISCOVER-03), with how many
 * tracks each name has, so the names a person plays most are the ones at the
 * top. A filter box narrows it, because a library has hundreds of each.
 *
 * When the facet was cut short — the engine sends the most common names, not
 * all of them — the dialog says so, rather than let a missing name read as
 * one the library does not have. A name already in the list that the facet no
 * longer carries (cut short, or gone from the library) is still shown, ticked,
 * so saving never drops a name the person did not untick.
 *
 * A list that exists can be deleted here, after asking once; the engine's
 * refusal of a save (a name already used) is shown under the name.
 */
import { useEffect, useMemo, useState } from "react";

import type { DiscoverFacet } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { TextField } from "../../components/TextField";
import { formatCount, pluralize } from "../library/libraryFormat";

interface ScopeDialogProps {
  open: boolean;
  /** "artist" or "label", for the wording. */
  noun: string;
  facet: DiscoverFacet;
  /** The list being edited; null for a new one. */
  list: { id: number; name: string; members: readonly string[] } | null;
  /** The engine's words for why the last save or delete failed. */
  error: string | null;
  /** True while a save or delete is being made. */
  busy: boolean;
  onSave: (name: string, members: string[]) => void;
  onDelete: () => void;
  onClose: () => void;
}

interface Entry {
  name: string;
  label: string;
  count: number | null;
}

export function ScopeDialog({
  open,
  noun,
  facet,
  list,
  error,
  busy,
  onSave,
  onDelete,
  onClose,
}: ScopeDialogProps) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText("");
    setName(list?.name ?? "");
    setPicked(new Set(list?.members ?? []));
    setConfirming(false);
  }, [list, open]);

  const names = useMemo<Entry[]>(() => {
    const entries: Entry[] = facet.values
      .filter((value): value is typeof value & { value: string } => value.value !== null)
      .map((value) => ({ name: value.value, label: value.label ?? value.value, count: value.count }));
    const known = new Set(entries.map((entry) => entry.name));
    for (const member of list?.members ?? []) {
      if (!known.has(member)) entries.push({ name: member, label: member, count: null });
    }
    return entries;
  }, [facet.values, list]);
  const needle = text.trim().toLocaleLowerCase();
  const shown = needle
    ? names.filter((entry) => entry.label.toLocaleLowerCase().includes(needle))
    : names;

  const flip = (member: string) =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(member)) next.delete(member);
      else next.add(member);
      return next;
    });

  // In the facet's order — most tracks first — rather than the order clicked.
  const save = () => onSave(name, names.map((entry) => entry.name).filter((n) => picked.has(n)));
  const blank = name.trim() === "";

  return (
    <Modal
      open={open}
      title={list ? `Edit ${noun} list` : `New ${noun} list`}
      onClose={onClose}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
      primaryAction={{
        label: "Save",
        onClick: save,
        loading: busy,
        disabled: blank,
        disabledReason: blank ? "Give the list a name." : undefined,
      }}
    >
      <div className="discover-dialog">
        <TextField
          label="List name"
          id={`discover-list-name-${noun}`}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        {error && (
          <p className="discover-dialog__refusal" role="alert">
            {error}
          </p>
        )}
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
                {entry.count !== null && (
                  <span className="discover-scope__count">{formatCount(entry.count)}</span>
                )}
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="discover-dialog__text">Nothing matches.</li>}
        </ul>
        {facet.truncated && (
          <p className="discover-dialog__text">
            The list holds the {formatCount(facet.values.length)} {noun}s with the most tracks, of{" "}
            {formatCount(facet.total_values)} in your library.
          </p>
        )}
        {list && !confirming && (
          <div>
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Delete list
            </Button>
          </div>
        )}
        {list && confirming && (
          <div className="discover-dialog__confirm" role="group" aria-label="Delete this list">
            <p className="discover-dialog__text">
              Delete the list “{list.name}”? The {noun}s stay in your library.
            </p>
            <div className="discover-dialog__confirm-actions">
              <Button variant="danger" loading={busy} onClick={onDelete}>
                Delete it
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

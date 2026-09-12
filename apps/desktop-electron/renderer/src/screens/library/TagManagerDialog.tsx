/**
 * The tag vocabulary, tended where it is used (ORG-12).
 *
 * Rename, recolour, categorize, merge, delete — the five things that happen to
 * a vocabulary once it has been in use for a season. It lives beside the filter
 * bar rather than in Settings because a tag is a *browsing* vocabulary: the
 * moment anyone notices "Peak Time" and "Peak-time" are two tags is the moment
 * they are filtering by one of them.
 *
 * A list on the left, one tag's fields on the right. Every tag carries its
 * usage count, which is what makes the two destructive gestures answerable:
 * "delete Peak-time" is a click, and "take Peak-time off 412 tracks" is a
 * decision. Both confirm with the number, and both are recorded per track in
 * the History — a way to find out what happened, not a way to undo it
 * (DEC-008).
 */
import { useEffect, useMemo, useState } from "react";

import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import type { TagUsage } from "../../api/cuepointBridge.types";
import {
  TAG_CATEGORY_MAX_LENGTH,
  TAG_COLOURS,
  TAG_NAME_MAX_LENGTH,
  checkDraft,
  colourLabel,
  colourVariable,
  describeDelete,
  describeMerge,
  draftOf,
  hasChanges,
  sortedTags,
  tagHint,
  tagPatch,
  type TagDraft,
  type TagPatch,
} from "./tagManager";
import "./TagManagerDialog.css";

export interface TagManagerDialogProps {
  open: boolean;
  tags: readonly TagUsage[];
  busy?: boolean;
  /** Why the engine refused the last write. Shown, never swallowed. */
  error?: string | null;
  onSave: (id: number, patch: TagPatch) => void;
  onDelete: (tag: TagUsage) => void;
  onMerge: (source: TagUsage, target: TagUsage) => void;
  onClose: () => void;
}

type Pending =
  | { kind: "delete"; tag: TagUsage }
  | { kind: "merge"; source: TagUsage; target: TagUsage };

export function TagManagerDialog({
  open,
  tags,
  busy = false,
  error = null,
  onSave,
  onDelete,
  onMerge,
  onClose,
}: TagManagerDialogProps) {
  const ordered = useMemo(() => sortedTags(tags), [tags]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TagDraft | null>(null);
  const [mergeInto, setMergeInto] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const selected = ordered.find((tag) => tag.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setDraft(null);
    setMergeInto("");
    setPending(null);
    setProblem(null);
  }, [open]);

  // A tag that was renamed, merged away or deleted takes the editor with it:
  // the list is re-read after every write, so what is on screen is what the
  // engine has rather than what was typed at it.
  useEffect(() => {
    if (selectedId === null) return;
    const still = tags.find((tag) => tag.id === selectedId);
    if (!still) {
      setSelectedId(null);
      setDraft(null);
      setMergeInto("");
      return;
    }
    setDraft(draftOf(still));
  }, [tags, selectedId]);

  const choose = (tag: TagUsage) => {
    setSelectedId(tag.id);
    setDraft(draftOf(tag));
    setMergeInto("");
    setProblem(null);
  };

  const save = () => {
    if (!selected || !draft) return;
    const checked = checkDraft(draft);
    if (!checked.ok) {
      setProblem(checked.reason);
      return;
    }
    const patch = tagPatch(selected, draft);
    if (!hasChanges(patch)) {
      // Nothing to write, said rather than written: an update route that was
      // sent three unchanged columns would still record three history rows.
      setProblem("Nothing has changed.");
      return;
    }
    setProblem(null);
    onSave(selected.id, patch);
  };

  const askMerge = () => {
    const target = ordered.find((tag) => String(tag.id) === mergeInto);
    if (!selected || !target) return;
    setPending({ kind: "merge", source: selected, target });
  };

  const confirm = () => {
    const asked = pending;
    setPending(null);
    if (!asked) return;
    if (asked.kind === "delete") onDelete(asked.tag);
    else onMerge(asked.source, asked.target);
  };

  return (
    <Modal open={open} title="Tags" onClose={onClose}>
      <div className="cp-tag-manager">
        <ul className="cp-tag-manager__list" aria-label="Tags">
          {ordered.length === 0 && (
            <li className="cp-tag-manager__empty">
              No tags yet. Tag a track and it appears here.
            </li>
          )}
          {ordered.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                aria-pressed={tag.id === selectedId}
                className={`cp-tag-manager__row${
                  tag.id === selectedId ? " cp-tag-manager__row--on" : ""
                }`}
                onClick={() => choose(tag)}
              >
                <span
                  className="cp-tag-manager__swatch"
                  style={{ background: colourVariable(tag.colour) ?? "transparent" }}
                />
                <span className="cp-tag-manager__name">{tag.name}</span>
                <span className="cp-tag-manager__hint">{tagHint(tag)}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="cp-tag-manager__editor">
          {!selected || !draft ? (
            <p className="cp-tag-manager__note">Choose a tag to rename or recolour it.</p>
          ) : (
            <>
              <TextField
                label="Name"
                value={draft.name}
                maxLength={TAG_NAME_MAX_LENGTH}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous ? { ...previous, name: event.target.value } : previous,
                  )
                }
              />

              <TextField
                label="Category"
                value={draft.category}
                maxLength={TAG_CATEGORY_MAX_LENGTH}
                placeholder="Energy, Mood, Set position…"
                onChange={(event) =>
                  setDraft((previous) =>
                    previous ? { ...previous, category: event.target.value } : previous,
                  )
                }
              />

              <Select
                label="Colour"
                value={draft.colour ?? ""}
                options={[
                  { value: "", label: colourLabel(null) },
                  ...TAG_COLOURS.map((colour) => ({
                    value: colour,
                    label: colourLabel(colour),
                  })),
                ]}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? { ...previous, colour: event.target.value || null }
                      : previous,
                  )
                }
              />

              <div className="cp-tag-manager__actions">
                <Button onClick={save} disabled={busy}>
                  Save
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => setPending({ kind: "delete", tag: selected })}
                >
                  Delete…
                </Button>
              </div>

              <div className="cp-tag-manager__merge">
                <Select
                  label="Merge into"
                  value={mergeInto}
                  options={[
                    { value: "", label: "Choose a tag…" },
                    ...ordered
                      // Not into itself: the engine refuses it, and offering
                      // it would be offering a mistake.
                      .filter((tag) => tag.id !== selected.id)
                      .map((tag) => ({ value: String(tag.id), label: tag.name })),
                  ]}
                  onChange={(event) => setMergeInto(event.target.value)}
                />
                <Button variant="secondary" disabled={busy || mergeInto === ""} onClick={askMerge}>
                  Merge…
                </Button>
              </div>

              {(problem ?? error) && (
                <p className="cp-tag-manager__problem" role="alert">
                  {problem ?? error}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {pending && (
        <div className="cp-tag-manager__confirm" role="alertdialog" aria-label="Confirm">
          <p>
            {pending.kind === "delete"
              ? describeDelete(pending.tag)
              : describeMerge(pending.source, pending.target)}
          </p>
          <div className="cp-tag-manager__actions">
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm}>
              {pending.kind === "delete" ? "Delete" : "Merge"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

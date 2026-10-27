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
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { deleteLabel, deleteTitle, quoted } from "../../format/words";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import type { TagUsage } from "../../api/cuepointBridge.types";
import { useLastValue } from "../../hooks/useLastValue";
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

interface TagManagerDialogProps {
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
  // One draft per tag, kept while the dialog is open: choosing another tag does not drop what was
  // typed (M257). Only a draft that differs from the tag is kept.
  // `from` is what the tag was when typing began: a tag the engine has since changed takes its draft with it.
  const [drafts, setDrafts] = useState<Record<number, { from: TagDraft; value: TagDraft }>>({});
  const [mergeInto, setMergeInto] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  // The last question stays drawn while its dialog closes, so the title and body do not blank out.
  const shown = useLastValue(pending);
  const [problem, setProblem] = useState<string | null>(null);
  const [askingClose, setAskingClose] = useState(false);

  const selected = ordered.find((tag) => tag.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setDrafts({});
    setMergeInto("");
    setPending(null);
    setProblem(null);
    setAskingClose(false);
  }, [open]);

  // The list is re-read after every write, so what is on screen is what the engine has. A tag that
  // was merged away or deleted takes the editor with it, and a draft the engine now agrees with
  // (it was just saved) is no longer a draft.
  useEffect(() => {
    if (selectedId !== null && !tags.some((tag) => tag.id === selectedId)) {
      setSelectedId(null);
      setMergeInto("");
    }
    setDrafts((previous) => {
      const next: typeof previous = {};
      for (const [key, kept] of Object.entries(previous)) {
        const tag = tags.find((candidate) => candidate.id === Number(key));
        const now = tag ? draftOf(tag) : null;
        const same = now && now.name === kept.from.name && now.category === kept.from.category && now.colour === kept.from.colour;
        if (tag && same && hasChanges(tagPatch(tag, kept.value))) next[Number(key)] = kept;
      }
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
  }, [tags, selectedId]);

  const draft = selected ? (drafts[selected.id]?.value ?? draftOf(selected)) : null;
  const patch = selected && draft ? tagPatch(selected, draft) : null;
  const changed = patch !== null && hasChanges(patch);
  const editDraft = (change: Partial<TagDraft>) => {
    if (!selected || !draft) return;
    setDrafts((previous) => ({
      ...previous,
      [selected.id]: { from: previous[selected.id]?.from ?? draftOf(selected), value: { ...draft, ...change } },
    }));
  };
  // The names of the tags with changes not yet saved, as the engine has them.
  const unsaved = ordered.filter((tag) => drafts[tag.id] && hasChanges(tagPatch(tag, drafts[tag.id]!.value)));

  const choose = (tag: TagUsage) => {
    setSelectedId(tag.id);
    setMergeInto("");
    setProblem(null);
  };

  const requestClose = () => {
    if (unsaved.length > 0) setAskingClose(true);
    else onClose();
  };

  const save = () => {
    if (!selected || !draft || !patch) return;
    const checked = checkDraft(draft);
    if (!checked.ok) {
      setProblem(checked.reason);
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
    <>
    <Modal
      open={open}
      title="Tags"
      onClose={requestClose}
      // Only the × closes it (M254): there is nothing to confirm in an empty list, and with tags the
      // footer is Save and Delete, which apply a change at once.
      noFooter={ordered.length === 0}
      size={ordered.length === 0 ? "small" : "large"}
      primaryAction={
        ordered.length === 0
          ? undefined
          : {
              label: "Save",
              onClick: save,
              disabled: busy || !changed,
              disabledReason: selected ? (changed ? undefined : "Nothing has changed.") : "Choose a tag to change it.",
            }
      }
      // Delete has one home, the footer's far left, in red (M250).
      extraAction={
        selected
          ? { label: `${deleteLabel("tag")}…`, danger: true, disabled: busy, onClick: () => setPending({ kind: "delete", tag: selected }) }
          : undefined
      }
    >
      {ordered.length === 0 ? (
        <EmptyState
          icon="tag"
          headline="No tags yet"
          description="Tag a track under Yours in Track details and it appears here."
        />
      ) : (
      <div className="cp-tag-manager">
        <ul className="cp-tag-manager__list" aria-label="Tags">
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
                <span className="cp-tag-manager__name" data-cut-hint="">
                  {tag.name}
                </span>
                <span className="cp-tag-manager__hint">{tagHint(tag)}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="cp-tag-manager__editor">
          {!selected || !draft ? (
            <p className="cp-tag-manager__note">Choose a tag to rename or recolor it.</p>
          ) : (
            <>
              <TextField
                label="Name"
                value={draft.name}
                maxLength={TAG_NAME_MAX_LENGTH}
                onChange={(event) => editDraft({ name: event.target.value })}
              />

              <TextField
                label="Category"
                value={draft.category}
                maxLength={TAG_CATEGORY_MAX_LENGTH}
                placeholder="Energy, Mood, Set position"
                onChange={(event) => editDraft({ category: event.target.value })}
              />

              <Select
                label="Color"
                value={draft.colour ?? ""}
                options={[
                  { value: "", label: colourLabel(null) },
                  ...TAG_COLOURS.map((colour) => ({
                    value: colour,
                    label: colourLabel(colour),
                  })),
                ]}
                onChange={(event) => editDraft({ colour: event.target.value || null })}
              />

              <div className="cp-tag-manager__merge">
                <Select
                  label="Merge into"
                  value={mergeInto}
                  options={[
                    { value: "", label: "Choose a tag" },
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
                <Notice kind="danger">{problem ?? error}</Notice>
              )}
            </>
          )}
        </div>
      </div>
      )}

    </Modal>
    <ConfirmDialog
      open={askingClose}
      title={unsaved.length === 1 ? `Discard changes to ${quoted(unsaved[0]!.name)}?` : "Discard unsaved changes?"}
      confirmLabel="Discard changes"
      onConfirm={() => {
        setAskingClose(false);
        onClose();
      }}
      onCancel={() => setAskingClose(false)}
    >
      {unsaved.length === 1
        ? "Its changes are not saved. Cancel and choose Save to keep them."
        : `${unsaved.length} tags have changes that are not saved. Cancel and choose Save on each to keep them.`}
    </ConfirmDialog>
    {/* Delete is a red fill; a merge moves tracks and is a plain one (C16). */}
    <ConfirmDialog
      open={pending?.kind === "delete"}
      title={shown?.kind === "delete" ? deleteTitle("tag", shown.tag.name) : "Delete tag?"}
      danger
      confirmLabel={deleteLabel("tag")}
      onConfirm={confirm}
      onCancel={() => setPending(null)}
    >
      {shown?.kind === "delete" ? describeDelete(shown.tag) : ""}
    </ConfirmDialog>
    <ConfirmDialog
      open={pending?.kind === "merge"}
      title={
        shown?.kind === "merge"
          ? `Merge ${quoted(shown.source.name)} into ${quoted(shown.target.name)}?`
          : "Merge tags?"
      }
      confirmLabel="Merge tags"
      onConfirm={confirm}
      onCancel={() => setPending(null)}
    >
      {shown?.kind === "merge" ? describeMerge(shown.source, shown.target) : ""}
    </ConfirmDialog>
    </>
  );
}

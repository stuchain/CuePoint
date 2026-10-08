/**
 * Your key, BPM, genre, label and year, edited in the one editor (INS-4, DEC-205).
 *
 * The five boxes that used to sit in "Yours" are gone: **Edit values…** opens
 * the dialog Clean's Fix values uses, for this track, with what each value is
 * now. What has been edited is listed here, folded until there is something
 * to list, and each can go back: to Rekordbox's value, or for the key to
 * Beatport's key or to none, since Rekordbox's key is not the track's (DEC-201).
 */
import { useState } from "react";

import type { LibraryTrackRow, OverrideField } from "../../api/cuepointBridge.types";
import { APPLY_FIELD_LABELS } from "../clean/comparison";
import { DisclosureSection } from "./DisclosureSection";
import { EditValuesDialog } from "./EditValuesDialog";
import type { OverrideEdit } from "./libraryBatch";
import { effectiveText, overrideSourceText } from "./libraryClean";
import { EDIT_FIELDS } from "./metadataEdits";
import { reportUnexpected } from "../../reporting/reporting";

interface TrackEditedValuesProps {
  track: LibraryTrackRow & { id: number };
  /** Beatport's key for this track, when its match has one (the key's "go back"). */
  beatportKey?: string | null;
  /** After the engine accepted a change. */
  onSaved: () => void;
  onError: (message: string) => void;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function fieldWord(field: OverrideField): string {
  return field === "bpm" ? "BPM" : APPLY_FIELD_LABELS[field];
}

/** The fields CuePoint holds a value of its own for; a key Beatport gave is not an edit. */
function editedFields(track: LibraryTrackRow): OverrideField[] {
  return EDIT_FIELDS.filter((field) => {
    if (!track.overridden?.includes(field)) return false;
    return !(field === "key" && (track.key_source === "beatport" || track.override_sources?.key === "beatport"));
  });
}

/** What "go back" says for a field. */
function goBackLabel(field: OverrideField, beatportKey: string | null | undefined): string {
  if (field === "key") return beatportKey ? "Go back to Beatport's key" : "Go back to no key";
  return `Go back to Rekordbox's ${fieldWord(field)}`;
}

export function TrackEditedValues({ track, beatportKey, onSaved, onError }: TrackEditedValuesProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<OverrideField | null>(null);
  const edited = editedFields(track);
  const bridge = window.cuepoint?.setTrackOverrides;

  const save = async (edit: OverrideEdit): Promise<string | null> => {
    if (!bridge) return "Editing values is not available in this window.";
    try {
      await bridge({ trackId: track.id, [edit.field]: edit.value });
    } catch (cause) {
      reportUnexpected(cause);
      return messageOf(cause);
    }
    onSaved();
    return null;
  };

  const goBack = async (field: OverrideField) => {
    setBusy(field);
    const refusal = await save({ field, value: null });
    setBusy(null);
    if (refusal !== null) onError(refusal);
  };

  if (!bridge) return null;

  const current = Object.fromEntries(
    EDIT_FIELDS.map((field) => [field, effectiveText(track, field)]),
  ) as Record<OverrideField, string>;

  return (
    <div className="cp-track-values">
      <p className="cp-track-values__lead">
        Change this track&rsquo;s key, BPM, genre, label or year in CuePoint. Rekordbox&rsquo;s value is
        kept, and you can go back to it. For the key, going back returns to Beatport&rsquo;s key, or to none.
      </p>
      <button type="button" className="cp-track-values__edit" onClick={() => setEditing(true)}>
        Edit values…
      </button>
      {/* A track's own state: it opens itself when a value is edited, and
          nothing is remembered about it. */}
      <DisclosureSection
        id="your-values"
        title="Your values"
        summary={edited.length === 0 ? "none edited" : `${edited.length} edited`}
        defaultOpen={edited.length > 0}
        remember={false}
        level={4}
        // Remounts when the track gains or loses an edited value, so the
        // disclosure opens on its own and not only on the first look.
        key={edited.length > 0 ? "edited" : "none"}
      >
        {edited.length === 0 ? (
          <p className="cp-track-yours__source">Nothing edited. Every value is Rekordbox&rsquo;s or Beatport&rsquo;s.</p>
        ) : (
          <ul className="cp-track-values__list">
            {edited.map((field) => (
              <li key={field} className="cp-track-values__item">
                <span className="cp-track-values__field">{fieldWord(field)}</span>
                <span className="cp-track-values__value">{current[field] || "none"}</span>
                <span className="cp-track-yours__source">
                  {overrideSourceText(track.override_sources?.[field])}
                </span>
                <button
                  type="button"
                  className="cp-track-yours__clear"
                  disabled={busy !== null}
                  onClick={() => void goBack(field)}
                >
                  {goBackLabel(field, beatportKey)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DisclosureSection>
      <EditValuesDialog
        open={editing}
        count={1}
        current={current}
        onClose={() => setEditing(false)}
        onEdit={save}
      />
    </div>
  );
}

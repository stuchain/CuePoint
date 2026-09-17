/**
 * Your key, BPM, genre, label and year, typed by hand (CLEAN-13, DEC-069).
 *
 * Part of the "Yours" zone: CuePoint's layer over what Rekordbox sent, never a
 * change to it. A field shows your value when you have one, and Rekordbox's as
 * its placeholder when you do not. Enter or leaving the field saves; empty
 * clears yours and Rekordbox's shows again. The engine checks every value, and
 * its refusal is shown under the field in its own words.
 */
import { useEffect, useId, useRef, useState } from "react";

import type { LibraryTrackRow, OverrideField } from "../../api/cuepointBridge.types";
import { APPLY_FIELD_LABELS } from "../clean/comparison";
import { effectiveText, importedText, overrideSourceText } from "./libraryClean";
import { EDIT_FIELDS, parseFieldText } from "./metadataEdits";

export interface TrackOverridesProps {
  track: LibraryTrackRow & { id: number };
  /** After the engine accepted a value. */
  onSaved: () => void;
}

/** What the field holds when nobody is typing: your value, or nothing. */
function ownText(track: LibraryTrackRow, field: OverrideField): string {
  return track.overridden?.includes(field) ? effectiveText(track, field) : "";
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function TrackOverrides({ track, onSaved }: TrackOverridesProps) {
  const [drafts, setDrafts] = useState<Partial<Record<OverrideField, string>>>({});
  const [problems, setProblems] = useState<Partial<Record<OverrideField, string>>>({});
  const [saving, setSaving] = useState<OverrideField | null>(null);
  const baseId = useId();
  // Enter saves, and the field losing focus while it is disabled would save
  // the same text again; one save per field at a time.
  const inFlight = useRef<OverrideField | null>(null);

  // A saved value stays as typed until the track is read again, and the read
  // replaces it — so the field never flickers back to what it held before.
  // Only the fields whose value changed: a read that lands while another
  // field is being typed into must not take that typing away.
  const held = EDIT_FIELDS.map((field) => ownText(track, field)).join("\u0000");
  const seen = useRef(held);
  useEffect(() => {
    const before = seen.current.split("\u0000");
    seen.current = held;
    const now = held.split("\u0000");
    const changed = EDIT_FIELDS.filter((_, index) => before[index] !== now[index]);
    if (changed.length === 0) return;
    setDrafts((previous) => {
      const next = { ...previous };
      for (const field of changed) delete next[field];
      return next;
    });
  }, [held]);

  const save = async (field: OverrideField, text: string) => {
    const bridge = window.cuepoint?.setTrackOverrides;
    if (!bridge || inFlight.current === field) return;
    const unchanged = text.trim() === ownText(track, field).trim();
    if (unchanged) {
      setDrafts((previous) => ({ ...previous, [field]: undefined }));
      setProblems((previous) => ({ ...previous, [field]: undefined }));
      return;
    }
    const parsed = parseFieldText(field, text);
    if (!parsed.ok) {
      setProblems((previous) => ({ ...previous, [field]: parsed.reason }));
      return;
    }
    inFlight.current = field;
    setSaving(field);
    try {
      await bridge({ trackId: track.id, [field]: parsed.value });
      setProblems((previous) => ({ ...previous, [field]: undefined }));
      onSaved();
    } catch (cause) {
      setProblems((previous) => ({ ...previous, [field]: messageOf(cause) }));
    } finally {
      inFlight.current = null;
      setSaving(null);
    }
  };

  return (
    <div className="cp-track-overrides" role="group" aria-label="Your values">
      {EDIT_FIELDS.map((field) => {
        const id = `${baseId}-${field}`;
        const label = `Your ${field === "bpm" ? "BPM" : APPLY_FIELD_LABELS[field].toLowerCase()}`;
        const mine = track.overridden?.includes(field) ?? false;
        const value = drafts[field] ?? ownText(track, field);
        const imported = importedText(track, field);
        const problem = problems[field];
        return (
          <div key={field} className="cp-track-overrides__field">
            <label className="cp-track-yours__label" htmlFor={id}>
              {label}
            </label>
            <div className="cp-track-overrides__control">
              <input
                id={id}
                className="cp-track-yours__tag-input"
                value={value}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? `${id}-problem` : undefined}
                inputMode={field === "bpm" || field === "year" ? "decimal" : undefined}
                placeholder={imported === "" ? "Rekordbox has none" : `Rekordbox: ${imported}`}
                disabled={saving === field}
                onChange={(event) =>
                  setDrafts((previous) => ({ ...previous, [field]: event.target.value }))
                }
                onBlur={(event) => {
                  if (drafts[field] !== undefined) void save(field, event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void save(field, (event.target as HTMLInputElement).value);
                  } else if (event.key === "Escape" && drafts[field] !== undefined) {
                    // Escape takes back the typing; a second one reaches the page.
                    event.stopPropagation();
                    setDrafts((previous) => ({ ...previous, [field]: undefined }));
                    setProblems((previous) => ({ ...previous, [field]: undefined }));
                  }
                }}
              />
              {mine && (
                <button
                  type="button"
                  className="cp-track-yours__clear"
                  aria-label={`Clear ${label.toLowerCase()}`}
                  disabled={saving === field}
                  onClick={() => void save(field, "")}
                >
                  Clear
                </button>
              )}
            </div>
            {mine && (
              <p className="cp-track-yours__source">
                {overrideSourceText(track.override_sources?.[field])}
              </p>
            )}
            {problem && (
              <p id={`${id}-problem`} className="cp-track-overrides__problem" role="alert">
                {problem}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

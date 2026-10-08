/**
 * "Edit values…" over a selection (CLEAN-13, DEC-069, PAGES-07B).
 *
 * The one editor for your values: Clean's Fix values opens it for many tracks
 * and the Library's menu for its selection, and Track details can for one
 * (DEC-205). Above 1,000 tracks it asks first, with the number (LIB-11).
 *
 * Five fields, each left as it is, set, or cleared back to Rekordbox's value.
 * The edits go through the batch path (DEC-063), one batch per field, so each
 * is recorded, counted and revertable on its own. The engine checks every value
 * before it touches a track, and its refusal is shown beside the field it
 * names; fields already applied stay applied and say so.
 */
import { useEffect, useState } from "react";

import type { OverrideField } from "../../api/cuepointBridge.types";
import { Modal } from "../../components";
import { APPLY_FIELD_LABELS } from "../clean/comparison";
import { BATCH_JOB_THRESHOLD, BATCH_RECORDED_NOTE, type OverrideEdit } from "./libraryBatch";
import {
  EDIT_FIELDS,
  editsFromDraft,
  emptyEditDraft,
  refusedField,
  type EditDraft,
  type EditMode,
} from "./metadataEdits";
import "./cleanDialogs.css";

interface EditValuesDialogProps {
  open: boolean;
  /** How many tracks the edit applies to. */
  count: number;
  onClose: () => void;
  /**
   * Run one field's edit. Resolves to null when the engine accepted it, or to
   * its refusal in its own words.
   */
  onEdit: (edit: OverrideEdit) => Promise<string | null>;
  /**
   * The track's values as they are now, for an edit of one track (Track
   * details). A field with none reads "none". Left out, nothing is shown.
   */
  current?: Partial<Record<OverrideField, string | null>>;
}

const MODES: Array<{ value: EditMode; label: string }> = [
  { value: "keep", label: "Leave as it is" },
  { value: "set", label: "Set to" },
  { value: "clear", label: "Clear mine" },
];

export function EditValuesDialog({ open, count, onClose, onEdit, current }: EditValuesDialogProps) {
  const [draft, setDraft] = useState<EditDraft>(emptyEditDraft);
  const [problems, setProblems] = useState<Partial<Record<OverrideField, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A big batch is asked about once, with its number, before it runs (LIB-11).
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAsking(false);
    setDraft(emptyEditDraft());
    setProblems({});
    setGeneral(null);
  }, [open]);

  const change = (field: OverrideField, patch: Partial<EditDraft[OverrideField]>) => {
    setAsking(false);
    setDraft((previous) => ({ ...previous, [field]: { ...previous[field], ...patch } }));
    setProblems((previous) => ({ ...previous, [field]: undefined }));
  };

  const save = async () => {
    const built = editsFromDraft(draft);
    if (!built.ok) {
      setProblems({ [built.field]: built.reason });
      return;
    }
    if (built.edits.length === 0) {
      setGeneral("Choose at least one field to set or clear.");
      return;
    }
    if (count > BATCH_JOB_THRESHOLD && !asking) {
      setAsking(true);
      return;
    }
    setSaving(true);
    setGeneral(null);
    const done: OverrideField[] = [];
    for (const edit of built.edits) {
      const refusal = await onEdit(edit);
      if (refusal !== null) {
        setSaving(false);
        const field = refusedField(refusal) ?? edit.field;
        setProblems({ [field]: refusal });
        // What went through stays through, and the form stops offering it.
        if (done.length > 0) {
          setDraft((previous) => {
            const next = { ...previous };
            for (const name of done) next[name] = { mode: "keep", text: "" };
            return next;
          });
          setGeneral(
            `${done.map((name) => APPLY_FIELD_LABELS[name]).join(", ")} ${
              done.length === 1 ? "was" : "were"
            } already changed.`,
          );
        }
        return;
      }
      done.push(edit.field);
    }
    setSaving(false);
    onClose();
  };

  const many = `${count.toLocaleString()} ${count === 1 ? "track" : "tracks"}`;

  return (
    <Modal
      open={open}
      title="Edit values"
      onClose={onClose}
      primaryAction={{
        label: asking ? `Change ${many}` : "Apply",
        onClick: () => void save(),
        loading: saving,
      }}
      secondaryAction={
        asking
          ? { label: "Back", onClick: () => setAsking(false) }
          : { label: "Cancel", onClick: onClose }
      }
    >
      <div className="clean-dialog">
        <p className="clean-dialog__lead">
          Your values for {many}. They cover what Rekordbox sent without changing it, and
          clearing one shows Rekordbox&rsquo;s again. Every change is recorded and can be
          reverted.
        </p>
        {asking && (
          <div role="alert">
            <p className="clean-dialog__headline">{`Change ${many}?`}</p>
            <p className="clean-dialog__lead">
              {BATCH_RECORDED_NOTE}
            </p>
          </div>
        )}
        <div className="clean-dialog__fields">
          {EDIT_FIELDS.map((field) => {
            const entry = draft[field];
            const label = APPLY_FIELD_LABELS[field];
            const problem = problems[field];
            return (
              <div key={field} className="clean-dialog__field">
                <label className="clean-dialog__label" htmlFor={`edit-${field}-mode`}>
                  {label}
                </label>
                <select
                  id={`edit-${field}-mode`}
                  className="clean-dialog__select"
                  value={entry.mode}
                  onChange={(event) => change(field, { mode: event.target.value as EditMode })}
                >
                  {MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <input
                  className="clean-dialog__input"
                  aria-label={`${label} value`}
                  aria-invalid={problem ? true : undefined}
                  // Typing chooses "Set to"; only clearing leaves nothing to type.
                  disabled={entry.mode === "clear"}
                  value={entry.text}
                  inputMode={field === "bpm" || field === "year" ? "decimal" : undefined}
                  placeholder={field === "key" ? "8A, Am or Amin" : undefined}
                  onChange={(event) =>
                    change(field, {
                      text: event.target.value,
                      // Typing chooses "Set to", and emptying the box again
                      // takes the choice back rather than asking for a value.
                      mode: event.target.value.trim() === "" ? "keep" : "set",
                    })
                  }
                />
                {current && (
                  <p className="clean-dialog__hint">
                    {`Now: ${current[field] || "none"}`}
                  </p>
                )}
                {problem && (
                  <p className="clean-dialog__problem" role="alert">
                    {problem}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {general && (
          <p className="clean-dialog__note" role="status">
            {general}
          </p>
        )}
      </div>
    </Modal>
  );
}

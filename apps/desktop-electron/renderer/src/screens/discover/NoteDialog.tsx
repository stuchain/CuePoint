/**
 * A wantlist entry's note (DISCOVER-10, DEC-093).
 *
 * Why a track was wanted — "for the Friday warm-up", "ask the shop" — kept
 * beside it. Saving blank text clears the note, as the engine takes it. The
 * engine's refusal, a note too long, is shown in its words and the text kept.
 */
import { useEffect, useState } from "react";

import type { DiscoverRefusal } from "../../api/cuepointBridge.types";
import { Modal } from "../../components/Modal";
import { refusalText } from "./discoverFormat";

interface NoteDialogProps {
  open: boolean;
  /** The track, as the table names it. */
  track: string;
  note: string | null;
  maxLength: number;
  onSave: (note: string | null) => Promise<DiscoverRefusal | null>;
  onClose: () => void;
}

export function NoteDialog({ open, track, note, maxLength, onSave, onClose }: NoteDialogProps) {
  const [text, setText] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(note ?? "");
    setRefusal(null);
    setSaving(false);
  }, [note, open]);

  const tooLong = text.trim().length > maxLength;

  const save = async () => {
    setSaving(true);
    setRefusal(null);
    try {
      const refused = await onSave(text.trim() === "" ? null : text.trim());
      if (refused) setRefusal(refusalText(refused));
    } catch (cause) {
      setRefusal(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Wantlist note"
      onClose={onClose}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
      primaryAction={{
        label: "Save note",
        onClick: () => void save(),
        loading: saving,
        disabled: tooLong,
      }}
    >
      <div className="discover-dialog">
        <p className="discover-dialog__text">{track}</p>
        <div className="discover-dialog__field">
          <label className="cp-field__label" htmlFor="discover-note">
            Note
          </label>
          <textarea
            id="discover-note"
            className="cp-field__input discover-dialog__textarea"
            value={text}
            rows={4}
            aria-describedby="discover-note-hint"
            aria-invalid={tooLong}
            onChange={(event) => setText(event.target.value)}
          />
          <span id="discover-note-hint" className={tooLong ? "cp-field__error" : "cp-field__hint"}>
            {tooLong
              ? `A note is at most ${maxLength} characters.`
              : "Leave it empty to clear the note."}
          </span>
        </div>
        {refusal && (
          <p className="discover-dialog__refusal" role="alert">
            {refusal}
          </p>
        )}
      </div>
    </Modal>
  );
}

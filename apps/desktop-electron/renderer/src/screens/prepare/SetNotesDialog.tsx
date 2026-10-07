/**
 * A Set's own notes (PREP-03's `set_notes`, wired in PREP-12).
 *
 * Where the night is written down: the venue, the set times, what was played
 * last time. The phase keeps no record of a Set being performed, and says a
 * Set's notes are where a user records anything they want to (the phase's
 * deferred list), so they need somewhere to be typed. A dialog opened from the
 * header's facts line, as a chapter's notes are, because the page's height is
 * rows (DEC-112). Blank clears them; the engine trims and bounds them.
 */
import { useEffect, useId, useState } from "react";

import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { notesToSend } from "./prepareFormat";
import "./prepare.css";

interface SetNotesDialogProps {
  /** The Set, or null when the dialog is closed. */
  set: { name: string; notes: string | null } | null;
  /** Why the engine refused the last attempt, in its words. */
  error?: string | null;
  onSave: (notes: string | null) => void;
  onClose: () => void;
}

export function SetNotesDialog({ set, error = null, onSave, onClose }: SetNotesDialogProps) {
  const [notes, setNotes] = useState("");
  const id = useId();

  useEffect(() => {
    if (set) setNotes(set.notes ?? "");
  }, [set]);

  return (
    <Modal open={set !== null} title={set ? `Notes for “${set.name}”` : "Notes"} onClose={onClose}>
      <div className="prepare-dialog">
        <label className="prepare-dialog__notes" htmlFor={`${id}-notes`}>
          <span className="cp-field__label">Notes</span>
          <textarea
            id={`${id}-notes`}
            rows={6}
            value={notes}
            placeholder="The venue, the set times, what went down well last time"
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        {error && (
          <p className="prepare-dialog__problem" role="alert">
            {error}
          </p>
        )}

        <div className="prepare-dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(notesToSend(notes))}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

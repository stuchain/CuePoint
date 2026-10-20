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

import { Modal } from "../../components/Modal";
import { focusById } from "../../components/NameFolderDialog";
import { Notice } from "../../components/Notice";
import { Textarea } from "../../components/Textarea";
import { notesToSend } from "./prepareFormat";
import "./prepare.css";

interface SetNotesDialogProps {
  /** The Set, or null when the dialog is closed. */
  set: { name: string; notes: string | null } | null;
  /** Why the engine refused the last attempt, in its words. */
  error?: string | null;
  /** Changes with every refusal, so the same words coming back shake again. */
  errorKey?: number;
  onSave: (notes: string | null) => void;
  onClose: () => void;
}

export function SetNotesDialog({ set, error = null, errorKey = 0, onSave, onClose }: SetNotesDialogProps) {
  const [notes, setNotes] = useState("");
  const id = useId();

  // Loaded when the dialog opens (or the saved notes change), not on every render: the
  // parent passes a fresh object each time, and a redraw mid-typing must keep the text.
  const open = set !== null;
  const saved = set?.notes ?? "";
  useEffect(() => {
    if (open) setNotes(saved);
  }, [open, saved]);

  return (
    <Modal open={set !== null} title={set ? `Notes for “${set.name}”` : "Notes"} onClose={onClose}
      initialFocus={focusById(`${id}-notes`)}
      primaryAction={{ label: "Save", onClick: () => onSave(notesToSend(notes)) }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="prepare-dialog">
        <Textarea
          id={`${id}-notes`}
          label="Notes"
          rows={6}
          value={notes}
          placeholder="The venue, the set times, what went down well last time"
          onChange={(event) => setNotes(event.target.value)}
        />

        {error && (
          <Notice key={errorKey} kind="field-error">
            {error}
          </Notice>
        )}
      </div>
    </Modal>
  );
}

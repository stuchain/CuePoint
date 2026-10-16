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
import { Notice } from "../../components/Notice";
import { Textarea } from "../../components/Textarea";
import { refusalText } from "./discoverFormat";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

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
      reportUnexpected(cause);
      setRefusal(userMessage(cause));
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
        <p className="discover-dialog__text cp-modal__lead">{track}</p>
        <Textarea
          id="discover-note"
          label="Note"
          rows={4}
          value={text}
          hint="Leave it empty to clear the note."
          error={tooLong ? `A note is at most ${maxLength} characters.` : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        {refusal && <Notice>{refusal}</Notice>}
      </div>
    </Modal>
  );
}

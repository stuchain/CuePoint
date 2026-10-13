/**
 * A chapter's name, targets and notes, in one dialog (PREP-10, DEC-103).
 *
 * One form and one write: `sets.updateChapter` changes them together or not
 * at all (PREP-08), so a target the engine refuses leaves the name as it was
 * too, and the dialog stays open with the engine's reason. The target is typed
 * as a DJ writes a time, "45:00" or "1:30:00", and read by the engine (DEC-107);
 * a blank field clears it.
 */
import { useEffect, useId, useRef, useState } from "react";

import type { SetChapterPlan, SetChapterUpdate } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { TextField } from "../../components/TextField";
import { CHAPTER_NAME_MAX_LENGTH, chapterUpdate, readBpm } from "./chapterForm";
import { chapterName } from "./prepareRows";
import { formatTime } from "./setTime";
import "./prepare.css";

/** What a chapter is, before the fields that set it (PRP-11). */
const CHAPTER_LEAD =
  "A chapter is a part of the Set — warm-up, peak, closing — with its own target length and tempo range.";

interface ChapterDialogProps {
  /** The chapter, or null when the dialog is closed. */
  chapter: SetChapterPlan | null;
  busy?: boolean;
  /** Why the engine refused the last attempt, in its words. */
  error?: string | null;
  /** Changes with every refusal, so the same words coming back shake again. */
  errorKey?: number;
  onSave: (update: SetChapterUpdate) => void;
  onClose: () => void;
  /** Where the chapter stands in the Set (DEC-103): the first cannot go up, the last down. */
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** A Set always has one chapter, so the only one cannot be deleted. */
  canDelete?: boolean;
  onMove?: (delta: -1 | 1) => void;
  /** Asks to delete the chapter; the page says where its entries go before it is done. */
  onDelete?: () => void;
}

export function ChapterDialog({
  chapter,
  busy = false,
  error = null,
  errorKey = 0,
  onSave,
  onClose,
  canMoveUp = false,
  canMoveDown = false,
  canDelete = false,
  onMove,
  onDelete,
}: ChapterDialogProps) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [notes, setNotes] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
    if (!chapter) return;
    setName(chapter.name);
    setTarget(chapter.target_seconds == null ? "" : formatTime(chapter.target_seconds));
    setBpmMin(chapter.bpm_min == null ? "" : String(chapter.bpm_min));
    setBpmMax(chapter.bpm_max == null ? "" : String(chapter.bpm_max));
    setNotes(chapter.notes ?? "");
    setProblem(null);
    // Keyed on the chapter's id: a move changes the chapter under the dialog, and what was typed stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);

  // A move can leave the button just pressed with nowhere to go (the chapter is now first or last):
  // focus goes to the other one, or to the name, rather than to a disabled button.
  const moves = useRef<HTMLDivElement>(null);
  const lastMove = useRef<number | null>(null);
  useEffect(() => {
    const buttons = Array.from(moves.current?.querySelectorAll("button") ?? []);
    const at = lastMove.current;
    if (at === null || (at === 0 ? canMoveUp : canMoveDown)) return;
    const active = document.activeElement;
    if (active !== buttons[at] && active !== document.body) return;
    const other = buttons[1 - at];
    if (other && !other.disabled) other.focus();
    else document.getElementById(`${ids}-name`)?.focus();
  }, [canMoveUp, canMoveDown, ids]);

  const submit = () => {
    if (!chapter) return;
    const low = readBpm(bpmMin);
    const high = readBpm(bpmMax);
    if (!low.ok || !high.ok) {
      setProblem("A BPM is a number above zero, or blank for no limit.");
      return;
    }
    setProblem(null);
    onSave(chapterUpdate(chapter.id, { name, target, bpmMin: low.value, bpmMax: high.value, notes }));
  };

  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Modal
      open={chapter !== null}
      title={chapter ? `Chapter “${chapterName(chapter)}”` : "Chapter"}
      onClose={onClose}
    >
      <div className="prepare-dialog">
        <p className="prepare-note">{CHAPTER_LEAD}</p>
        <TextField
          id={`${ids}-name`}
          label="Name"
          value={name}
          maxLength={CHAPTER_NAME_MAX_LENGTH}
          placeholder={chapter ? `Chapter ${chapter.position + 1}` : ""}
          hint="Blank leaves the chapter unnamed."
          onChange={(event) => setName(event.target.value)}
          onKeyDown={onEnter}
        />
        <TextField
          id={`${ids}-target`}
          label="Target length"
          value={target}
          placeholder="45:00"
          hint="As m:ss or h:mm:ss. Blank for none."
          onChange={(event) => setTarget(event.target.value)}
          onKeyDown={onEnter}
        />
        <div className="prepare-dialog__pair">
          <TextField
            id={`${ids}-bpm-min`}
            label="Lowest BPM"
            inputMode="decimal"
            value={bpmMin}
            onChange={(event) => setBpmMin(event.target.value)}
            onKeyDown={onEnter}
          />
          <TextField
            id={`${ids}-bpm-max`}
            label="Highest BPM"
            inputMode="decimal"
            value={bpmMax}
            onChange={(event) => setBpmMax(event.target.value)}
            onKeyDown={onEnter}
          />
        </div>
        <label className="prepare-dialog__notes" htmlFor={`${ids}-notes`}>
          <span className="cp-field__label">Notes</span>
          <textarea
            id={`${ids}-notes`}
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        {(problem ?? error) && (
          <p key={problem ?? errorKey} className="prepare-dialog__problem" role="alert">
            {problem ?? error}
          </p>
        )}

        <div className="prepare-dialog__actions">
          {/* The chapter's place and its deletion, at the left; they act at once, apart from the form. */}
          <div className="prepare-dialog__actions-start" ref={moves}
            onFocus={(event) => {
              const buttons = Array.from(moves.current?.querySelectorAll("button") ?? []);
              const at = buttons.findIndex((button) => button.contains(event.target as Node));
              lastMove.current = at === 0 || at === 1 ? at : null;
            }}
          >
            <Button variant="secondary" disabled={!canMoveUp} onClick={() => onMove?.(-1)}>
              Move up
            </Button>
            <Button variant="secondary" disabled={!canMoveDown} onClick={() => onMove?.(1)}>
              Move down
            </Button>
            <Button variant="secondary" disabled={!canDelete} onClick={() => onDelete?.()}>
              Delete chapter…
            </Button>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * "In this Set": an entry's plan, in the Inspector (PREP-10, DEC-107, DEC-106).
 *
 * Drawn above "Yours" when an entry is selected, because it is about the entry
 * rather than the track: the same track twice in a Set is planned twice. Its
 * in and out times, its note, its chapter, and what the checks found about it
 * and about the change into it, each transition warning with "Accept" (PRP-5).
 * Kept in the Inspector so the Set pane's height stays for rows (DEC-112).
 *
 * The times are typed as a DJ writes them and saved together, as the engine
 * takes them, when the field is left or Enter is pressed. A time the engine
 * refuses stays in the field, marked, with the engine's reason said; nothing
 * about the entry changes until it reads.
 */
import { useEffect, useId, useState } from "react";

import type { SetChapterPlan, SetWarning } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { NOTES_MAX_LENGTH } from "../library/trackEdits";
import { chapterName, type EntryRow } from "./prepareRows";
import { timeCell } from "./prepareFormat";
import { describeSetNotice, describeSetWarning, isAcknowledgeable } from "./setWarnings";

interface SetEntryZoneProps {
  row: EntryRow;
  chapters: readonly SetChapterPlan[];
  /** Saves both times; answers whether the engine took them. */
  onSaveTimes: (inTime: string | null, outTime: string | null) => Promise<boolean>;
  onSaveNote: (note: string | null) => Promise<boolean>;
  onMoveToChapter: (chapterId: number) => void;
  /** Accept a transition warning into this entry, or withdraw the acceptance. */
  onAcknowledge: (warning: SetWarning, acknowledge: boolean) => void;
}

/** What accepting a warning means, once above the list (PRP-5). */
const ACCEPT_HINT = "Accept a warning once you have heard the mix work. It comes back if either track changes.";

function blankToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

export function SetEntryZone({
  row,
  chapters,
  onSaveTimes,
  onSaveNote,
  onMoveToChapter,
  onAcknowledge,
}: SetEntryZoneProps) {
  const { entry } = row;
  const savedIn = timeCell(entry.in_seconds);
  const savedOut = timeCell(entry.out_seconds);
  const savedNote = entry.note ?? "";
  const [inText, setInText] = useState(savedIn);
  const [outText, setOutText] = useState(savedOut);
  const [note, setNote] = useState(savedNote);
  const [timesRefused, setTimesRefused] = useState(false);
  const ids = useId();

  // What the engine last said wins whenever it says something new: a re-read
  // after a save, or another window's edit.
  useEffect(() => {
    setInText(savedIn);
    setOutText(savedOut);
    setTimesRefused(false);
  }, [savedIn, savedOut]);
  useEffect(() => setNote(savedNote), [savedNote]);

  const saveTimes = async () => {
    if (inText.trim() === savedIn && outText.trim() === savedOut) return;
    const ok = await onSaveTimes(blankToNull(inText), blankToNull(outText));
    setTimesRefused(!ok);
  };

  const saveNote = () => {
    if (note.trim() === savedNote.trim()) return;
    void onSaveNote(blankToNull(note));
  };

  const onTimeKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveTimes();
    }
  };

  const length = entry.length_seconds;
  const found = [...row.transition, ...row.warnings];

  return (
    <section className="prepare-entry-zone" aria-label="In this Set">
      <h3 className="cp-track-detail__subtitle">In this Set</h3>
      <p className="prepare-entry-zone__place">
        Entry {entry.position + 1}
        {row.chapter && chapters.length > 1 ? `, in ${chapterName(row.chapter)}` : ""}
        {entry.starts_at != null ? ` · starts at ${timeCell(entry.starts_at)}` : ""}
      </p>

      <div className="prepare-entry-zone__times">
        <label className="prepare-entry-zone__field" htmlFor={`${ids}-in`}>
          <span className="cp-field__label">Mix in</span>
          <input
            id={`${ids}-in`}
            className="cp-field__input"
            value={inText}
            placeholder="0:00"
            aria-invalid={timesRefused}
            onChange={(event) => setInText(event.target.value)}
            onBlur={() => void saveTimes()}
            onKeyDown={onTimeKey}
          />
        </label>
        <label className="prepare-entry-zone__field" htmlFor={`${ids}-out`}>
          <span className="cp-field__label">Mix out</span>
          <input
            id={`${ids}-out`}
            className="cp-field__input"
            value={outText}
            placeholder={length == null ? "" : timeCell(length)}
            aria-invalid={timesRefused}
            onChange={(event) => setOutText(event.target.value)}
            onBlur={() => void saveTimes()}
            onKeyDown={onTimeKey}
          />
        </label>
        <p className="prepare-entry-zone__planned" role="status">
          {entry.planned_seconds != null
            ? `Plays for ${timeCell(entry.planned_seconds)}`
            : "No out time yet: type one to count this track in the Set's length."}
        </p>
      </div>
      {timesRefused && (
        <p className="prepare-entry-zone__refused">Not saved: the times above were refused.</p>
      )}

      <label className="prepare-entry-zone__note" htmlFor={`${ids}-note`}>
        <span className="cp-field__label">Note</span>
        <textarea
          id={`${ids}-note`}
          rows={2}
          maxLength={NOTES_MAX_LENGTH}
          value={note}
          placeholder="What to do here: a loop, an effect, a word to the crowd"
          onChange={(event) => setNote(event.target.value)}
          onBlur={saveNote}
        />
      </label>

      {chapters.length > 1 && (
        <label className="prepare-entry-zone__field" htmlFor={`${ids}-chapter`}>
          <span className="cp-field__label">Chapter</span>
          <select
            id={`${ids}-chapter`}
            className="cp-select__control"
            value={String(entry.chapter_id)}
            onChange={(event) => onMoveToChapter(Number(event.target.value))}
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={String(chapter.id)}>
                {chapterName(chapter)}
              </option>
            ))}
          </select>
        </label>
      )}

      {found.some(isAcknowledgeable) && <p className="prepare-entry-zone__hint">{ACCEPT_HINT}</p>}
      {(found.length > 0 || row.notices.length > 0) && (
        <ul className="prepare-entry-zone__warnings" aria-label="What the checks found">
          {found.map((warning) => (
            <li
              key={`${warning.kind}-${warning.detail}`}
              className={`prepare-entry-zone__warning${warning.acknowledged ? " prepare-entry-zone__warning--accepted" : ""}`}
            >
              <span>
                {describeSetWarning(warning)}
                {warning.acknowledged ? " (accepted)" : ""}
              </span>
              {isAcknowledgeable(warning) && (
                <Button
                  variant="secondary"
                  onClick={() => onAcknowledge(warning, !warning.acknowledged)}
                >
                  {warning.acknowledged ? "Undo accept" : "Accept"}
                </Button>
              )}
            </li>
          ))}
          {row.notices.map((notice) => (
            <li key={notice.kind} className="prepare-entry-zone__notice">
              Played again: {describeSetNotice(notice).toLowerCase()}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

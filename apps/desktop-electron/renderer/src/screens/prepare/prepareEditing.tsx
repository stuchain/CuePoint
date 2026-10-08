/**
 * What the Set table's own cells can do (FLW-17, FLW-18).
 *
 * The columns are a fixed registry, so what a cell does with the page's state
 * reaches it through a context the page provides around the table: Mix in and
 * Mix out typed in place, and a chapter's heading with its buttons. Without a
 * provider (the column picker, a test of a column) a cell is only its text.
 *
 * - **A time cell** is a button that reads as its time. A click starts typing;
 *   Enter or Tab saves and moves to the next cell, Shift+Tab to the one
 *   before, Escape drops the typing, and leaving the cell saves it. A refused
 *   time stays in the cell, marked, and is said on the page's facts line. A
 *   double-click is the table's: it plays the row, and the typing is dropped.
 * - **A heading's buttons** are Edit, up, down and delete for its chapter (their
 *   names say "Move chapter up" and so on), so no chapter action is right-click only.
 */
import { useContext, useEffect, useRef, useState, type MouseEvent } from "react";

import { PrepareEditingContext, type PrepareEditing } from "./prepareEditingContext";
import { timeCell } from "./prepareFormat";
import type { EntryRow, HeadingRow } from "./prepareRows";
import type { TimeField } from "./timeEditing";

const FIELD_WORDS: Record<TimeField, string> = { in: "Mix in", out: "Mix out" };

function TimeInput({ row, field, editing }: { row: EntryRow; field: TimeField; editing: PrepareEditing }) {
  const saved = timeCell(field === "in" ? row.entry.in_seconds : row.entry.out_seconds);
  const [text, setText] = useState(saved);
  const input = useRef<HTMLInputElement>(null);
  // One save per leaving: Enter's, then the blur its move causes, is not two.
  const leaving = useRef(false);
  const entryId = row.entry.entry_id;

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const leave = async (move: 1 | -1 | 0) => {
    if (leaving.current) return;
    leaving.current = true;
    const result = await editing.commitTime(entryId, field, text, move);
    if (result !== "refused") return;
    leaving.current = false;
    // Left by a click elsewhere: the cell closes, the words stay.
    if (document.activeElement !== input.current) editing.stopTimeEdit(true, { entryId, field });
  };

  return (
    <input
      ref={input}
      className="prepare-time__input"
      value={text}
      aria-label={`${FIELD_WORDS[field]} for ${row.entry.track.title ?? "the entry"}`}
      aria-invalid={editing.invalid}
      placeholder={field === "out" && row.entry.length_seconds != null ? timeCell(row.entry.length_seconds) : "0:00"}
      onChange={(event) => setText(event.target.value)}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      // The row's double-click plays it: the typing is dropped first.
      onDoubleClick={() => {
        leaving.current = true;
        editing.stopTimeEdit(false);
      }}
      onBlur={() => void leave(0)}
      onKeyDown={(event) => {
        // The table's own keys (Enter plays, the menu key) are not for a field.
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          void leave(1);
        } else if (event.key === "Tab") {
          event.preventDefault();
          void leave(event.shiftKey ? -1 : 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          leaving.current = true;
          editing.stopTimeEdit(false);
        }
      }}
    />
  );
}

/** A Mix in or Mix out cell of an entry; a heading has none. */
export function TimeCell({ row, field }: { row: EntryRow | HeadingRow; field: TimeField }) {
  const editing = useContext(PrepareEditingContext);
  if (row.kind !== "entry") return null;
  const text = timeCell(field === "in" ? row.entry.in_seconds : row.entry.out_seconds);
  if (!editing) return <>{text}</>;
  if (editing.editing?.entryId === row.entry.entry_id && editing.editing.field === field) {
    return <TimeInput row={row} field={field} editing={editing} />;
  }
  return (
    <button
      type="button"
      className="prepare-time"
      tabIndex={-1}
      aria-label={`${FIELD_WORDS[field]} for ${row.entry.track.title ?? "the entry"}: ${text || "not set"}`}
      title={`Type the ${FIELD_WORDS[field]} for this track`}
      onClick={() => editing.startTimeEdit(row.entry.entry_id, field)}
    >
      {text}
    </button>
  );
}

const quiet = (event: MouseEvent) => event.stopPropagation();

/** A chapter heading's Edit, up, down and delete (FLW-17). */
export function ChapterButtons({ row }: { row: HeadingRow }) {
  const editing = useContext(PrepareEditingContext);
  if (!editing) return null;
  const { chapter } = row;
  const { chapters } = editing;
  const buttons = [
    { label: "Edit", name: "Edit chapter", disabled: false, run: () => chapters.edit(chapter) },
    { label: "↑", name: "Move chapter up", disabled: chapter.position <= 0, run: () => chapters.move(chapter, -1) },
    {
      label: "↓",
      name: "Move chapter down",
      disabled: chapter.position >= chapters.count - 1,
      run: () => chapters.move(chapter, 1),
    },
    // A Set always has one chapter (DEC-103).
    { label: "×", name: "Delete chapter", disabled: chapters.count <= 1, run: () => chapters.remove(chapter) },
  ];
  return (
    <span className="prepare-heading__buttons" onClick={quiet} onDoubleClick={quiet} onMouseDown={quiet}>
      {buttons.map((button) => (
        <button
          key={button.name}
          type="button"
          className="prepare-heading__button"
          tabIndex={-1}
          aria-label={button.name}
          title={button.name}
          disabled={button.disabled}
          onClick={button.run}
        >
          {button.label}
        </button>
      ))}
    </span>
  );
}

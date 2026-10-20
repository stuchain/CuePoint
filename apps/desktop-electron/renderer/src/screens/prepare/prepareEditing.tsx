/**
 * What the Set table's own cells can do (FLW-17, FLW-18).
 *
 * The columns are a fixed registry, so what a cell does with the page's state
 * reaches it through a context the page provides around the table: Mix in and
 * Mix out typed in place, and a chapter's heading with its buttons. Without a
 * provider (the column picker, a test of a column) a cell is only its text.
 *
 * - **A time cell** is a button that reads as its time. A click or F2 starts typing;
 *   Enter saves and keeps the keyboard on the row (it does not play), Tab saves and moves to
 *   the next cell, Shift+Tab to the one before, Escape drops the typing, and leaving the
 *   cell saves it. A refused
 *   time stays in the cell, marked, and is said on the page's facts line. A
 *   double-click is the table's: it plays the row, and the typing is dropped.
 * - **A heading's buttons** are Edit, up, down and delete for its chapter (their
 *   names say "Move chapter up" and so on), so no chapter action is right-click only.
 * - **An entry's buttons** are the five for the selected entries, drawn on the
 *   focused entry's row only (DEC-249): short words, glyphs where the row has no room for
 *   the words, or one "Actions ▾" button where it has no room for those either; the
 *   full names are kept. Not drawn while a time on that row is being typed in.
 */
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Button } from "../../components/Button";

import { Hint } from "../../components/Hint";
import { useDoubleClickGrace } from "../../hooks/useDoubleClickGrace";
import { opensDialog } from "../../format/words";
import { entryButtonDomId, type EntryButton, type EntryMark } from "./entryActions";
import { useEntryButtonsForm } from "./entryButtonsRoom";
import { DOUBLE_CLICK_MS, PrepareEditingContext, type PrepareEditing } from "./prepareEditingContext";
import { timeCell } from "./prepareFormat";
import type { EntryRow, HeadingRow } from "./prepareRows";
import type { TimeField } from "./timeEditing";

/** The "Actions ▾" button's id: where focus returns to if the row is redrawn under it. */
const ACTIONS_BUTTON_ID = "prepare-entry-actions";

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

  const leave = async (move: 1 | -1 | 0, backToTable = false) => {
    if (leaving.current) return;
    leaving.current = true;
    // Enter keeps the keyboard on the row: the table is found before the field is gone.
    const table = backToTable ? input.current?.closest<HTMLElement>('[role="table"]') : null;
    const result = await editing.commitTime(entryId, field, text, move);
    if (result !== "refused") {
      table?.focus();
      return;
    }
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
          void leave(0, true);
        } else if (event.key === "Tab") {
          event.preventDefault();
          void leave(event.shiftKey ? -1 : 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          leaving.current = true;
          // Like Enter, the keyboard stays on the row: the table is found before the field is gone.
          const table = input.current?.closest<HTMLElement>('[role="table"]');
          editing.stopTimeEdit(false);
          table?.focus();
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
      data-hint={`Type the ${FIELD_WORDS[field]} for this track`}
      onClick={() => editing.startTimeEdit(row.entry.entry_id, field)}
    >
      {text}
    </button>
  );
}

const quiet = (event: MouseEvent) => event.stopPropagation();

/** The keys the table acts on (Enter and F2 edit or play, arrows move, Delete removes, the menu key): a button's own are kept from it. */
const TABLE_KEYS = new Set([
  "Enter",
  " ",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Delete",
  "Backspace",
  "F2",
  "ContextMenu",
]);

/** A row's buttons keep the keys the table acts on; Escape, Tab and the app's own keys go through. */
const stopTableKeys = (event: KeyboardEvent) => {
  if (TABLE_KEYS.has(event.key)) event.stopPropagation();
};

/**
 * A row button: the shared small grey Button (C6), its mark an icon alone or its words. The full
 * name is its accessible name either way.
 */
function MarkButton({
  mark,
  label,
  ...rest
}: { mark: EntryMark; label: string } & Omit<ComponentPropsWithoutRef<"button">, "children" | "aria-label">) {
  return "icon" in mark ? (
    <Button size="sm" variant="secondary" iconOnly icon={mark.icon} aria-label={label} {...rest} />
  ) : (
    <Button size="sm" variant="secondary" aria-label={label} {...rest}>
      {mark.text}
    </Button>
  );
}

/**
 * A chapter heading's one button, Edit… (FLW-17, amended). Moving and deleting the chapter are in
 * its dialog and its right-click menu.
 */
export function ChapterButtons({ row }: { row: HeadingRow }) {
  const editing = useContext(PrepareEditingContext);
  if (!editing) return null;
  const { chapter } = row;
  return (
    // A Tab stop. Its keys stay its own: Enter on it presses it, and does not reach the
    // table, where Enter on a heading opens Edit.
    <span
      className="prepare-heading__buttons"
      onClick={quiet}
      onDoubleClick={quiet}
      onMouseDown={quiet}
      onKeyDown={stopTableKeys}
    >
      <Hint text="Edit chapter" portal>
        <Button
          size="sm"
          variant="secondary"
          aria-label="Edit chapter"
          onClick={() => editing.chapters.edit(chapter)}
        >
          {opensDialog("Edit")}
        </Button>
      </Hint>
    </span>
  );
}

/**
 * The buttons for the selected entries, at the end of the focused entry's row
 * (FLW-17, DEC-249). They act on every selected entry, so another selected row
 * carries none; a press stops at them, so it neither selects nor plays the row.
 *
 * Their form is measured (entryButtonsRoom): the words, the glyphs, or one "Actions ▾" button
 * that opens the row's context menu, so they never cover the row's number or the least of its
 * title. Both groups are also drawn hidden, for the measuring.
 */
export function EntryButtons({ row }: { row: EntryRow }) {
  const editing = useContext(PrepareEditingContext);
  // They appear where the first click of a double-click has just landed, over the row's right end:
  // for the length of a double-click the pointer goes through them to the row, so the second click
  // plays the row instead of pressing a button. Keys and Tab are not held back.
  const armed = useDoubleClickGrace();
  const measure = useRef<HTMLSpanElement>(null);
  const form = useEntryButtonsForm(measure, editing?.entryButtons.titleMinWidth ?? 0);
  // A mouse click on Remove waits out a double-click: the first click of one aimed at the row would
  // otherwise remove it. A second click, or the double-click, cancels it. There is no Undo to offer
  // instead (Prepare has none for a remove).
  const pendingRemove = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = useRef(editing?.entryButtons.press);
  press.current = editing?.entryButtons.press;
  const cancelRemove = () => {
    if (pendingRemove.current === null) return false;
    clearTimeout(pendingRemove.current);
    pendingRemove.current = null;
    return true;
  };
  useEffect(() => () => void cancelRemove(), []);

  if (!editing || editing.entryButtons.entryId !== row.entry.entry_id || editing.entryButtons.buttons.length === 0) {
    return null;
  }
  const { buttons, openMenu } = editing.entryButtons;
  const onPress = (button: EntryButton) => (event: MouseEvent<HTMLButtonElement>) => {
    // Enter and Space press at once (detail 0); only a click of the mouse waits.
    if (button.id !== "remove" || event.detail === 0) {
      press.current?.(button.id);
      return;
    }
    if (cancelRemove()) return;
    pendingRemove.current = setTimeout(() => {
      pendingRemove.current = null;
      press.current?.("remove");
    }, DOUBLE_CLICK_MS);
  };
  return (
    <>
      <span className="prepare-row-buttons prepare-row-buttons--measure" aria-hidden="true" data-measure="words" ref={measure}>
        {buttons.map((button) => (
          <MarkButton key={button.id} mark={button.short} label={button.label} tabIndex={-1} />
        ))}
      </span>
      <span className="prepare-row-buttons prepare-row-buttons--measure" aria-hidden="true" data-measure="glyphs">
        {buttons.map((button) => (
          <MarkButton key={button.id} mark={button.glyph} label={button.label} tabIndex={-1} />
        ))}
      </span>
      {/* Each is a Tab stop, and its keys stay its own: Enter presses it and does not start typing a time. */}
      <span
        className="prepare-row-buttons"
        role="group"
        aria-label="Selected entries"
        style={armed ? undefined : { pointerEvents: "none" }}
        onClick={quiet}
        onDoubleClick={(event) => {
          // A double-click on Remove is one aimed at the row: it plays it, and nothing is removed.
          cancelRemove();
          if (!(event.target as Element).closest('[data-entry-button="remove"]')) event.stopPropagation();
        }}
        onMouseDown={quiet}
        onKeyDown={stopTableKeys}
      >
        {form === "actions" ? (
          <Hint text="Actions for this entry" portal>
            <Button
              id={ACTIONS_BUTTON_ID}
              size="sm"
              variant="secondary"
              menu
              aria-label="Actions"
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                openMenu(row, { x: box.left, y: box.bottom });
              }}
            >
              Actions
            </Button>
          </Hint>
        ) : (
          buttons.map((button) => (
            <Hint key={button.id} text={button.hint} portal>
              <MarkButton
                id={entryButtonDomId(button.id)}
                data-entry-button={button.id}
                mark={form === "glyphs" ? button.glyph : button.short}
                label={button.label}
                disabled={button.disabled}
                onClick={onPress(button)}
              />
            </Hint>
          ))
        )}
      </span>
    </>
  );
}

/**
 * Typing Mix in and Mix out in the Set table (FLW-18), apart from the cells.
 *
 * The engine takes both times together and judges them (DEC-107), as Track
 * details' "In this Set" sends them; a cell sends the one typed with the other
 * as the Set shows it. Enter and Tab walk the cells in reading order, Mix in
 * then Mix out of an entry, then the next entry's Mix in.
 */
import type { SetEntry } from "../../api/cuepointBridge.types";
import { timeCell } from "./prepareFormat";

export type TimeField = "in" | "out";

export interface TimeTarget {
  entryId: number;
  field: TimeField;
}

/** A typed cell as the engine takes it: blank clears a time. */
function blankToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** An entry's two times as the cells show them. */
export interface TimeTexts {
  in: string;
  out: string;
}

export function timeTexts(entry: Pick<SetEntry, "in_seconds" | "out_seconds">): TimeTexts {
  return { in: timeCell(entry.in_seconds), out: timeCell(entry.out_seconds) };
}

/**
 * What typing `text` into a cell saves, given the times as they stand, and
 * whether that changes anything. `current` is what the last save wrote when the
 * Set has not been read again since: Tab out of Mix in must not send Mix out's
 * old value over the Mix in just saved.
 */
export function timesToSave(
  current: TimeTexts,
  field: TimeField,
  text: string,
): { changed: boolean; in_time: string | null; out_time: string | null } {
  const typed = blankToNull(text);
  return {
    changed: (typed ?? "") !== current[field],
    in_time: field === "in" ? typed : blankToNull(current.in),
    out_time: field === "out" ? typed : blankToNull(current.out),
  };
}

/** The cell after (1) or before (-1) this one in reading order; null at the Set's ends. */
export function nextTimeTarget(
  entries: readonly Pick<SetEntry, "entry_id" | "position">[],
  entryId: number,
  field: TimeField,
  direction: 1 | -1,
): TimeTarget | null {
  const ordered = [...entries].sort((a, b) => a.position - b.position);
  const at = ordered.findIndex((entry) => entry.entry_id === entryId);
  if (at < 0) return null;
  if (direction === 1) {
    if (field === "in") return { entryId, field: "out" };
    const next = ordered[at + 1];
    return next ? { entryId: next.entry_id, field: "in" } : null;
  }
  if (field === "out") return { entryId, field: "in" };
  const before = ordered[at - 1];
  return before ? { entryId: before.entry_id, field: "out" } : null;
}

/**
 * A refused time in words for the facts line: the reason first, so it shows
 * whatever the width, and the entry's name last, where it gives way first.
 */
export function timeRefusalWords(title: string, message: string): { reason: string; entry: string; line: string } {
  const name = title.trim() === "" ? "an untitled track" : title;
  const reason = `Not saved: ${message}`;
  const entry = `(${name})`;
  return { reason, entry, line: `${reason} ${entry}` };
}

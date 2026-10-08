/**
 * The buttons for the selected entries (FLW-17), apart from their drawing.
 *
 * Move up, Move down, Start a chapter here, Repeat after and Remove sit on the
 * Set's facts line and are always shown, disabled with a reason until there is
 * something to act on (DEC-209). Which are enabled, and what "Move up" asks of
 * the engine for one entry or several, is decided here so it is a unit test and
 * not a glimpse through a component.
 *
 * A move is one step in the table as it reads: past the entry above or below,
 * and, at a chapter's edge, across its heading, which is a step of its own (the
 * position stays, the chapter changes). Several selected entries move
 * together, in the order that keeps them apart from each other; a block that
 * cannot move leaves the ones behind it where they are.
 */
import { canSplitAt, isEntryRow, type EntryMove, type PrepareRow } from "./prepareRows";

export type EntryButtonId = "up" | "down" | "split" | "repeat" | "remove";

export interface EntryButton {
  id: EntryButtonId;
  label: string;
  disabled: boolean;
  /** Why it is disabled, said in its hint; null when it is not. */
  reason: string | null;
  /** The key that does the same, as it is written in a hint. */
  shortcut: string | null;
  /** What stands for the label when the line has no room for the words (DEC-112). */
  glyph: string;
}

/** What every button says until an entry is selected. */
export const NO_ENTRY_SELECTED = "Select an entry";

type Item =
  | { kind: "heading"; chapterId: number }
  | { kind: "entry"; entryId: number; chapterId: number };

/** The rows as a list a move can be worked out on. */
function itemsOf(rows: readonly PrepareRow[]): Item[] {
  return rows.map((row) =>
    row.kind === "heading"
      ? { kind: "heading", chapterId: row.chapter.id }
      : { kind: "entry", entryId: row.entry.entry_id, chapterId: row.entry.chapter_id },
  );
}

/** How many entries come before an index of the list: the position there. */
function entriesBefore(items: readonly Item[], index: number): number {
  return items.slice(0, index).filter((item) => item.kind === "entry").length;
}

/**
 * The moves that take every selected entry one step up (-1) or down (1), in the
 * order to ask them. Each is worked out on the list as the ones before it left
 * it, so each is the engine's final position for that entry at that point.
 */
export function stepMoves(
  rows: readonly PrepareRow[],
  selected: ReadonlySet<number>,
  direction: -1 | 1,
): EntryMove[] {
  const items = itemsOf(rows);
  const wanted = items
    .filter((item): item is Extract<Item, { kind: "entry" }> => item.kind === "entry" && selected.has(item.entryId))
    .map((item) => item.entryId);
  // The ones nearest the end they move toward go first, so none passes another.
  const order = direction === -1 ? wanted : [...wanted].reverse();
  const moves: EntryMove[] = [];
  for (const entryId of order) {
    const at = items.findIndex((item) => item.kind === "entry" && item.entryId === entryId);
    const neighbor = items[at + direction];
    if (!neighbor) continue;
    const entry = items[at] as Extract<Item, { kind: "entry" }>;
    let chapterId = entry.chapterId;
    if (neighbor.kind === "entry") {
      // A selected neighbor is moving with it, or stuck: either way it is not passed.
      if (selected.has(neighbor.entryId)) continue;
      items[at] = neighbor;
      items[at + direction] = entry;
    } else if (direction === -1) {
      // Up across a heading: the end of the chapter before it, if there is one.
      const before = items.slice(0, at - 1).reverse().find((item) => item.kind === "heading");
      if (!before) continue;
      chapterId = before.chapterId;
      items.splice(at, 1);
      items.splice(at - 1, 0, { ...entry, chapterId });
    } else {
      // Down across a heading: the start of the chapter it opens.
      chapterId = neighbor.chapterId;
      items.splice(at, 1);
      items.splice(at + 1, 0, { ...entry, chapterId });
    }
    const placed = items.findIndex((item) => item.kind === "entry" && item.entryId === entryId);
    moves.push({ entry_id: entryId, position: entriesBefore(items, placed), chapter_id: chapterId });
  }
  return moves;
}

const GLYPHS: Record<EntryButtonId, string> = { up: "↑", down: "↓", split: "¶", repeat: "↻", remove: "×" };

const button = (
  id: EntryButtonId,
  label: string,
  reason: string | null,
  shortcut: string | null = null,
): EntryButton => ({ id, label, disabled: reason !== null, reason, shortcut, glyph: GLYPHS[id] });

/**
 * The five buttons for the entries selected, in the order they are drawn.
 * Start a chapter here uses the first selected entry; Repeat after needs
 * exactly one.
 */
export function entryButtons(rows: readonly PrepareRow[], selected: ReadonlySet<number>): EntryButton[] {
  const chosen = rows.filter(isEntryRow).filter((row) => selected.has(row.entry.entry_id));
  const none = chosen.length === 0 ? NO_ENTRY_SELECTED : null;
  const first = chosen[0];
  return [
    button("up", "Move up", none ?? (stepMoves(rows, selected, -1).length > 0 ? null : "Already first in the Set"), "Alt+↑"),
    button("down", "Move down", none ?? (stepMoves(rows, selected, 1).length > 0 ? null : "Already last in the Set"), "Alt+↓"),
    button(
      "split",
      "Start a chapter here",
      none ?? (first && canSplitAt(rows, first.entry.entry_id) ? null : "Already starts a chapter"),
    ),
    button("repeat", "Repeat after", none ?? (chosen.length === 1 ? null : "Select one entry")),
    button("remove", "Remove", none, "Delete"),
  ];
}

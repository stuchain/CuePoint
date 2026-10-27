import { describe, expect, it } from "vitest";

import { buildSetRows } from "./prepareRows";
import { FRIDAY, IDS, PLAIN } from "./prepare.testFixture";
import { entryButtons, stepMoves } from "./entryActions";

/**
 * The entry buttons (FLW-17): which are enabled, why one is not, and the
 * moves "Move up" and "Move down" ask of the engine, for one entry or several.
 *
 * Friday's rows: Warm-up's heading, entries 1 and 2; Peak's heading, entries 3
 * and 4; Close's heading, entries 6 and 5 (chapters 1, 2 and 3).
 */
const [E1, E2, E3, E4, E6, E5] = IDS.friday_entries;
const rows = buildSetRows(FRIDAY.plan, FRIDAY.entries, FRIDAY.analysis);
const plain = buildSetRows(PLAIN.plan, PLAIN.entries, PLAIN.analysis);
const ids = (...entries: number[]) => new Set(entries);

describe("Move up and Move down", () => {
  it("swap an entry with its neighbor, in its chapter", () => {
    expect(stepMoves(rows, ids(E2), -1)).toEqual([{ entry_id: E2, position: 0, chapter_id: 1 }]);
    expect(stepMoves(rows, ids(E1), 1)).toEqual([{ entry_id: E1, position: 1, chapter_id: 1 }]);
  });

  it("cross a chapter's heading as a step of their own, the position unchanged", () => {
    expect(stepMoves(rows, ids(E3), -1)).toEqual([{ entry_id: E3, position: 2, chapter_id: 1 }]);
    expect(stepMoves(rows, ids(E2), 1)).toEqual([{ entry_id: E2, position: 1, chapter_id: 2 }]);
  });

  it("stop at the ends of the Set", () => {
    expect(stepMoves(rows, ids(E1), -1)).toEqual([]);
    expect(stepMoves(rows, ids(E5), 1)).toEqual([]);
    // One unnamed chapter is a plain list: no heading to cross.
    expect(stepMoves(plain, ids(7), -1)).toEqual([]);
    expect(stepMoves(plain, ids(8), 1)).toEqual([]);
    expect(stepMoves(plain, ids(8), -1)).toEqual([{ entry_id: 8, position: 0, chapter_id: 4 }]);
  });

  it("move several entries together, a block that cannot move staying put", () => {
    expect(stepMoves(rows, ids(E2, E3), -1)).toEqual([
      { entry_id: E2, position: 0, chapter_id: 1 },
      { entry_id: E3, position: 2, chapter_id: 1 },
    ]);
    // The first entry is stuck at the top, so the one behind it does not pass it.
    expect(stepMoves(rows, ids(E1, E2), -1)).toEqual([]);
    expect(stepMoves(rows, ids(E3, E4), 1).map((move) => move.entry_id)).toEqual([E4, E3]);
    expect(stepMoves(rows, ids(E6, E5), 1)).toEqual([]);
  });

  it("move nothing for a selection that is not in the Set", () => {
    expect(stepMoves(rows, ids(), -1)).toEqual([]);
    expect(stepMoves(rows, ids(99999), 1)).toEqual([]);
  });
});

describe("the five buttons", () => {
  const by = (list: ReturnType<typeof entryButtons>) => Object.fromEntries(list.map((b) => [b.id, b]));

  it("are the five, in order, with the words a row has room for and the names kept (C15d)", () => {
    const list = entryButtons(rows, ids(E2));
    expect(list.map((button) => button.label)).toEqual([
      "Move up",
      "Move down",
      "New chapter",
      "Repeat",
      "Remove",
    ]);
    // Move up and Move down are an up arrow and a down arrow, not two copies of one mark (C245).
    expect(list.map((button) => button.short)).toEqual([
      { icon: "arrow-up" },
      { icon: "arrow-down" },
      { text: "New chapter" },
      { text: "Repeat" },
      { text: "Remove" },
    ]);
    // A pane with no room for the words draws these instead (DEC-249).
    expect(list.map((button) => button.glyph)).toEqual([
      { icon: "arrow-up" },
      { icon: "arrow-down" },
      { text: "Chapter" },
      { icon: "repeat-after" },
      { icon: "remove" },
    ]);
  });

  it("are none while nothing is selected: the row they sit on is the selected one (DEC-249)", () => {
    expect(entryButtons(rows, ids())).toEqual([]);
    expect(entryButtons(rows, ids(99999))).toEqual([]);
  });

  it("say what they do in the hint, and for how many, with the key", () => {
    const one = by(entryButtons(rows, ids(E2)));
    expect(one.up.hint).toBe("Move up (Alt+↑)");
    expect(one.remove.hint).toBe("Remove (Delete)");
    expect(one.split.hint).toBe("Start a new chapter at this track");
    const several = by(entryButtons(rows, ids(E2, E3)));
    expect(several.up.hint).toBe("Move 2 tracks up (Alt+↑)");
    expect(several.down.hint).toBe("Move 2 tracks down (Alt+↓)");
    expect(several.remove.hint).toBe("Remove 2 tracks (Delete)");
    // A reason, when there is one, is the hint.
    expect(by(entryButtons(rows, ids(E1))).up.hint).toBe("Already first in the Set");
  });

  it("name their keys: Alt+Up, Alt+Down and Delete", () => {
    const list = by(entryButtons(rows, ids(E2)));
    expect(list.up.shortcut).toBe("Alt+↑");
    expect(list.down.shortcut).toBe("Alt+↓");
    expect(list.remove.shortcut).toBe("Delete");
    expect(list.split.shortcut).toBeNull();
  });

  it("are enabled for an entry that can do each, and say why one cannot", () => {
    const middle = by(entryButtons(rows, ids(E2)));
    expect(Object.values(middle).every((button) => !button.disabled && button.reason === null)).toBe(true);

    const first = by(entryButtons(rows, ids(E1)));
    expect(first.up).toMatchObject({ disabled: true, reason: "Already first in the Set" });
    expect(first.split).toMatchObject({ disabled: true, reason: "Already starts a chapter" });
    expect(first.down.disabled).toBe(false);

    const last = by(entryButtons(rows, ids(E5)));
    expect(last.down).toMatchObject({ disabled: true, reason: "Already last in the Set" });
  });

  it("act on several entries, except the two that need one place", () => {
    const several = by(entryButtons(rows, ids(E2, E3)));
    expect(several.up.disabled).toBe(false);
    expect(several.remove.disabled).toBe(false);
    expect(several.repeat).toMatchObject({ disabled: true, reason: "Select one track" });
    // Start a chapter here uses the first selected entry (E2 is not a chapter's first).
    expect(several.split.disabled).toBe(false);
  });
});

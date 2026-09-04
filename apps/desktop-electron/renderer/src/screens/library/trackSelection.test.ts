/**
 * The selection model (LIBUI-09, DEC-045).
 *
 * Two properties carry it:
 *
 * **A selection is by id, never by index.** With windowed data an index means
 * nothing once the window moves.
 * **"Everything matching" is a description, not a list.** Selecting all of a
 * 47,913-track view must put no ids in memory at all — asserted directly,
 * because the failure is invisible until a library is large enough to hurt.
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_SELECTION,
  clear,
  describeSelection,
  extend,
  isDescribed,
  isEmpty,
  isSelected,
  onlySelectedId,
  rangeBetween,
  selectAll,
  selectOnly,
  selectionCount,
  toggle,
} from "./trackSelection";

describe("nothing selected", () => {
  it("counts nothing", () => {
    expect(selectionCount(EMPTY_SELECTION, 50_000)).toBe(0);
    expect(isEmpty(EMPTY_SELECTION, 50_000)).toBe(true);
  });

  it("says nothing", () => {
    expect(describeSelection(EMPTY_SELECTION, 50_000)).toBe("");
  });

  it("holds no track", () => {
    expect(isSelected(EMPTY_SELECTION, 7)).toBe(false);
  });
});

describe("clicking a track", () => {
  it("selects that one and nothing else", () => {
    const selection = selectOnly(7, 3);
    expect(isSelected(selection, 7)).toBe(true);
    expect(selectionCount(selection, 50_000)).toBe(1);
  });

  it("remembers where the click landed, to extend from", () => {
    expect(selectOnly(7, 3).anchor).toBe(3);
  });

  it("remembers the track for the Inspector", () => {
    expect(selectOnly(7, 3).lastId).toBe(7);
  });

  it("replaces whatever was selected before", () => {
    selectOnly(7, 3);
    const second = selectOnly(9, 4);
    expect(isSelected(second, 7)).toBe(false);
    expect(isSelected(second, 9)).toBe(true);
  });
});

describe("holding ctrl or cmd", () => {
  it("adds a track to the selection", () => {
    const selection = toggle(selectOnly(7, 3), 9, 4);
    expect(selectionCount(selection, 50_000)).toBe(2);
  });

  it("takes one out again", () => {
    const selection = toggle(toggle(selectOnly(7, 3), 9, 4), 9, 4);
    expect(isSelected(selection, 9)).toBe(false);
    expect(isSelected(selection, 7)).toBe(true);
  });

  it("takes one out of everything-matching without listing the rest", () => {
    const selection = toggle(selectAll(EMPTY_SELECTION), 9, 4);
    expect(isSelected(selection, 9)).toBe(false);
    expect(isSelected(selection, 10)).toBe(true);
    expect(selectionCount(selection, 50_000)).toBe(49_999);
  });

  it("puts one back into everything-matching", () => {
    const once = toggle(selectAll(EMPTY_SELECTION), 9, 4);
    expect(selectionCount(toggle(once, 9, 4), 50_000)).toBe(50_000);
  });
});

describe("holding shift", () => {
  it("adds a run of tracks", () => {
    const selection = extend(selectOnly(1, 0), [2, 3, 4], 4);
    expect(selectionCount(selection, 50_000)).toBe(4);
  });

  it("leaves the anchor where it was", () => {
    // Shift-clicking twice extends from the same place rather than walking
    // the selection down the table.
    const selection = extend(selectOnly(1, 0), [2, 3], 3);
    expect(selection.anchor).toBe(0);
  });

  it("moves the Inspector to the track that was clicked", () => {
    expect(extend(selectOnly(1, 0), [2, 3], 3).lastId).toBe(3);
  });

  it("adds tracks back into everything-matching", () => {
    const withHoles = toggle(toggle(selectAll(EMPTY_SELECTION), 2, 1), 3, 2);
    expect(selectionCount(extend(withHoles, [2, 3], 3), 50_000)).toBe(50_000);
  });

  it("covers a range in either direction", () => {
    expect(rangeBetween(2, 8)).toEqual([2, 8]);
    expect(rangeBetween(8, 2)).toEqual([2, 8]);
    expect(rangeBetween(4, 4)).toEqual([4, 4]);
  });
});

describe("selecting everything matching", () => {
  it("is a description, not fifty thousand numbers", () => {
    // The guard: a selection of the whole library holds nothing.
    const selection = selectAll(EMPTY_SELECTION);
    expect(selection.ids.size).toBe(0);
    expect(selection.excluded.size).toBe(0);
    expect(isDescribed(selection)).toBe(true);
  });

  it("counts what the engine says the query matches", () => {
    expect(selectionCount(selectAll(EMPTY_SELECTION), 47_913)).toBe(47_913);
  });

  it("says so", () => {
    expect(describeSelection(selectAll(EMPTY_SELECTION), 47_913)).toBe(
      "47,913 tracks selected",
    );
  });

  it("holds every track without being asked about any", () => {
    const selection = selectAll(EMPTY_SELECTION);
    expect(isSelected(selection, 1)).toBe(true);
    expect(isSelected(selection, 49_999)).toBe(true);
  });

  it("keeps the anchor, so shift still extends from somewhere", () => {
    expect(selectAll(selectOnly(7, 3)).anchor).toBe(3);
  });
});

describe("one track, or not", () => {
  it("names the id when exactly one is selected", () => {
    expect(onlySelectedId(selectOnly(7, 3), 50_000)).toBe(7);
  });

  it("names nothing when two are", () => {
    expect(onlySelectedId(toggle(selectOnly(7, 3), 9, 4), 50_000)).toBeNull();
  });

  it("names nothing when none are", () => {
    expect(onlySelectedId(EMPTY_SELECTION, 50_000)).toBeNull();
  });

  it("names nothing for a described selection it cannot list", () => {
    // "Everything except all but one" is one track, but not one this module
    // has in hand; the caller resolves it from the query if it needs it.
    const selection = selectAll(EMPTY_SELECTION);
    expect(onlySelectedId(selection, 1)).toBeNull();
  });
});

describe("clearing", () => {
  it("goes back to nothing", () => {
    expect(clear()).toEqual(EMPTY_SELECTION);
  });
});

describe("what it says", () => {
  it("reads properly for one track", () => {
    expect(describeSelection(selectOnly(7, 3), 50_000)).toBe("1 track selected");
  });

  it("groups the digits", () => {
    expect(describeSelection(selectAll(EMPTY_SELECTION), 1_234)).toBe(
      "1,234 tracks selected",
    );
  });
});

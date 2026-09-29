/**
 * "New Set from…" in words and in the engine's terms (DEC-104, PREP-09,
 * PREP-12): each source as the engine takes it, what the dialog says it means,
 * and a selection refused whole when a Set cannot hold it.
 */
import { describe, expect, it } from "vitest";

import {
  SELECTION_SET_NAME,
  SET_ENTRY_LIMIT,
  newSetFromExplanation,
  newSetFromTitle,
  selectionSource,
  selectionTooLarge,
  setSourceOf,
  type NewSetSource,
} from "./newSetFrom";
import { CREATED_FROM_SELECTION, IDS, SELECTION_ENTRIES } from "./librarySets.testFixture";

const COLLECTION: NewSetSource = { kind: "collection", id: 4, name: "Warm-up", parentId: 1 };

describe("the source as the engine takes it", () => {
  it("sends a Collection and a Smart Collection by id, a playlist as a playlist", () => {
    expect(setSourceOf(COLLECTION)).toEqual({ kind: "collection", id: 4 });
    expect(setSourceOf({ ...COLLECTION, kind: "smart" })).toEqual({ kind: "collection", id: 4 });
    expect(setSourceOf({ ...COLLECTION, kind: "playlist", parentId: null })).toEqual({
      kind: "playlist",
      id: 4,
    });
  });

  it("sends a selection as its tracks, in the order given", () => {
    expect(setSourceOf(selectionSource([9, 2, 7], null))).toEqual({
      kind: "selection",
      track_ids: [9, 2, 7],
    });
  });

  it("is the shape the engine made a Set from, in that order (the fixture)", () => {
    // The producer sent tracks 5, 3 and 1; the engine kept that order.
    const [one, , three, , five] = IDS.tracks;
    expect(CREATED_FROM_SELECTION.source).toEqual({ kind: "selection", id: null, name: null });
    expect(SELECTION_ENTRIES.entries.map((entry) => entry.track.id)).toEqual([five, three, one]);
  });
});

describe("a selection as a source", () => {
  it("starts with a name, since a selection has none of its own", () => {
    const source = selectionSource([1, 2], 3);
    expect(source).toMatchObject({ kind: "selection", name: SELECTION_SET_NAME, parentId: 3 });
  });

  it("is titled by its size, and a named source by its name", () => {
    expect(newSetFromTitle(selectionSource([1], null))).toBe("New Set from the 1 selected track");
    expect(newSetFromTitle(selectionSource([1, 2, 3], null))).toBe("New Set from the 3 selected tracks");
    expect(newSetFromTitle(COLLECTION)).toBe("New Set from “Warm-up”");
  });

  it("says the Set keeps the table's order and changes nothing else", () => {
    expect(newSetFromExplanation(selectionSource([1, 2], null))).toBe(
      "The Set starts with the 2 selected tracks, in the order the table shows them, as one chapter. Nothing else changes.",
    );
  });
});

describe("a selection too large for a Set", () => {
  it("is the engine's own limit", () => {
    expect(SET_ENTRY_LIMIT).toBe(SELECTION_ENTRIES.limit);
  });

  it("is refused whole, with the numbers, above the limit and not at it", () => {
    expect(selectionTooLarge(SET_ENTRY_LIMIT)).toBeNull();
    expect(selectionTooLarge(1_200)).toBe(
      "A Set holds at most 1,000 entries, and 1,200 tracks are selected. Select fewer, or add them to a Collection instead.",
    );
  });
});

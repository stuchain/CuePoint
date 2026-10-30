/**
 * What can be done to a selection, per scope (ORG-11, DEC-061).
 *
 * The list is different in a Collection, in a Smart Collection and in the
 * library, and the difference is the kind of thing that is invisible until
 * somebody opens a menu in the third state. Offering a membership operation on
 * a Smart Collection is the one that matters: ORG-06 refuses it, so a menu
 * entry for it is a control whose only outcome is an error message.
 */
import { describe, expect, it, vi } from "vitest";

import { organizationMenuItems, targetMarks, targetTagCount, type OrganizationMenuHandlers } from "./trackMenu";

function handlers(): OrganizationMenuHandlers {
  return {
    onAddToCollection: vi.fn(),
    onRemoveFromCollection: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onRate: vi.fn(),
    onFavorite: vi.fn(),
  };
}

function labels(items: { label: string }[]): string[] {
  return items.map((item) => item.label);
}

const IN_LIBRARY = { count: 3, collection: null };
const IN_COLLECTION = { count: 3, collection: { id: 4, name: "Closers" } };

describe("what the menu offers", () => {
  it("offers every operation the engine knows", () => {
    const items = organizationMenuItems(IN_LIBRARY, handlers());
    expect(labels(items)).toEqual([
      "Add to a Collection…",
      "Add tag…",
      "Remove tag…",
      "Rate",
      "Add to favorites",
      "Remove from favorites",
    ]);
  });

  it("offers removing from a Collection only inside one", () => {
    expect(labels(organizationMenuItems(IN_COLLECTION, handlers()))).toContain(
      "Remove from “Closers”",
    );
    expect(labels(organizationMenuItems(IN_LIBRARY, handlers()))).not.toContain(
      "Remove from “Closers”",
    );
  });

  it("names the Collection it would remove from", () => {
    // "Remove from this Collection" over a table that could be showing any of
    // nine is a question rather than a label.
    const items = organizationMenuItems(
      { count: 1, collection: { id: 9, name: "Warmups" } },
      handlers(),
    );
    expect(labels(items)).toContain("Remove from “Warmups”");
  });

  it("offers nothing at all for nothing selected", () => {
    expect(organizationMenuItems({ count: 0, collection: null }, handlers())).toEqual([]);
  });

  it("offers the Set entries after Add to Collection, where a Set can be reached (PREP-09, PREP-12)", () => {
    const withSets = { ...handlers(), onAddToSet: vi.fn(), onNewSetFromSelection: vi.fn() };
    expect(labels(organizationMenuItems(IN_LIBRARY, withSets)).slice(0, 3)).toEqual([
      "Add to a Collection…",
      "Add to a Set…",
      "New Set from 3 tracks…",
    ]);
    organizationMenuItems(IN_LIBRARY, withSets)
      .find((item) => item.id === "new-set-from-selection")!
      .onSelect();
    expect(withSets.onNewSetFromSelection).toHaveBeenCalled();
  });

  it("separates itself from whatever is above it", () => {
    const [first] = organizationMenuItems(IN_LIBRARY, handlers());
    expect(first!.separatorBefore).toBe(true);
  });
});

describe("the rating row (M299)", () => {
  it("is one inline stars row rather than a submenu of six", () => {
    const rate = organizationMenuItems(IN_LIBRARY, handlers()).find(
      (item) => item.id === "rate",
    );
    expect(rate!.kind).toBe("stars");
    expect(rate!.items).toBeUndefined();
  });

  it("starts on the rating the rows share", () => {
    const rate = organizationMenuItems({ ...IN_LIBRARY, rating: 4 }, handlers()).find((item) => item.id === "rate");
    expect(rate!.value).toBe(4);
  });

  it("sets the number of stars that was chosen", () => {
    const spies = handlers();
    const rate = organizationMenuItems(IN_LIBRARY, spies).find((item) => item.id === "rate");
    rate!.onRate!(4);
    expect(spies.onRate).toHaveBeenCalledWith(4);
  });

  it("clears rather than rating zero (DEC-057)", () => {
    // Clearing falls back to Rekordbox's rating; zero is a rating of its own.
    const spies = handlers();
    const rate = organizationMenuItems(IN_LIBRARY, spies).find((item) => item.id === "rate");
    rate!.onRate!(0);
    expect(spies.onRate).toHaveBeenCalledWith(null);
  });

  it("offers Remove tag only while some track has a tag (M411)", () => {
    const none = organizationMenuItems({ ...IN_LIBRARY, tagCount: 0 }, handlers()).find((item) => item.id === "remove-tag");
    expect(none!.disabled).toBe(true);
    expect(none!.reason).toBe("These tracks have no tags");
    const some = organizationMenuItems({ ...IN_LIBRARY, tagCount: 2 }, handlers()).find((item) => item.id === "remove-tag");
    expect(some!.disabled).toBeFalsy();
  });

  it("counts the chosen tracks' own tags, not the library's, when every track is in hand (M411)", () => {
    // A library with tags in use, but these two rows have none: Remove tag… is off.
    expect(targetTagCount([{ tag_count: 0 }, { tag_count: 0 }], 2, 5)).toBe(0);
    expect(targetTagCount([{ tag_count: 0 }, { tag_count: 3 }], 2, 5)).toBe(3);
    // A selection reaching rows not loaded falls back to the library's tags in use.
    expect(targetTagCount([{ tag_count: 0 }], 40, 5)).toBe(5);
    expect(targetTagCount([{ tag_count: 0 }], 40, null)).toBeNull();
    // A row whose count the engine could not read is not known: the library's answer stands.
    expect(targetTagCount([{ tag_count: null }], 1, 4)).toBe(4);
    expect(targetTagCount([{}], 1, 0)).toBe(0);
  });

  it("does nothing when the parent itself is chosen", () => {
    const spies = handlers();
    const rate = organizationMenuItems(IN_LIBRARY, spies).find((item) => item.id === "rate");
    rate!.onSelect();
    expect(spies.onRate).not.toHaveBeenCalled();
  });
});

describe("the entries do what they say", () => {
  it.each([
    ["add-to-collection", "onAddToCollection"],
    ["add-tag", "onAddTag"],
    ["remove-tag", "onRemoveTag"],
  ] as const)("%s calls %s", (id, handler) => {
    const spies = handlers();
    organizationMenuItems(IN_LIBRARY, spies).find((item) => item.id === id)!.onSelect();
    expect(spies[handler]).toHaveBeenCalled();
  });

  it("favorites and unfavorites as two entries, not one toggle", () => {
    // Over twelve thousand tracks with both kinds in them there is no state to
    // toggle away from.
    const spies = handlers();
    const items = organizationMenuItems(IN_LIBRARY, spies);
    items.find((item) => item.id === "favorite")!.onSelect();
    items.find((item) => item.id === "unfavorite")!.onSelect();
    expect(spies.onFavorite).toHaveBeenNthCalledWith(1, true);
    expect(spies.onFavorite).toHaveBeenNthCalledWith(2, false);
  });

  it("removes from the Collection the table is showing", () => {
    const spies = handlers();
    organizationMenuItems(IN_COLLECTION, spies)
      .find((item) => item.id === "remove-from-collection")!
      .onSelect();
    expect(spies.onRemoveFromCollection).toHaveBeenCalled();
  });
});

describe("the marks a menu starts on (favorites fix A)", () => {
  it("reads the rating and favorite from the rows when every target is in hand", () => {
    expect(targetMarks([{ effective_rating: 4, favorite: true }, { effective_rating: 4, favorite: true }], 2)).toEqual({ rating: 4, favorite: true });
    expect(targetMarks([{ effective_rating: 4, favorite: false }, { effective_rating: 2, favorite: false }], 2)).toEqual({ rating: null, favorite: false });
    expect(targetMarks([{ effective_rating: 3, favorite: true }, { effective_rating: 3, favorite: false }], 2)).toEqual({ rating: 3, favorite: null });
  });

  // An everything-matching selection of 50,000 brings only the loaded page: favorited rows there say
  // nothing about the rest, so both Add and Remove must stay on offer.
  it("knows nothing when the rows are only part of the target", () => {
    const loaded = [{ effective_rating: 5, favorite: true }, { effective_rating: 5, favorite: true }];
    expect(targetMarks(loaded, 50_000)).toEqual({ rating: null, favorite: null });
    expect(targetMarks([], 3)).toEqual({ rating: null, favorite: null });
  });
});

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

import { organizationMenuItems, type OrganizationMenuHandlers } from "./trackMenu";

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
      "Add to Collection…",
      "Add tag…",
      "Remove tag…",
      "Rate",
      "Favorite",
      "Remove favorite",
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

  it("separates itself from whatever is above it", () => {
    const [first] = organizationMenuItems(IN_LIBRARY, handlers());
    expect(first!.separatorBefore).toBe(true);
  });
});

describe("the rating submenu", () => {
  it("is a list rather than six more rows", () => {
    const rate = organizationMenuItems(IN_LIBRARY, handlers()).find(
      (item) => item.id === "rate",
    );
    expect(labels(rate!.items!)).toEqual(["★", "★★", "★★★", "★★★★", "★★★★★", "Clear rating"]);
  });

  it("sets the number of stars that was chosen", () => {
    const spies = handlers();
    const rate = organizationMenuItems(IN_LIBRARY, spies).find((item) => item.id === "rate");
    rate!.items!.find((item) => item.id === "rate-4")!.onSelect();
    expect(spies.onRate).toHaveBeenCalledWith(4);
  });

  it("clears rather than rating zero (DEC-057)", () => {
    // Clearing falls back to Rekordbox's rating; zero is a rating of its own.
    const spies = handlers();
    const rate = organizationMenuItems(IN_LIBRARY, spies).find((item) => item.id === "rate");
    rate!.items!.find((item) => item.id === "rate-clear")!.onSelect();
    expect(spies.onRate).toHaveBeenCalledWith(null);
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

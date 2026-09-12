/**
 * Tending the tag vocabulary (ORG-12).
 *
 * The property worth the most: **a gesture that cannot be taken back says its
 * number before it runs.** Deleting a tag and taking it off 412 tracks are the
 * same action, and only one of them is a question anybody can answer. The
 * number is the engine's usage count, never one counted from what is on
 * screen.
 */
import { describe, expect, it } from "vitest";

import type { Tag, TagUsage } from "../../api/cuepointBridge.types";
import {
  TAG_CATEGORY_MAX_LENGTH,
  TAG_COLOURS,
  TAG_NAME_MAX_LENGTH,
  checkDraft,
  colourLabel,
  colourVariable,
  deletedLine,
  describeDelete,
  describeMerge,
  draftOf,
  hasChanges,
  mergedLine,
  sortedTags,
  tagHint,
  tagPatch,
} from "./tagManager";

function tag(over: Partial<TagUsage> = {}): TagUsage {
  return {
    id: 1,
    name: "Peak-time",
    category: "Energy",
    colour: "danger",
    created_at: "2026-01-01T00:00:00Z",
    track_count: 412,
    ...over,
  };
}

function plain(over: Partial<Tag> = {}): Tag {
  const { track_count: _count, ...rest } = tag();
  return { ...rest, ...over };
}

describe("what is sent when a tag is saved", () => {
  it("sends nothing at all when nothing was typed", () => {
    const before = plain();
    expect(tagPatch(before, draftOf(before))).toEqual({});
    expect(hasChanges(tagPatch(before, draftOf(before)))).toBe(false);
  });

  it("sends only the name when only the name changed", () => {
    // Not all three: the update route writes a field when its key is present,
    // and three keys would record three history entries for one rename.
    expect(tagPatch(plain(), { name: "Peak time", category: "Energy", colour: "danger" }))
      .toEqual({ name: "Peak time" });
  });

  it("sends only the colour when only the colour changed", () => {
    expect(tagPatch(plain(), { name: "Peak-time", category: "Energy", colour: "info" }))
      .toEqual({ colour: "info" });
  });

  it("clears a category with null rather than with an empty string", () => {
    // `category: null` clears it and leaving it out says nothing about it.
    // An empty string would be a category whose name is nothing.
    expect(tagPatch(plain(), { name: "Peak-time", category: "  ", colour: "danger" }))
      .toEqual({ category: null });
  });

  it("clears a colour with null", () => {
    expect(tagPatch(plain(), { name: "Peak-time", category: "Energy", colour: null }))
      .toEqual({ colour: null });
  });

  it("trims a name rather than saving the spaces around it", () => {
    expect(tagPatch(plain(), { name: "  Closer  ", category: "Energy", colour: "danger" }))
      .toEqual({ name: "Closer" });
  });

  it("sends all three when all three changed", () => {
    expect(tagPatch(plain(), { name: "Closer", category: "Mood", colour: "info" })).toEqual({
      name: "Closer",
      category: "Mood",
      colour: "info",
    });
  });

  it("reads a tag with no category into an empty box, not into the word null", () => {
    expect(draftOf(plain({ category: null }))).toEqual({
      name: "Peak-time",
      category: "",
      colour: "danger",
    });
  });
});

describe("a draft the engine would refuse", () => {
  const ok = { name: "Peak-time", category: "Energy", colour: "danger" };

  it("takes a good one", () => {
    expect(checkDraft(ok)).toEqual({ ok: true });
  });

  it("refuses a name of nothing", () => {
    expect(checkDraft({ ...ok, name: "   " })).toEqual({
      ok: false,
      reason: "A tag needs a name",
    });
  });

  it("refuses a name longer than the engine takes", () => {
    expect(checkDraft({ ...ok, name: "x".repeat(TAG_NAME_MAX_LENGTH + 1) }).ok).toBe(false);
    expect(checkDraft({ ...ok, name: "x".repeat(TAG_NAME_MAX_LENGTH) }).ok).toBe(true);
  });

  it("refuses a category longer than the engine takes", () => {
    expect(
      checkDraft({ ...ok, category: "x".repeat(TAG_CATEGORY_MAX_LENGTH + 1) }).ok,
    ).toBe(false);
  });

  it("refuses a colour that is not one of the engine's tokens", () => {
    expect(checkDraft({ ...ok, colour: "#ff0000" })).toEqual({
      ok: false,
      reason: "That is not a colour a tag can have",
    });
  });

  it("takes every colour the engine has", () => {
    for (const colour of TAG_COLOURS) {
      expect(checkDraft({ ...ok, colour }).ok).toBe(true);
    }
  });

  it("takes no colour at all", () => {
    expect(checkDraft({ ...ok, colour: null }).ok).toBe(true);
  });
});

describe("a colour is a token, not a colour", () => {
  it("paints from the theme's accent rather than from a hex value", () => {
    expect(colourVariable("danger")).toBe("var(--accent-danger)");
  });

  it("paints nothing for a tag with no colour", () => {
    expect(colourVariable(null)).toBeUndefined();
  });

  it("paints nothing for a token it has never heard of", () => {
    // A token from a newer build would otherwise become `var(--accent-<junk>)`,
    // which resolves to nothing and paints the swatch the panel's colour.
    expect(colourVariable("chartreuse")).toBeUndefined();
  });

  it("names every token in words", () => {
    for (const colour of TAG_COLOURS) {
      expect(colourLabel(colour)).not.toBe(colour);
    }
    expect(colourLabel(null)).toBe("None");
  });
});

describe("what a destructive gesture says first", () => {
  it("names the tracks a delete takes it off", () => {
    expect(describeDelete(tag({ track_count: 412 }))).toBe(
      "Delete “Peak-time”? It comes off 412 tracks, and there is no undo.",
    );
  });

  it("counts one track as one", () => {
    expect(describeDelete(tag({ track_count: 1 }))).toContain("1 track,");
  });

  it("says so when a delete costs nothing", () => {
    // A tag nobody used is a tidy-up, and warning about it teaches people to
    // click through warnings.
    expect(describeDelete(tag({ track_count: 0 }))).toBe(
      "Delete “Peak-time”? Nothing is tagged with it.",
    );
  });

  it("says a merge deletes the tag it merges from", () => {
    const said = describeMerge(
      tag({ id: 1, name: "Peak Time", track_count: 40 }),
      tag({ id: 2, name: "Peak-time", track_count: 412 }),
    );
    expect(said).toContain("40 tracks move across");
    expect(said).toContain("“Peak Time” is deleted");
  });

  it("counts the tracks that move, not the ones at the destination", () => {
    // The source's count is what changes. The target's is what it already had.
    const said = describeMerge(
      tag({ id: 1, name: "A", track_count: 3 }),
      tag({ id: 2, name: "B", track_count: 900 }),
    );
    expect(said).toContain("3 tracks");
    expect(said).not.toContain("900");
  });
});

describe("what it says afterwards", () => {
  it("reports the engine's count rather than the one it warned about", () => {
    expect(deletedLine("Peak-time", 412)).toBe("Deleted “Peak-time” — 412 tracks lost it.");
  });

  it("says nothing about tracks when none were touched", () => {
    expect(deletedLine("Peak-time", 0)).toBe("Deleted “Peak-time”.");
  });

  it("reports what a merge moved", () => {
    expect(mergedLine("Peak Time", "Peak-time", 40)).toBe(
      "Merged “Peak Time” into “Peak-time” — 40 tracks moved.",
    );
  });

  it("says a merge that moved nothing still happened", () => {
    // Every track already had both tags. The source is gone either way.
    expect(mergedLine("A", "B", 0)).toBe("Merged “A” into “B”.");
  });
});

describe("the order a manager shows them in", () => {
  it("groups by category, then by name", () => {
    const ordered = sortedTags([
      tag({ id: 1, name: "Warm-up", category: "Set position" }),
      tag({ id: 2, name: "Peak-time", category: "Energy" }),
      tag({ id: 3, name: "Closer", category: "Set position" }),
    ]);
    expect(ordered.map((entry) => entry.name)).toEqual(["Peak-time", "Closer", "Warm-up"]);
  });

  it("puts the uncategorized last, where the work still to do is", () => {
    const ordered = sortedTags([
      tag({ id: 1, name: "Loose", category: null }),
      tag({ id: 2, name: "Peak-time", category: "Energy" }),
    ]);
    expect(ordered.map((entry) => entry.name)).toEqual(["Peak-time", "Loose"]);
  });

  it("leaves what it was given alone", () => {
    const given = [tag({ id: 2, name: "B" }), tag({ id: 1, name: "A" })];
    sortedTags(given);
    expect(given.map((entry) => entry.name)).toEqual(["B", "A"]);
  });

  it("reads a tag as its category and its use", () => {
    expect(tagHint(tag({ category: "Energy", track_count: 412 }))).toBe("Energy · 412 tracks");
  });

  it("says only the use for one with no category", () => {
    expect(tagHint(tag({ category: null, track_count: 1 }))).toBe("1 track");
  });
});

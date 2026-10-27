/**
 * The one list behind the selection bar and the right-click menu (FLW-8, LIB-6).
 *
 * The bar draws each group as a button that opens that group's entries; the
 * menu draws the same groups as submenus. They cannot drift because both are
 * read from `trackActionGroups`, and these tests hold that: the same ids in the
 * same order, every entry reaching its handler, and the reasons an entry is
 * disabled.
 */
import { describe, expect, it, vi } from "vitest";

import type { TrackCreditLinks } from "../../api/cuepointBridge.types";
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";
import {
  ACTION_GROUPS,
  groupMenuId,
  menuFromGroups,
  trackActionGroups,
  type TrackActionHandlers,
} from "./trackActions";

function handlers() {
  return {
    play: { onPlay: vi.fn(), onPlayNext: vi.fn(), onAddToQueue: vi.fn() },
    organization: {
      onAddToCollection: vi.fn(),
      onAddToSet: vi.fn(),
      onNewSetFromSelection: vi.fn(),
      onRemoveFromCollection: vi.fn(),
      onAddTag: vi.fn(),
      onRemoveTag: vi.fn(),
      onRate: vi.fn(),
      onFavorite: vi.fn(),
    },
    explore: { onSimilar: vi.fn(), onOpenPage: vi.fn() },
    beatport: { onMatch: vi.fn(), onReview: vi.fn(), onUseBeatport: vi.fn() },
    fix: { onEdit: vi.fn(), onWriteTags: vi.fn() },
    more: { onCopy: vi.fn(), onReveal: vi.fn() },
  } satisfies TrackActionHandlers;
}

const CREDITS = {
  artists: [
    {
      kind: "artist",
      name: "Mara Veil",
      ref: "mara-veil",
      role: "artist",
      identity: "beatport",
    },
  ],
  remixers: [],
  label: {
    kind: "label",
    name: "Warm Records",
    ref: "warm-records",
    role: null,
    identity: "beatport",
  },
} as unknown as TrackCreditLinks;

const IN_COLLECTION = { count: 3, collection: { id: 4, name: "Closers" }, credits: CREDITS, revealable: true };

function labels(items: TrackContextMenuItem[]): string[] {
  return items.map((item) => item.label);
}

function leaves(items: TrackContextMenuItem[]): TrackContextMenuItem[] {
  return items.flatMap((item) => (item.items ? leaves(item.items) : [item]));
}

describe("the groups", () => {
  it("are Play, Organize, Beatport and More, in that order", () => {
    expect(ACTION_GROUPS.map((group) => group.label)).toEqual([
      "Play",
      "Organize",
      "Beatport",
      "More",
    ]);
    const groups = trackActionGroups(IN_COLLECTION, handlers());
    expect(groups.map((group) => group.label)).toEqual(ACTION_GROUPS.map((group) => group.label));
  });

  it("hold exactly what the spec's table lists", () => {
    const groups = trackActionGroups(IN_COLLECTION, handlers());
    const by = Object.fromEntries(groups.map((group) => [group.id, labels(group.items)]));
    expect(by.play).toEqual(["Play 3 tracks", "Play next", "Add to queue"]);
    expect(by.organize).toEqual([
      "Add to a Collection…",
      "Add to a Set…",
      "New Set from 3 tracks…",
      "Remove from “Closers”",
      "Add tag…",
      "Remove tag…",
    ]);
    // M299: Rate (the stars row) and the favorites are the menu's top level, not the bar's Organize.
    const organize = groups.find((group) => group.id === "organize")!;
    expect(labels(organize.quick ?? [])).toEqual(["Rate", "Add to favorites", "Remove from favorites"]);
    expect(by.beatport).toEqual(["Match on Beatport…", "Review these matches", "Use Beatport values…"]);
    expect(by.more).toEqual([
      "Similar tracks",
      "Artist page",
      "Label page",
      "Edit values…",
      "Sync to files…",
      "Copy 3 tracks as text",
      "Show in folder",
    ]);
  });

  it("keeps a divider between More's explore entries and the rest", () => {
    const more = trackActionGroups(IN_COLLECTION, handlers()).find((group) => group.id === "more")!;
    expect(more.items.filter((item) => item.separatorBefore).map((item) => item.label)).toEqual([
      "Edit values…",
    ]);
  });

  it("offers no file check, which is Clean ▸ Missing files'", () => {
    const all = trackActionGroups(IN_COLLECTION, handlers()).flatMap((group) => labels(group.items));
    expect(all).not.toContain("Check the files are still there");
  });

  it("no longer offer Accept or Reject, which are Review's job", () => {
    const all = trackActionGroups(IN_COLLECTION, handlers()).flatMap((group) => labels(group.items));
    expect(all).not.toContain("Accept match");
    expect(all).not.toContain("Reject match");
    expect(all).not.toContain("Search Beatport again for this track");
  });

  it("keep the Explore entries for several tracks, which act on the first", () => {
    const more = trackActionGroups({ ...IN_COLLECTION, count: 5 }, handlers()).find(
      (group) => group.id === "more",
    )!;
    expect(labels(more.items).slice(0, 3)).toEqual(["Similar tracks", "Artist page", "Label page"]);
  });

  it("leave out what this build cannot do", () => {
    const partial = handlers();
    const groups = trackActionGroups(
      { count: 2, collection: null, credits: null, revealable: false },
      { organization: partial.organization, more: { onCopy: vi.fn(), onReveal: null } },
    );
    const by = Object.fromEntries(groups.map((group) => [group.id, group.items]));
    expect(by.play).toEqual([]);
    expect(by.beatport).toEqual([]);
    // Neither explore nor fix entries: More holds Copy as text and Show in folder, with no divider.
    expect(by.more!.map((item) => item.id)).toEqual(["copy", "reveal"]);
    // Show in folder is shown and disabled for several tracks: one file, one folder.
    expect(by.more!.find((item) => item.id === "reveal")?.disabled).toBe(true);
  });

  it("have no divider along the top of any group", () => {
    for (const group of trackActionGroups(IN_COLLECTION, handlers())) {
      expect(group.items[0]?.separatorBefore ?? false).toBe(false);
    }
  });
});

describe("one list behind both surfaces", () => {
  it("makes the menu from the very same groups: Play on top, every other group a parent", () => {
    const groups = trackActionGroups(IN_COLLECTION, handlers());
    const menu = menuFromGroups(groups);
    const play = groups.find((group) => group.id === "play")!;
    const rest = groups.filter((group) => group.id !== "play");

    // Top level (D26, M410): Play's three entries, Rate and the favorites lifted out of Organize, the
    // Library's own groups with no heading, then More last.
    const page = rest.filter((group) => group.id !== "more");
    expect(labels(menu)).toEqual([
      ...labels(play.items),
      "Rate",
      "Add to favorites",
      "Remove from favorites",
      ...page.map((group) => group.label),
      "More",
    ]);
    expect(menu.slice(0, play.items.length).map((item) => item.id)).toEqual(
      play.items.map((item) => item.id),
    );
    // Each parent holds the bar's entries for that group, ids and labels alike.
    for (const group of rest) {
      const parent = menu.find((item) => item.id === groupMenuId(group.id))!;
      expect(parent.label).toBe(group.label);
      // Rate and the favorites are not in Organize (M299); the menu shows them one level up.
      expect(parent.items!.map((item) => item.id)).toEqual(group.items.map((item) => item.id));
      expect(labels(parent.items!)).toEqual(labels(group.items));
    }
  });

  it("lifts Rate, an inline stars row, and Favorite to the menu's top level and keeps Organize to seven or fewer (D26, M299)", () => {
    const menu = menuFromGroups(trackActionGroups(IN_COLLECTION, handlers()));
    expect(menu.find((item) => item.id === "rate")?.kind).toBe("stars");
    expect(menu.some((item) => item.id === "favorite")).toBe(true);
    const organize = menu.find((item) => item.id === groupMenuId("organize"))!;
    expect(organize.items!.length).toBeLessThanOrEqual(7);
    expect(organize.items!.some((item) => item.id === "rate")).toBe(false);
  });

  it("puts a divider above the first parent, and none above the first line", () => {
    const menu = menuFromGroups(trackActionGroups(IN_COLLECTION, handlers()));
    expect(menu[0]!.separatorBefore).toBeFalsy();
    const first = menu.find((item) => item.id === groupMenuId("organize"))!;
    expect(first.separatorBefore).toBe(true);
    // No "This page" heading (M410): dividers alone.
    expect(first.groupTitle).toBeUndefined();
    expect(menu.find((item) => item.id === groupMenuId("more"))!.separatorBefore).toBe(true);
  });

  it("leaves no parent for a group with nothing to offer", () => {
    const partial = handlers();
    const menu = menuFromGroups(
      trackActionGroups(
        { count: 2, collection: null, credits: null, revealable: false },
        { organization: partial.organization, more: { onCopy: vi.fn(), onReveal: null } },
      ),
    );
    expect(labels(menu)).toEqual(["Rate", "Add to favorites", "Remove from favorites", "Organize", "More"]);
  });

  it("is built by the same function for one track, a few and many", () => {
    for (const count of [1, 2, 40_000]) {
      const groups = trackActionGroups({ ...IN_COLLECTION, count }, handlers());
      const menu = menuFromGroups(groups);
      // Same entries; Rate and the favorites (each group's quick ones) sit at the menu's top.
      expect(leaves(menu).map((item) => item.id).sort()).toEqual(
        leaves(groups.flatMap((group) => [...(group.quick ?? []), ...group.items])).map((item) => item.id).sort(),
      );
    }
  });
});

describe("every entry reaches its action", () => {
  it("calls the handler it is named for", () => {
    const spies = handlers();
    const groups = trackActionGroups(IN_COLLECTION, spies);
    const all = leaves(groups.flatMap((group) => [...(group.quick ?? []), ...group.items]));
    const pick = (id: string) => all.find((item) => item.id === id)!.onSelect();

    pick("play");
    pick("play-next");
    pick("add-to-queue");
    expect([spies.play.onPlay, spies.play.onPlayNext, spies.play.onAddToQueue].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);

    pick("add-to-collection");
    pick("add-to-set");
    pick("new-set-from-selection");
    pick("remove-from-collection");
    pick("add-tag");
    pick("remove-tag");
    // The stars row rates through its own callback (M299).
    all.find((item) => item.id === "rate")!.onRate!(3);
    pick("favorite");
    pick("unfavorite");
    for (const spy of [
      spies.organization.onAddToCollection,
      spies.organization.onAddToSet,
      spies.organization.onNewSetFromSelection,
      spies.organization.onRemoveFromCollection,
      spies.organization.onAddTag,
      spies.organization.onRemoveTag,
    ]) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
    expect(spies.organization.onRate).toHaveBeenCalledWith(3);
    expect(spies.organization.onFavorite.mock.calls).toEqual([[true], [false]]);

    pick("similar-tracks");
    pick("artist-page");
    pick("label-page");
    expect(spies.explore.onSimilar).toHaveBeenCalledTimes(1);
    expect(spies.explore.onOpenPage.mock.calls).toEqual([
      ["artist", "mara-veil"],
      ["label", "warm-records"],
    ]);

    pick("beatport-match");
    pick("beatport-review");
    pick("beatport-values");
    pick("fix-edit");
    pick("fix-write-tags");
    for (const spy of [
      spies.beatport.onMatch,
      spies.beatport.onReview,
      spies.beatport.onUseBeatport,
      spies.fix.onEdit,
      spies.fix.onWriteTags,
    ]) {
      expect(spy).toHaveBeenCalledTimes(1);
    }

    pick("copy");
    pick("reveal");
    expect(spies.more.onCopy).toHaveBeenCalledTimes(1);
    expect(spies.more.onReveal).toHaveBeenCalledTimes(1);
  });
});

describe("with nothing selected", () => {
  it("builds every group and disables every entry, saying why", () => {
    const groups = trackActionGroups(
      { count: 0, collection: null, credits: null, revealable: false },
      handlers(),
    );
    expect(groups.map((group) => group.id)).toEqual(ACTION_GROUPS.map((group) => group.id));
    for (const group of groups) {
      expect(group.disabledReason).toBe("Select tracks first");
    }
  });

  it("gives no reason once something is selected", () => {
    for (const group of trackActionGroups(IN_COLLECTION, handlers())) {
      expect(group.disabledReason).toBeNull();
    }
  });
});

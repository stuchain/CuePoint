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
    fix: { onEdit: vi.fn(), onWriteTags: vi.fn(), onCheckFiles: vi.fn() },
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
  it("are Play, Organize, Explore, Beatport, Fix and More, in that order", () => {
    expect(ACTION_GROUPS.map((group) => group.label)).toEqual([
      "Play",
      "Organize",
      "Explore",
      "Beatport",
      "Fix",
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
      "Add to Collection…",
      "Add to Set…",
      "New Set from these…",
      "Remove from “Closers”",
      "Add tag…",
      "Remove tag…",
      "Rate",
      "Favorite",
      "Remove favorite",
    ]);
    expect(by.explore).toEqual(["Similar tracks", "Artist page", "Label page"]);
    expect(by.beatport).toEqual(["Match tracks…", "Review these matches", "Use Beatport's values…"]);
    expect(by.fix).toEqual([
      "Edit values…",
      "Save changes into the files…",
      "Check the files are still there",
    ]);
    expect(by.more).toEqual(["Copy 3 tracks", "Show in folder"]);
  });

  it("no longer offer Accept or Reject, which are Review's job", () => {
    const all = trackActionGroups(IN_COLLECTION, handlers()).flatMap((group) => labels(group.items));
    expect(all).not.toContain("Accept match");
    expect(all).not.toContain("Reject match");
    expect(all).not.toContain("Search Beatport again for this track");
  });

  it("keep the Explore entries for several tracks, which act on the first", () => {
    const explore = trackActionGroups({ ...IN_COLLECTION, count: 5 }, handlers()).find(
      (group) => group.id === "explore",
    )!;
    expect(labels(explore.items)).toEqual(["Similar tracks", "Artist page", "Label page"]);
  });

  it("leave out what this build cannot do", () => {
    const partial = handlers();
    const groups = trackActionGroups(
      { count: 2, collection: null, credits: null, revealable: false },
      { organization: partial.organization, more: { onCopy: vi.fn(), onReveal: null } },
    );
    const by = Object.fromEntries(groups.map((group) => [group.id, group.items]));
    expect(by.play).toEqual([]);
    expect(by.explore).toEqual([]);
    expect(by.beatport).toEqual([]);
    expect(by.fix).toEqual([]);
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

    // Top level: Play's three entries, then one parent per other group.
    expect(labels(menu)).toEqual([...labels(play.items), ...rest.map((group) => group.label)]);
    expect(menu.slice(0, play.items.length).map((item) => item.id)).toEqual(
      play.items.map((item) => item.id),
    );
    // Each parent holds the bar's entries for that group, ids and labels alike.
    for (const group of rest) {
      const parent = menu.find((item) => item.id === groupMenuId(group.id))!;
      expect(parent.label).toBe(group.label);
      expect(parent.items!.map((item) => item.id)).toEqual(group.items.map((item) => item.id));
      expect(labels(parent.items!)).toEqual(labels(group.items));
    }
  });

  it("keeps Rate inside Organize, as a submenu of its own", () => {
    const menu = menuFromGroups(trackActionGroups(IN_COLLECTION, handlers()));
    const organize = menu.find((item) => item.id === groupMenuId("organize"))!;
    expect(organize.items!.find((item) => item.id === "rate")?.items?.length).toBeGreaterThan(1);
  });

  it("puts a divider above the first parent, and none above the first line", () => {
    const menu = menuFromGroups(trackActionGroups(IN_COLLECTION, handlers()));
    expect(menu[0]!.separatorBefore).toBeFalsy();
    expect(menu.find((item) => item.id === groupMenuId("organize"))!.separatorBefore).toBe(true);
  });

  it("leaves no parent for a group with nothing to offer", () => {
    const partial = handlers();
    const menu = menuFromGroups(
      trackActionGroups(
        { count: 2, collection: null, credits: null, revealable: false },
        { organization: partial.organization, more: { onCopy: vi.fn(), onReveal: null } },
      ),
    );
    expect(labels(menu)).toEqual(["Organize", "More"]);
  });

  it("is built by the same function for one track, a few and many", () => {
    for (const count of [1, 2, 40_000]) {
      const groups = trackActionGroups({ ...IN_COLLECTION, count }, handlers());
      const menu = menuFromGroups(groups);
      expect(leaves(menu).map((item) => item.id)).toEqual(
        leaves(groups.flatMap((group) => group.items)).map((item) => item.id),
      );
    }
  });
});

describe("every entry reaches its action", () => {
  it("calls the handler it is named for", () => {
    const spies = handlers();
    const groups = trackActionGroups(IN_COLLECTION, spies);
    const pick = (id: string) => leaves(groups.flatMap((group) => group.items)).find((item) => item.id === id)!.onSelect();

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
    pick("rate-3");
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
    pick("fix-check");
    for (const spy of [
      spies.beatport.onMatch,
      spies.beatport.onReview,
      spies.beatport.onUseBeatport,
      spies.fix.onEdit,
      spies.fix.onWriteTags,
      spies.fix.onCheckFiles,
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

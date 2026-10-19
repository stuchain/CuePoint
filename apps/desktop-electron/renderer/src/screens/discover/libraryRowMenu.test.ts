/**
 * The right-click menu and the selection bar of Discover's library rows are one
 * list (FLW-8): the menu is the bar's groups, so it cannot show more or less.
 */
import { describe, expect, it, vi } from "vitest";

import type { TrackContextMenuItem } from "../../components/TrackContextMenu";
import { barGroups, groupMenuId, playItems, type TrackActionGroupId } from "../library/trackActions";
import { beatportPageItems, libraryRowMenu } from "./libraryRowMenu";

const labels = (items: readonly TrackContextMenuItem[]) => items.map((item) => item.label);

function entries(group: TrackActionGroupId): TrackContextMenuItem[] {
  const item = (id: string, label: string): TrackContextMenuItem => ({ id, label, onSelect: vi.fn() });
  if (group === "play") {
    return playItems(2, { onPlay: vi.fn(), onPlayNext: vi.fn(), onAddToQueue: vi.fn() });
  }
  if (group === "more") {
    return [
      item("similar", "Similar tracks"),
      item("artist-page", "Artist page"),
      item("copy", "Copy"),
      item("reveal", "Show in folder"),
    ];
  }
  return [];
}

describe("the menu of a page's library rows", () => {
  for (const ids of [
    ["play", "more"],
    ["play"],
  ] as const) {
    it(`has the bar's buttons (${ids.join(", ")}) as its groups, whatever the selection`, () => {
      for (const count of [1, 2, 900]) {
        const menu = libraryRowMenu(ids, count, entries);
        const bar = barGroups(count, ids);
        const rest = bar.filter((group) => group.id !== "play");
        // Play's entries on top, then one submenu per other button, in the bar's order.
        expect(labels(menu)).toEqual([...labels(entries("play")), ...rest.map((group) => group.label)]);
        for (const group of rest) {
          const parent = menu.find((item) => item.id === groupMenuId(group.id))!;
          expect(parent.items!.map((item) => item.id)).toEqual(entries(group.id).map((item) => item.id));
          expect(labels(parent.items!)).toEqual(labels(entries(group.id)));
        }
      }
    });
  }

  it("is empty for no tracks", () => {
    expect(libraryRowMenu(["play", "more"], 0, entries)).toEqual([]);
  });

  it("leaves out a group with nothing to offer, as the Library's menu does", () => {
    const menu = libraryRowMenu(["play", "more"], 1, (group) => (group === "more" ? [] : entries(group)));
    expect(labels(menu)).toEqual(labels(entries("play")));
  });
});

describe("the page entries of a Beatport row (C196)", () => {
  const row = (over: Partial<Parameters<typeof beatportPageItems>[0]> = {}) => ({
    artists: ["Mara Veil"],
    remixers: [] as string[],
    label_id: 40211 as number | null,
    label_name: "Night Shift" as string | null,
    ...over,
  });

  it("opens the one artist's page by name, and the label's by its Beatport id", () => {
    const open = vi.fn();
    const items = beatportPageItems(row(), open);
    expect(labels(items)).toEqual(["Open artist page", "Open label page"]);
    items[0]!.onSelect();
    items[1]!.onSelect();
    expect(open).toHaveBeenNthCalledWith(1, "artist", "name:Mara Veil");
    expect(open).toHaveBeenNthCalledWith(2, "label", "bp:40211");
  });

  it("holds each artist and remixer once in a submenu when there are several", () => {
    const open = vi.fn();
    const [artist] = beatportPageItems(row({ artists: ["Mara Veil", "DJEFF"], remixers: ["Kiko", "Mara Veil"] }), open);
    expect(artist!.label).toBe("Open artist page");
    expect(labels(artist!.items ?? [])).toEqual(["Mara Veil", "DJEFF", "Kiko (remixer)"]);
    artist!.items![2]!.onSelect();
    expect(open).toHaveBeenCalledWith("artist", "name:Kiko");
  });

  it("opens a label with no Beatport id by name, and greys the entry of what the row lacks", () => {
    const open = vi.fn();
    const [, label] = beatportPageItems(row({ label_id: null }), open);
    label!.onSelect();
    expect(open).toHaveBeenCalledWith("label", "name:Night Shift");
    const none = beatportPageItems(row({ artists: [], label_name: null, label_id: null }), open);
    expect(none.map((item) => item.disabled)).toEqual([true, true]);
  });
});

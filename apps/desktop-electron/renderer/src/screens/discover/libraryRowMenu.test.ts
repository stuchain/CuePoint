/**
 * The right-click menu and the selection bar of Discover's library rows are one
 * list (FLW-8): the menu is the bar's groups, so it cannot show more or less.
 */
import { describe, expect, it, vi } from "vitest";

import type { TrackContextMenuItem } from "../../components/TrackContextMenu";
import { barGroups, groupMenuId, playItems, type TrackActionGroupId } from "../library/trackActions";
import { libraryRowMenu } from "./libraryRowMenu";

const labels = (items: readonly TrackContextMenuItem[]) => items.map((item) => item.label);

function entries(group: TrackActionGroupId): TrackContextMenuItem[] {
  const item = (id: string, label: string): TrackContextMenuItem => ({ id, label, onSelect: vi.fn() });
  if (group === "play") {
    return playItems(2, { onPlay: vi.fn(), onPlayNext: vi.fn(), onAddToQueue: vi.fn() });
  }
  if (group === "explore") return [item("similar", "Similar tracks"), item("artist-page", "Artist page")];
  if (group === "more") return [item("copy", "Copy"), item("reveal", "Show in folder")];
  return [];
}

describe("the menu of a page's library rows", () => {
  for (const ids of [
    ["play", "explore", "more"],
    ["play", "explore"],
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
    expect(libraryRowMenu(["play", "explore"], 0, entries)).toEqual([]);
  });

  it("leaves out a group with nothing to offer, as the Library's menu does", () => {
    const menu = libraryRowMenu(["play", "explore"], 1, (group) => (group === "explore" ? [] : entries(group)));
    expect(labels(menu)).toEqual(labels(entries("play")));
  });
});

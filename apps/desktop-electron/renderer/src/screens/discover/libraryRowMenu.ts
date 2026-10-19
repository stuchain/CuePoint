/**
 * What a library row offers off the Library page (DISCOVER-11, FLW-8).
 *
 * An Artist or Label page's library half and a Similar tracks list hold
 * library rows, so a row plays and queues as it does in the Library (DEC-012,
 * DEC-013) and leads to its Similar tracks and its pages. The organization
 * entries stay the Library's: tagging and collecting from a page would be a
 * second Library, and **Open in Library** is one click away.
 *
 * The menu is the selection bar's groups, drawn as the Library's menu draws
 * its own (`menuFromGroups`): Play's entries on top, then one submenu for each
 * of the bar's other buttons. A page gives the one function that builds a
 * group's entries, and both the bar and this menu call it, so the two cannot
 * differ.
 */
import type { BeatportTrackRow, EntityKind } from "../../api/cuepointBridge.types";
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";
import { barGroups, menuFromGroups, type TrackActionGroupId } from "../library/trackActions";
import { beatportRef, nameRef } from "./discoverLinks";

/**
 * The right-click menu for `count` tracks of a page whose bar holds `ids`.
 * `build` answers the entries of one group, as the bar's button opens them.
 */
export function libraryRowMenu(
  ids: readonly TrackActionGroupId[],
  count: number,
  build: (group: TrackActionGroupId) => TrackContextMenuItem[],
): TrackContextMenuItem[] {
  if (count <= 0) return [];
  return menuFromGroups(barGroups(count, ids).map((group) => ({ ...group, items: build(group.id) })));
}

/**
 * The page entries of a Beatport row's menu (C196). Names in the table are plain text, as in the
 * Library; the way to an artist's or label's page is the row menu. A row carries artist names
 * only, so an artist opens by name and the engine answers the page's own address (DEC-095); a
 * label has its Beatport id on the row and opens by that. An entry the row cannot fill is greyed
 * rather than missing, so the menu keeps its shape.
 */
export function beatportPageItems(
  row: Pick<BeatportTrackRow, "artists" | "remixers" | "label_id" | "label_name">,
  open: (kind: EntityKind, ref: string) => void,
): TrackContextMenuItem[] {
  const people = [
    ...row.artists.map((name) => ({ name, remixer: false })),
    ...row.remixers.map((name) => ({ name, remixer: true })),
  ].filter((person, at, all) => all.findIndex((other) => other.name === person.name) === at);
  const artist: TrackContextMenuItem =
    people.length === 0
      ? { id: "artist-page", label: "Open artist page", disabled: true, onSelect: () => undefined }
      : people.length === 1
        ? { id: "artist-page", label: "Open artist page", onSelect: () => open("artist", nameRef(people[0]!.name)) }
        : {
            id: "artist-page",
            label: "Open artist page",
            onSelect: () => undefined,
            items: people.map((person, index) => ({
              id: `artist-page-${index}`,
              label: person.remixer ? `${person.name} (remixer)` : person.name,
              onSelect: () => open("artist", nameRef(person.name)),
            })),
          };
  const name = row.label_name;
  const label: TrackContextMenuItem = name
    ? {
        id: "label-page",
        label: "Open label page",
        onSelect: () => open("label", row.label_id != null ? beatportRef(row.label_id) : nameRef(name)),
      }
    : { id: "label-page", label: "Open label page", disabled: true, onSelect: () => undefined };
  return [artist, label];
}

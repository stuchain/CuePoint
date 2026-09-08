/**
 * What can be done to a selection of tracks (ORG-11).
 *
 * One list, built once, offered from two places: the row context menu and the
 * selection toolbar's Actions button. They are the same entries because they
 * are literally the same array — the spec's "one vocabulary for both surfaces"
 * is a fact about this module rather than a promise about two components
 * staying in step.
 *
 * It is pure on purpose. What the menu offers in a Collection, in a Smart
 * Collection and in the library are three different lists, and the difference
 * is the kind of thing that is easy to get subtly wrong and impossible to see
 * without opening a menu in each of three states.
 */
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";
import { RATING_STARS } from "./trackEdits";

/** Where the table is scoped, as far as these entries are concerned. */
export interface OrganizationMenuContext {
  /** How many tracks the entries will apply to. */
  count: number;
  /**
   * The Collection the table is showing, when it is one that holds rows.
   *
   * Null for the library, for a Rekordbox playlist and for a Smart Collection
   * — the last because a Smart Collection holds a question, and ORG-06 refuses
   * membership operations on one. The UI does not offer what the engine will
   * not do (DEC-061).
   */
  collection: { id: number; name: string } | null;
}

export interface OrganizationMenuHandlers {
  onAddToCollection: () => void;
  onRemoveFromCollection: () => void;
  onAddTag: () => void;
  onRemoveTag: () => void;
  /** null clears the CuePoint rating rather than setting it to zero (DEC-057). */
  onRate: (stars: number | null) => void;
  onFavorite: (favorite: boolean) => void;
}

/** "★★★", the same glyphs the rest of the app rates with. */
function stars(count: number): string {
  return "★".repeat(count);
}

/**
 * The organization entries, in the order they are read.
 *
 * Playback comes first in the assembled menu — DEC-013 made it first-class —
 * so these begin with a separator and are appended by the caller.
 */
export function organizationMenuItems(
  context: OrganizationMenuContext,
  handlers: OrganizationMenuHandlers,
): TrackContextMenuItem[] {
  if (context.count <= 0) return [];

  const items: TrackContextMenuItem[] = [
    {
      id: "add-to-collection",
      label: "Add to Collection…",
      separatorBefore: true,
      onSelect: handlers.onAddToCollection,
    },
  ];

  if (context.collection) {
    items.push({
      id: "remove-from-collection",
      // Named, because "Remove from this Collection" over a table that could
      // be showing any of nine Collections is a question, not a label.
      label: `Remove from “${context.collection.name}”`,
      onSelect: handlers.onRemoveFromCollection,
    });
  }

  items.push(
    { id: "add-tag", label: "Add tag…", separatorBefore: true, onSelect: handlers.onAddTag },
    { id: "remove-tag", label: "Remove tag…", onSelect: handlers.onRemoveTag },
    {
      id: "rate",
      label: "Rate",
      separatorBefore: true,
      // A parent never acts; the list is what runs. Six flat rows here would
      // be six more in a menu that already has nine.
      onSelect: () => undefined,
      items: [
        ...Array.from({ length: RATING_STARS }, (_, index) => index + 1).map((count) => ({
          id: `rate-${count}`,
          label: stars(count),
          onSelect: () => handlers.onRate(count),
        })),
        {
          id: "rate-clear",
          // Clearing falls back to Rekordbox's rating; it does not write a
          // zero, which is a rating of its own (DEC-057).
          label: "Clear rating",
          separatorBefore: true,
          onSelect: () => handlers.onRate(null),
        },
      ],
    },
    {
      id: "favorite",
      label: "Favorite",
      onSelect: () => handlers.onFavorite(true),
    },
    {
      id: "unfavorite",
      // Two entries rather than a toggle: over twelve thousand tracks with
      // both kinds in them, "Favorite" has no state to toggle away from.
      label: "Remove favorite",
      onSelect: () => handlers.onFavorite(false),
    },
  );

  return items;
}

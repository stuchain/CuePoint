/**
 * What can be done to a selection of tracks (ORG-11).
 *
 * One list, built once (`trackActions.ts` joins it to Play, Explore, Beatport,
 * Fix and More), offered from two places: the row context menu and the
 * selection bar's Organize ▸. They are the same entries because they are
 * literally the same array — the spec's "one vocabulary for both surfaces"
 * is a fact about this module rather than a promise about two components
 * staying in step.
 *
 * It is pure on purpose. What the menu offers in a Collection, in a Smart
 * Collection and in the library are three different lists, and the difference
 * is the kind of thing that is easy to get subtly wrong and impossible to see
 * without opening a menu in each of three states.
 */
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";
import { countNoun } from "../../format/counts";
import { RATING_STARS } from "./trackEdits";

/** Where the table is scoped, as far as these entries are concerned. */
interface OrganizationMenuContext {
  /** How many tracks the entries will apply to. */
  count: number;
  /**
   * The Collection the table is showing, when it is one that holds rows.
   *
   * Null for the library, for a Rekordbox playlist and for a Smart Collection
   * — the last because a Smart Collection holds a question, and ORG-06 refuses
   * membership operations on one. The UI does not offer what the engine will
   * not do (DEC-061). Null for a Set as well: a Set's entries are removed on
   * the Prepare page, where each has its own row (PREP-09, fact 3).
   */
  collection: { id: number; name: string } | null;
  /**
   * Whether every track acted on is a favorite (true), none is (false) or it is not known / mixed
   * (null or absent). Known, only the entry that applies is offered (M411).
   */
  favorite?: boolean | null;
}

export interface OrganizationMenuHandlers {
  onAddToCollection: () => void;
  /**
   * "Add to Set…" (DEC-104): appends to the Set's last chapter, skipping what
   * it already holds (DEC-058). Absent where no Set can be chosen.
   */
  onAddToSet?: () => void;
  /**
   * "New Set from these…" (PREP-12): a new Set holding these tracks in
   * the table's order. Absent where no Set can be made.
   */
  onNewSetFromSelection?: () => void;
  onRemoveFromCollection: () => void;
  onAddTag: () => void;
  onRemoveTag: () => void;
  /** null clears the CuePoint rating rather than setting it to zero (DEC-057). */
  onRate: (stars: number | null) => void;
  onFavorite: (favorite: boolean) => void;
}

/** "3 stars", the same words the rest of the app rates with. */
function stars(count: number): string {
  return countNoun(count, "star");
}

/** Favorite, as one entry that names what it will do; both when the tracks differ or are not known (M411). */
function favoriteItems(
  favorite: boolean | null,
  onFavorite: (favorite: boolean) => void,
): TrackContextMenuItem[] {
  const add = { id: "favorite", label: "Add to favorites", onSelect: () => onFavorite(true) };
  // Two entries rather than a toggle when the tracks differ: "Favorite" has no state to toggle away from.
  const remove = { id: "unfavorite", label: "Remove from favorites", onSelect: () => onFavorite(false) };
  if (favorite === true) return [remove];
  if (favorite === false) return [add];
  return [add, remove];
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
      label: "Add to a Collection…",
      separatorBefore: true,
      onSelect: handlers.onAddToCollection,
    },
  ];

  if (handlers.onAddToSet) {
    items.push({ id: "add-to-set", label: "Add to a Set…", onSelect: handlers.onAddToSet });
  }

  if (handlers.onNewSetFromSelection) {
    items.push({
      id: "new-set-from-selection",
      // One track is "this track", not "these" (M413).
      label: context.count === 1 ? "New Set from this track…" : `New Set from ${countNoun(context.count, "track")}…`,
      onSelect: handlers.onNewSetFromSelection,
    });
  }

  if (context.collection) {
    items.push({
      id: "remove-from-collection",
      // Named, because "Remove from this Collection" over a table that could
      // be showing any of nine Collections is a question, not a label.
      label: `Remove from “${context.collection.name}”`,
      // The Delete key does the same from the table (SB2, C127).
      shortcut: "Delete",
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
    ...favoriteItems(context.favorite ?? null, handlers.onFavorite),
  );

  return items;
}

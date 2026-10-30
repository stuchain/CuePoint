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
import { starsItem, type TrackContextMenuItem } from "../../components/TrackContextMenu";
import { countNoun } from "../../format/counts";

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
  /**
   * The rating the tracks share, which the stars row starts on (M299): the one track's, or null
   * when they differ or it is not known.
   */
  rating?: number | null;
  /**
   * How many tags the tracks have between them (M411, `targetTagCount`): from the rows' own counts
   * when every track is in hand, else the library's tags in use. Zero means none of these tracks
   * has a tag, so Remove tag… is offered disabled, with why; null or absent is not known yet.
   */
  tagCount?: number | null;
}

/** Why Remove tag… is not offered when no track has a tag (M411). */
export const NO_TAGS_REASON = "These tracks have no tags";

/**
 * The tag count a menu's tracks give Remove tag… (M411). The rows' own `tag_count`s when the rows
 * are every track the menu is about and each one's count is known: zero then means these tracks
 * have no tags. Otherwise (a selection reaching rows not loaded) the library's tags in use, which
 * is zero only when no track has a tag; null when that is not known either.
 */
export function targetTagCount(
  rows: ReadonlyArray<{ tag_count?: number | null }>,
  count: number,
  libraryTagsInUse: number | null,
): number | null {
  if (rows.length > 0 && rows.length === count && rows.every((row) => typeof row.tag_count === "number")) {
    return rows.reduce((sum, row) => sum + (row.tag_count ?? 0), 0);
  }
  return libraryTagsInUse;
}

/**
 * The rating and favorite a menu starts on, read from the rows in hand. Only when every track the menu
 * acts on is in hand: a row inside an everything-matching selection brings only the loaded page, so
 * its rows say nothing about the rest (favorites fix A, 30 Oct 2026). Otherwise both are null: the
 * stars start blank and both Add and Remove to favorites are offered.
 */
export function targetMarks(
  rows: ReadonlyArray<{ effective_rating?: number | null; favorite?: boolean | null }>,
  count: number,
): { rating: number | null; favorite: boolean | null } {
  if (rows.length === 0 || rows.length !== count) return { rating: null, favorite: null };
  const first = rows[0]!.effective_rating ?? null;
  const rating = rows.every((row) => (row.effective_rating ?? null) === first) ? first : null;
  const favorite = rows.every((row) => row.favorite) ? true : rows.some((row) => row.favorite) ? null : false;
  return { rating, favorite };
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
    {
      id: "remove-tag",
      label: "Remove tag…",
      disabled: context.tagCount === 0,
      reason: NO_TAGS_REASON,
      onSelect: handlers.onRemoveTag,
    },
    // One row of five stars and a clear button, not a submenu of star rows (M299, D26). Clearing
    // falls back to Rekordbox's rating; it does not write a zero, which is a rating of its own
    // (DEC-057).
    starsItem({
      id: "rate",
      label: "Rate",
      value: context.rating ?? null,
      separatorBefore: true,
      onRate: (value) => handlers.onRate(value === 0 ? null : value),
    }),
    ...favoriteItems(context.favorite ?? null, handlers.onFavorite),
  );

  return items;
}

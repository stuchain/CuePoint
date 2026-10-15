/**
 * What a right-click offers on the Set table (PREP-10).
 *
 * An entry's menu is the base track menu every list has (Play, Play next, Add to queue, More)
 * with the Set's own edits in a "This page" block between. A heading's menu is the chapter's: its dialog,
 * moving it, deleting it. Pure, so which entry is offered when is a unit test
 * and not a glimpse through a component.
 */
import type { EntityKind, TrackCreditLinks } from "../../api/cuepointBridge.types";
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";
import { discoverMenuItems } from "../library/libraryDiscover";
import { groupMenuId, moreItems, moreWithExplore, playItems } from "../library/trackActions";

interface EntryMenuState {
  /** How many entries the menu acts on. */
  count: number;
  /** "Start a chapter here" can: the entry is not its chapter's first. */
  canSplit: boolean;
}

interface EntryMenuHandlers {
  onPlay: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onSplit: () => void;
  onRepeat: () => void;
  onRemove: () => void;
}

/** The heading of the block of entries only this page has (area 38). */
export const THIS_PAGE = "This page";

/**
 * A page's own entries as the menu's "This page" block: a muted heading, then the entries. Every
 * track list's menu is the same base (Play, then More) with the page's own entries between.
 */
export function thisPageBlock(items: readonly TrackContextMenuItem[]): TrackContextMenuItem[] {
  if (items.length === 0) return [];
  return [
    { id: "this-page", label: THIS_PAGE, onSelect: () => undefined, disabled: true, separatorBefore: true },
    ...items.map((item) => ({ ...item, separatorBefore: false })),
  ];
}

/** The base menu's last entry: More, holding the page entries, Copy and Show in folder. */
export function moreSubmenu(items: readonly TrackContextMenuItem[]): TrackContextMenuItem[] {
  if (items.length === 0) return [];
  return [
    { id: groupMenuId("more"), label: "More", onSelect: () => undefined, items: [...items], separatorBefore: true },
  ];
}

interface MoreHandlers {
  onSimilar: (() => void) | null;
  onOpenPage: (kind: EntityKind, ref: string) => void;
  onCopy: () => void;
  /** Null when there is no one file to show. */
  onReveal: (() => void) | null;
}

/** More's entries for these tracks: the pages of the first, then Copy and Show in folder. */
export function moreEntries(
  context: { count: number; credits: TrackCreditLinks | null; revealable: boolean },
  handlers: MoreHandlers,
): TrackContextMenuItem[] {
  return moreWithExplore(
    handlers.onSimilar
      ? discoverMenuItems({ count: 1, credits: context.credits }, { onSimilar: handlers.onSimilar, onOpenPage: handlers.onOpenPage })
      : [],
    moreItems(
      { count: context.count, collection: null, credits: null, revealable: context.revealable },
      { onCopy: handlers.onCopy, onReveal: handlers.onReveal },
    ),
  );
}

/**
 * An entry's menu: the base track menu (Play, Play next, Add to queue, and More) with the Set's
 * own edits between, in a "This page" block. `more` is More's entries, from `moreEntries`.
 */
export function entryMenuItems(
  state: EntryMenuState,
  handlers: EntryMenuHandlers,
  more: readonly TrackContextMenuItem[] = [],
): TrackContextMenuItem[] {
  const { count } = state;
  if (count <= 0) return [];
  const one = count === 1;
  const page: TrackContextMenuItem[] = [];
  if (one) {
    page.push(
      {
        id: "split",
        label: "Start a chapter here",
        title: "Splits the Set here; this track begins a new chapter.",
        onSelect: handlers.onSplit,
        // At a chapter's first entry a chapter already starts there; the
        // engine would refuse it and say to rename instead.
        disabled: !state.canSplit,
      },
      { id: "repeat", label: "Insert a repeat after", onSelect: handlers.onRepeat },
    );
  }
  page.push({
    id: "remove",
    label: one ? "Remove from Set" : `Remove ${count.toLocaleString()} entries from Set`,
    onSelect: handlers.onRemove,
  });
  return [
    ...playItems(count, {
      onPlay: handlers.onPlay,
      onPlayNext: handlers.onPlayNext,
      onAddToQueue: handlers.onAddToQueue,
    }),
    ...thisPageBlock(page),
    ...moreSubmenu(more),
  ];
}

interface HeadingMenuState {
  /** Where the chapter is among the Set's, from 0. */
  position: number;
  chapters: number;
}

interface HeadingMenuHandlers {
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function headingMenuItems(
  state: HeadingMenuState,
  handlers: HeadingMenuHandlers,
): TrackContextMenuItem[] {
  return [
    { id: "edit", label: "Rename, targets and notes…", onSelect: handlers.onEdit },
    {
      id: "move-up",
      label: "Move chapter up",
      onSelect: handlers.onMoveUp,
      disabled: state.position <= 0,
      separatorBefore: true,
    },
    {
      id: "move-down",
      label: "Move chapter down",
      onSelect: handlers.onMoveDown,
      disabled: state.position >= state.chapters - 1,
    },
    {
      id: "delete",
      label: "Delete chapter…",
      onSelect: handlers.onDelete,
      // A Set always has one chapter (DEC-103).
      disabled: state.chapters <= 1,
      separatorBefore: true,
    },
  ];
}

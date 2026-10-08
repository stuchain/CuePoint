/**
 * What a right-click offers on the Set table (PREP-10).
 *
 * An entry's menu is the Set's own edits beside the ordinary track operations:
 * playing (from this entry, with the Set behind it), queueing, and a track's
 * Similar tracks and pages. A heading's menu is the chapter's: its dialog,
 * moving it, deleting it. Pure, so which entry is offered when is a unit test
 * and not a glimpse through a component.
 */
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";

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

export function entryMenuItems(
  state: EntryMenuState,
  handlers: EntryMenuHandlers,
  after: readonly TrackContextMenuItem[] = [],
): TrackContextMenuItem[] {
  const { count } = state;
  if (count <= 0) return [];
  const one = count === 1;
  const items: TrackContextMenuItem[] = [
    {
      id: "play",
      label: one ? "Play Set from here" : `Play ${count.toLocaleString()} entries`,
      onSelect: handlers.onPlay,
    },
    { id: "play-next", label: "Play next", onSelect: handlers.onPlayNext },
    { id: "add-to-queue", label: "Add to queue", onSelect: handlers.onAddToQueue },
  ];
  if (one) {
    items.push(
      {
        id: "split",
        label: "Start a chapter here",
        title: "Splits the Set here; this track begins a new chapter.",
        onSelect: handlers.onSplit,
        // At a chapter's first entry a chapter already starts there; the
        // engine would refuse it and say to rename instead.
        disabled: !state.canSplit,
        separatorBefore: true,
      },
      { id: "repeat", label: "Insert a repeat after", onSelect: handlers.onRepeat },
    );
  }
  items.push({
    id: "remove",
    label: one ? "Remove from Set" : `Remove ${count.toLocaleString()} entries from Set`,
    onSelect: handlers.onRemove,
    separatorBefore: !one,
  });
  if (after.length > 0) {
    items.push(...after.map((item, index) => (index === 0 ? { ...item, separatorBefore: true } : item)));
  }
  return items;
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

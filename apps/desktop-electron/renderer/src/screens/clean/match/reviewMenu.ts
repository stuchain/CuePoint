/**
 * The Review table's right-click menu, as pure data.
 *
 * Built from the same pieces as every track menu (`library/trackActions.ts`): Play, Play next and
 * Add to queue, then Copy and Show in folder; then a "This page" block for what only Review can
 * do: tick the track to sync it or leave it out, and choose its match. Right-clicking a row
 * selects it first, so the menu always acts on what is shown selected. "Tick to sync" is enabled
 * exactly when the selection bar offers it (C185).
 */
import type { TrackContextMenuItem } from "../../../components/TrackContextMenu";
import { playItems, moreItems } from "../../library/trackActions";
import { thisPageBlock } from "../../prepare/prepareMenus";

export interface ReviewMenuState {
  /** Tracks the menu acts on. */
  count: number;
  /** Some of them have a match and are not ticked: they can be ticked. */
  canTick: boolean;
  /** Some of them are ticked: they can be left out. */
  canLeaveOut: boolean;
}

export interface ReviewMenuHandlers {
  onPlay: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onCopy: () => void;
  /** Null when there is no one file to show (several tracks, or no desktop app). */
  onReveal: (() => void) | null;
  onTick: () => void;
  onLeaveOut: () => void;
  /** Open the candidates of the one track. */
  onChoose: () => void;
}

export function reviewMenuItems(state: ReviewMenuState, handlers: ReviewMenuHandlers): TrackContextMenuItem[] {
  const { count } = state;
  const more = moreItems(
    { count, collection: null, credits: null, revealable: count === 1 && handlers.onReveal !== null },
    { onCopy: handlers.onCopy, onReveal: handlers.onReveal },
  );
  return [
    ...playItems(count, {
      onPlay: handlers.onPlay,
      onPlayNext: handlers.onPlayNext,
      onAddToQueue: handlers.onAddToQueue,
    }),
    ...more.map((item, at) => (at === 0 ? { ...item, separatorBefore: true } : item)),
    // The block for this page: a label-style heading over its first entry, then what Review adds.
    ...thisPageBlock([
      {
        id: "tick",
        label: "Tick to sync",
        disabled: !state.canTick,
        reason: "Every one of them is ticked or has no match",
        onSelect: handlers.onTick,
      },
      {
        id: "leave-out",
        label: "Leave out",
        disabled: !state.canLeaveOut,
        reason: "None of them is ticked",
        onSelect: handlers.onLeaveOut,
      },
      { id: "choose", label: "Choose a match", disabled: count !== 1, reason: "Choose one track at a time", onSelect: handlers.onChoose },
    ]),
  ];
}

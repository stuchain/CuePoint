/**
 * What a library row offers off the Library page (DISCOVER-11).
 *
 * An Artist or Label page's library half and a Similar tracks list hold
 * library rows, so a row plays and queues as it does in the Library (DEC-012,
 * DEC-013) and leads to its Similar tracks and its pages. The organization
 * entries stay the Library's: tagging and collecting from a page would be a
 * second Library, and **Open in Library** is one click away.
 */
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";

interface RowPlaybackHandlers {
  /** One row: play it with the view behind it. Several: play those. */
  onPlay: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
}

/** Playback first, as the Library's menu has it, then whatever follows. */
export function libraryRowMenuItems(
  count: number,
  playback: RowPlaybackHandlers,
  after: readonly TrackContextMenuItem[] = [],
): TrackContextMenuItem[] {
  if (count <= 0) return [];
  return [
    {
      id: "play",
      label: count > 1 ? `Play ${count.toLocaleString()} tracks` : "Play",
      onSelect: playback.onPlay,
    },
    { id: "play-next", label: "Play next", onSelect: playback.onPlayNext },
    { id: "add-to-queue", label: "Add to queue", onSelect: playback.onAddToQueue },
    ...after,
  ];
}

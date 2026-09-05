import { useEffect, useRef } from "react";

import type { PlayerNotice } from "../../api/cuepointBridge.types";
import { useToast } from "../Toast";

/**
 * Turning the player's notices into toasts (PLAYER-10, DEC-054).
 *
 * The coalescing that makes this bearable happens in main, where the failures
 * are: a disconnected drive fails every track in the queue, and main sends one
 * notice for the whole run rather than one per track. This side does not try to
 * be clever about that — it would be the wrong place, since the renderer sees
 * only what it is sent.
 *
 * What it does do is refuse to show the same notice twice. Notices carry a
 * rising id, and a subscription that is torn down and rebuilt — which React
 * does on every hot reload, and StrictMode does twice on mount — must not turn
 * one failure into two toasts.
 *
 * A failure is a warning rather than an error: the track was skipped and the
 * queue carried on, which is a thing worth knowing and not a thing that broke.
 * A failure that *stopped* playback is an error, because nothing is playing any
 * more and the user is about to wonder why.
 */
export function usePlayerNotices(): void {
  const { push } = useToast();
  // Kept in a ref rather than state: showing a toast must not re-render, and
  // the last id has to survive the effect being re-run.
  const lastId = useRef(0);

  useEffect(() => {
    const player = window.cuepoint?.player;
    if (!player?.subscribeNotices) return;

    const onNotice = (notice: PlayerNotice) => {
      if (!notice || typeof notice.message !== "string" || notice.message === "") return;
      if (notice.id <= lastId.current) return;
      lastId.current = notice.id;
      push(notice.message, notice.stopped ? "error" : "warning");
    };

    return player.subscribeNotices(onNotice);
  }, [push]);
}

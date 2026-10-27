import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { windowTitle } from "../../api/windowTheme";
import { selectCurrentItem, selectPlaying } from "../player/playerFormat";
import { usePlayerValue } from "../player/playerStore";
import { findOwningDestination } from "./navRegistry";

/** The playing track's words, as one string so a reader repaints only when they change. */
function selectPlayingWords(state: PlayerSnapshot | null): string {
  const item = selectPlaying(state) ? selectCurrentItem(state) : null;
  return item ? JSON.stringify([item.title, item.artist]) : "";
}

/** The window's title follows the page, or the track while one plays (M501). */
export function useWindowTitle(): void {
  const { pathname } = useLocation();
  const playing = usePlayerValue(selectPlayingWords);
  const page = findOwningDestination(pathname)?.label ?? null;
  useEffect(() => {
    const [title, artist] = playing ? (JSON.parse(playing) as [string, string]) : [null, null];
    document.title = windowTitle(page, title || artist ? { title, artist } : null);
  }, [page, playing]);
}

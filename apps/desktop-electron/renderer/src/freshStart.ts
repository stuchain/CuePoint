/**
 * On a fresh app start, Clean opens on Match → Playlists and Discover on New dig: not on a
 * review, a past search, the match window or an old dig the last session left. Within a session
 * the tabs keep their state, because this runs once, before the router mounts, and the tabs'
 * own remembering (localStorage) carries them from then on. A renderer reload in the middle of a
 * session (Ctrl+R, a crashed renderer coming back) is not a fresh start: a flag in
 * `sessionStorage`, which lives as long as the window and not longer, makes it apply once per launch.
 */
import { saveCleanSection } from "./screens/clean/cleanSections";
import { saveMatchTab } from "./screens/clean/match/matchTab";
import { saveDiscoverSection } from "./screens/discover/discoverSections";

/** Set once the reset has been made in this window's life. */
export const FRESH_START_FLAG = "cuepoint-fresh-start-applied";

function alreadyApplied(): boolean {
  try {
    if (sessionStorage.getItem(FRESH_START_FLAG) === "1") return true;
    sessionStorage.setItem(FRESH_START_FLAG, "1");
  } catch {
    // No session storage: apply, as a launch does.
  }
  return false;
}

export function applyFreshStart(): true {
  if (alreadyApplied()) return true;
  saveCleanSection("review");
  saveMatchTab("playlists");
  saveDiscoverSection("new");
  return true;
}

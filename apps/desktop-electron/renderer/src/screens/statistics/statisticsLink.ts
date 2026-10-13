/**
 * Opening Statistics on one of its sections from somewhere else (K3).
 *
 * Library health lives on Statistics, so a link that is about health, such as the old Clean
 * Health tab's address, should land on the Health section rather than the top of a long page.
 * The link carries which section it is about in the location's state, as Settings' links do
 * (`settingsLink.ts`), and the page scrolls to it. A plain address can ask the same with
 * `?section=health`, for a link that has no state to carry.
 */
import type { Location } from "react-router-dom";

/** The sections a link can open Statistics on. */
type StatisticsFocus = "health";

interface StatisticsFocusState {
  statisticsFocus: StatisticsFocus;
  /** One per navigation, so the same link followed twice scrolls twice. */
  token: string;
}

export function statisticsFocusState(focus: StatisticsFocus): StatisticsFocusState {
  return { statisticsFocus: focus, token: `${Date.now()}-${Math.random()}` };
}

/** What a location's search string asks for (`?section=health`), or null. */
export function statisticsFocusFromSearch(search: string): StatisticsFocus | null {
  const section = new URLSearchParams(search).get("section");
  return section === "health" ? section : null;
}

/**
 * What a navigation asked Statistics to scroll to, or null for an ordinary visit.
 *
 * Location state wins over the search string. A search-only link has no token of its own, so
 * the location's key stands in: each navigation to it is a new key.
 */
export function statisticsFocus(
  location: Pick<Location, "state"> & Partial<Pick<Location, "search" | "key">>,
): { focus: StatisticsFocus; token: string } | null {
  const state = location.state as Partial<StatisticsFocusState> | null | undefined;
  if (state?.statisticsFocus === "health") {
    return { focus: state.statisticsFocus, token: String(state.token ?? "") };
  }
  const fromSearch = statisticsFocusFromSearch(location.search ?? "");
  // The router's navigation key, not a track's: no fallback to a `.key`, which keyReaders forbids.
  const { key: navigation = "" } = location;
  return fromSearch ? { focus: fromSearch, token: `search-${navigation}` } : null;
}

/**
 * Opening Settings on the field a link is about (DISCOVER-10).
 *
 * Discover's "no token" and "token rejected" states send a person to Settings
 * to fix the token (DEC-098). The token field is the last thing on that page,
 * so a link that landed at the top would leave them to find it. The link
 * carries which field it is about in the location's state, as Clean's links
 * do, and Settings scrolls to it and focuses it. Help → Privacy links to the
 * error-reporting switch the same way (REPORT-01), and to the Privacy section
 * as a whole for the exit-clearing choices (SET-7). The update note's **Change
 * size** (DEC-207) links to the size control the same way.
 */
import type { Location } from "react-router-dom";

/** The fields a link can open Settings on. */
type SettingsFocus = "beatport-token" | "error-reporting" | "privacy" | "size" | "waveforms";

interface SettingsFocusState {
  settingsFocus: SettingsFocus;
  /** One per navigation, so the same link followed twice focuses twice. */
  token: string;
}

export function settingsFocusState(focus: SettingsFocus): SettingsFocusState {
  return { settingsFocus: focus, token: `${Date.now()}-${Math.random()}` };
}

/** What a navigation asked Settings to focus, or null for an ordinary visit. */
export function settingsFocus(
  location: Pick<Location, "state">,
): { focus: SettingsFocus; token: string } | null {
  const state = location.state as Partial<SettingsFocusState> | null | undefined;
  if (!state) return null;
  if (
    state.settingsFocus !== "beatport-token" &&
    state.settingsFocus !== "error-reporting" &&
    state.settingsFocus !== "privacy" &&
    state.settingsFocus !== "size" &&
    state.settingsFocus !== "waveforms"
  ) {
    return null;
  }
  return { focus: state.settingsFocus, token: String(state.token ?? "") };
}

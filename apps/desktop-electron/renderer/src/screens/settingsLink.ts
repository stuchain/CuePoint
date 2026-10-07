/**
 * Opening Settings on the field a link is about (DISCOVER-10).
 *
 * Discover's "no token" and "token rejected" states send a person to Settings
 * to fix the token (DEC-098). The token field is the last thing on that page,
 * so a link that landed at the top would leave them to find it. The link
 * carries which field it is about in the location's state, as Clean's links
 * do, and Settings scrolls to it and focuses it.
 */
import type { Location } from "react-router-dom";

/** The fields a link can open Settings on. */
type SettingsFocus = "beatport-token";

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
  if (!state || state.settingsFocus !== "beatport-token") return null;
  return { focus: state.settingsFocus, token: String(state.token ?? "") };
}

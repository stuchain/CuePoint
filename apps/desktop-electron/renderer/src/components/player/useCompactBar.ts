/**
 * Whether the player bar is its one compact line (C207): a window under 700 scaled pixels of
 * content height, the same threshold the zoomed waveform strip uses (`waveformDetailSetting.ts`).
 * The zoomed strip and its toggle are not drawn then, so nothing should be fetched or made for
 * it either. PlayerBar.css reads the same answer as `:root[data-short-window]`, which
 * `useShortWindowFlag` sets, so the stylesheet and this hook can never disagree.
 */
import { useShortWindow } from "../waveform/waveformDetailSetting";

/** True in a window too short for the zoomed strip; a platform without matchMedia counts as tall. */
export function useCompactBar(): boolean {
  return useShortWindow();
}

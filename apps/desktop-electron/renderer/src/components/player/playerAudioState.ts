import { useEffect } from "react";
import type { AudioSettings } from "../../api/cuepointBridge.types";

/**
 * The output device and exclusive-output choice, remembered (PLAYER-11,
 * DEC-055).
 *
 * Stored in `localStorage` the same way shuffle and repeat are (PLAYER-07),
 * for the same reason: main owns the live player and is *told* the remembered
 * preference at startup, and never reads storage itself. DEC-055 asked that
 * these not get a store of their own, and this is the store the desktop app
 * already has for player preferences.
 *
 * The restore has to happen at startup rather than when the settings panel
 * opens. Most sessions never open Settings at all, and a DJ who chose their
 * interface last week expects the *first* track of this session to come out of
 * it — not the first track after they happen to visit a settings page.
 *
 * Nothing here trusts what it reads back. A device name is an opaque string
 * from mpv and the machine it was written on may not be the machine reading it
 * — a stored `wasapi/{guid}` means nothing on a Mac — so an unknown device is
 * handled the way an unplugged one is: mpv fails to open it, and PLAYER-11's
 * fallback puts playback on the system default and says so.
 */

export const PLAYER_AUDIO_DEVICE_STORAGE_KEY = "cuepoint-player-audio-device";
export const PLAYER_AUDIO_EXCLUSIVE_STORAGE_KEY = "cuepoint-player-audio-exclusive";

/** The system default, which is also mpv's own name for it. */
export const SYSTEM_DEFAULT_DEVICE = "auto";

export function loadAudioDevice(): string {
  try {
    const raw = localStorage.getItem(PLAYER_AUDIO_DEVICE_STORAGE_KEY);
    return typeof raw === "string" && raw.trim() !== "" ? raw : SYSTEM_DEFAULT_DEVICE;
  } catch {
    // Storage can throw outright where site data is disabled.
    return SYSTEM_DEFAULT_DEVICE;
  }
}

export function saveAudioDevice(device: string): void {
  try {
    localStorage.setItem(PLAYER_AUDIO_DEVICE_STORAGE_KEY, device);
  } catch {
    // A forgotten preference is not worth breaking the picker over.
  }
}

export function loadAudioExclusive(): boolean {
  try {
    return localStorage.getItem(PLAYER_AUDIO_EXCLUSIVE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAudioExclusive(on: boolean): void {
  try {
    localStorage.setItem(PLAYER_AUDIO_EXCLUSIVE_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // As above.
  }
}

export function loadAudioSettings(): AudioSettings {
  return { device: loadAudioDevice(), exclusive: loadAudioExclusive() };
}

/**
 * Tell main the remembered audio settings, once, at startup (PLAYER-11).
 *
 * Only when there is something to say: pushing `auto` + shared at every launch
 * would be harmless but would also overwrite nothing with nothing, and it
 * would start the player process on a machine where nobody has pressed play.
 *
 * Failures are ignored on purpose, as with the order settings. A build with no
 * player must still start; the cost is a preference that does not apply this
 * session, not an app that will not open.
 */
export function useRestorePlayerAudio(): void {
  useEffect(() => {
    const player = window.cuepoint?.player;
    if (!player?.setAudioSettings) return;
    const settings = loadAudioSettings();
    if (settings.device === SYSTEM_DEFAULT_DEVICE && !settings.exclusive) return;
    void player.setAudioSettings(settings).catch(() => undefined);
  }, []);
}

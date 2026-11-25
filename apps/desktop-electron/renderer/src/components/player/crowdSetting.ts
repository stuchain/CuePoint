/**
 * Whether the dancing crowd is offered: on until switched off (Settings › Motion, "Dancing crowd").
 *
 * Kept as `waveformDetailSetting.ts` keeps its choice: a renderer preference under one key, "on" or
 * "off", read through one hook so the player bar's button and the Party view come and go the moment
 * Settings changes it. Anything else stored, and storage that throws, reads as the default (on); a
 * choice that cannot be stored is still applied for this session.
 */
import { useCallback, useSyncExternalStore } from "react";

export const CROWD_SETTING_KEY = "cuepoint-dancing-crowd";

/** What nothing stored means. */
export const CROWD_SETTING_DEFAULT = true;

function parse(raw: string | null): boolean {
  return raw === "off" ? false : raw === "on" ? true : CROWD_SETTING_DEFAULT;
}

/** The stored choice, the default when none was made or storage refuses. */
export function loadCrowdSetting(): boolean {
  try {
    return parse(localStorage.getItem(CROWD_SETTING_KEY));
  } catch {
    return CROWD_SETTING_DEFAULT;
  }
}

const listeners = new Set<() => void>();

/** What this window has read or chosen; null until the first read. */
let current: boolean | null = null;

function snapshot(): boolean {
  if (current === null) current = loadCrowdSetting();
  return current;
}

/** Turn the crowd on or off everywhere, and remember it where storage allows. */
export function saveCrowdSetting(on: boolean): void {
  current = on;
  try {
    localStorage.setItem(CROWD_SETTING_KEY, on ? "on" : "off");
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // A null key is `localStorage.clear()` elsewhere: read what is left.
    if (event.key !== null && event.key !== CROWD_SETTING_KEY) return;
    current = event.key === null ? loadCrowdSetting() : parse(event.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forget what this window has read, so the next read is from storage (tests). */
export function resetCrowdSettingForTests(): void {
  current = null;
}

/** Whether the crowd is on, and a way to change it everywhere at once. */
export function useCrowdSetting(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, snapshot, snapshot);
  const set = useCallback((next: boolean) => saveCrowdSetting(next), []);
  return [on, set];
}

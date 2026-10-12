/**
 * Whether the zoomed waveform shows above the player (T4): on until switched
 * off in Settings › Waveforms.
 *
 * Kept as the colour choice is (`waveformColour.ts`): a renderer preference
 * under one key, read through one hook so the strip comes and goes the moment
 * Settings changes it. Storage that throws reads as the default and forgets the
 * choice rather than breaking the player over it.
 */
import { useCallback, useSyncExternalStore } from "react";

export const WAVEFORM_DETAIL_STORAGE_KEY = "cuepoint-waveform-detail";

export const WAVEFORM_DETAIL_DEFAULT = true;

/** What a stored value means; anything unrecognised is the default. */
export function parseWaveformDetail(raw: string | null): boolean {
  return raw === "off" ? false : raw === "on" ? true : WAVEFORM_DETAIL_DEFAULT;
}

export function loadWaveformDetail(): boolean {
  try {
    return parseWaveformDetail(localStorage.getItem(WAVEFORM_DETAIL_STORAGE_KEY));
  } catch {
    return WAVEFORM_DETAIL_DEFAULT;
  }
}

const listeners = new Set<() => void>();

/** What this window chose, kept when storage refuses to remember it. */
let current: boolean | null = null;

function snapshot(): boolean {
  if (current === null) current = loadWaveformDetail();
  return current;
}

/** Show or hide the strip everywhere, and remember it where storage allows. */
export function saveWaveformDetail(on: boolean): void {
  current = on;
  try {
    localStorage.setItem(WAVEFORM_DETAIL_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== WAVEFORM_DETAIL_STORAGE_KEY) return;
    current = parseWaveformDetail(event.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forget what this window has read, so the next read is from storage (tests). */
export function resetWaveformDetailForTests(): void {
  current = null;
}

/** Whether the strip shows, and a way to change it everywhere at once. */
export function useWaveformDetailSetting(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, snapshot, snapshot);
  const set = useCallback((next: boolean) => saveWaveformDetail(next), []);
  return [on, set];
}

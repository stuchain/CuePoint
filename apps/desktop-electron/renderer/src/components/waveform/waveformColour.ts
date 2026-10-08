/**
 * "Three bands" or "One colour" (WAVE-05, DEC-117): a display preference.
 *
 * Stored in the renderer, as the Inspector's state is, under one key, and read
 * through one hook so every waveform on screen changes the moment Settings
 * does. Storage that throws — disabled, full, or a private window — reads as
 * the default and forgets the choice rather than breaking a drawing over it.
 */
import { useCallback, useSyncExternalStore } from "react";

import type { WaveformColourMode } from "./waveformLayout";

export const WAVEFORM_COLOUR_STORAGE_KEY = "cuepoint-waveform-colour";

export const WAVEFORM_COLOUR_DEFAULT: WaveformColourMode = "bands";

/** The choice's words, in the order Settings offers them. */
export const WAVEFORM_COLOUR_OPTIONS: readonly { mode: WaveformColourMode; label: string }[] = [
  { mode: "bands", label: "Three bands" },
  { mode: "single", label: "One color" },
];

/** What a stored value means; anything unrecognised is the default. */
export function parseWaveformColour(raw: string | null): WaveformColourMode {
  return raw === "single" || raw === "bands" ? raw : WAVEFORM_COLOUR_DEFAULT;
}

export function loadWaveformColour(): WaveformColourMode {
  try {
    return parseWaveformColour(localStorage.getItem(WAVEFORM_COLOUR_STORAGE_KEY));
  } catch {
    return WAVEFORM_COLOUR_DEFAULT;
  }
}

const listeners = new Set<() => void>();

/** What this window chose, kept when storage refuses to remember it. */
let current: WaveformColourMode | null = null;

function snapshot(): WaveformColourMode {
  if (current === null) current = loadWaveformColour();
  return current;
}

/** Choose a mode for every waveform, and remember it where storage allows. */
export function saveWaveformColour(mode: WaveformColourMode): void {
  current = mode;
  try {
    localStorage.setItem(WAVEFORM_COLOUR_STORAGE_KEY, mode);
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another window of the app changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== WAVEFORM_COLOUR_STORAGE_KEY) return;
    current = parseWaveformColour(event.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forget what this window has read, so the next read is from storage (tests). */
export function resetWaveformColourForTests(): void {
  current = null;
}

/** The colour mode, and a way to change it everywhere at once. */
export function useWaveformColour(): [WaveformColourMode, (mode: WaveformColourMode) => void] {
  const mode = useSyncExternalStore(subscribe, snapshot, snapshot);
  const set = useCallback((next: WaveformColourMode) => saveWaveformColour(next), []);
  return [mode, set];
}

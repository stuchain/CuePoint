/**
 * Whether the zoomed waveform shows above the player (T4): on until switched
 * off, and off to begin with in a short window (R2-2) until the user chooses.
 *
 * Kept as the colour choice is (`waveformColour.ts`): a renderer preference
 * under one key, read through one hook so the strip comes and goes the moment
 * Settings or the player bar changes it. The stored value is "on", "off" or
 * nothing (never chosen); nothing means "show it unless the window is short",
 * and that is followed live as the window is resized. Storage that throws
 * reads as never chosen and forgets the choice rather than breaking the player.
 */
import { useCallback, useSyncExternalStore } from "react";

import { DETAIL_SPANS_MS, DETAIL_SPAN_MS } from "./waveformDetailLayout";

export const WAVEFORM_DETAIL_STORAGE_KEY = "cuepoint-waveform-detail";

/** What a window tall enough for the strip shows when nothing was chosen. */
export const WAVEFORM_DETAIL_DEFAULT = true;

/**
 * Windows with less than 700 px of content height start without the strip. That
 * is the content, not the outer window: the default 1280x800 window is about
 * 740-775 px of content depending on the platform, so it keeps the strip, and a
 * 1280x720 window (about 660 px of content) hides it.
 */
export const SHORT_WINDOW_QUERY = "(max-height: 699.98px)";

/** What a stored value means: a choice, or null when none was made (or it is unrecognised). */
export function parseWaveformDetail(raw: string | null): boolean | null {
  return raw === "off" ? false : raw === "on" ? true : null;
}

/** The stored choice, null when never made. */
export function loadWaveformChoice(): boolean | null {
  try {
    return parseWaveformDetail(localStorage.getItem(WAVEFORM_DETAIL_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** One query list for every read and subscription, made on first use. */
let media: MediaQueryList | null = null;

function shortWindowQuery(): MediaQueryList | null {
  if (media === null && typeof window !== "undefined" && typeof window.matchMedia === "function") {
    media = window.matchMedia(SHORT_WINDOW_QUERY);
  }
  return media;
}

/** Whether the window is short now; a platform without matchMedia counts as tall. */
function isShortWindow(): boolean {
  return shortWindowQuery()?.matches === true;
}

/** Whether the strip shows now, as stored (or the window's height) decides. */
export function loadWaveformDetail(): boolean {
  return loadWaveformChoice() ?? !isShortWindow();
}

const listeners = new Set<() => void>();

/** What this window chose, kept when storage refuses to remember it. */
let choice: boolean | null = null;
let choiceRead = false;

function snapshot(): boolean {
  if (!choiceRead) {
    choice = loadWaveformChoice();
    choiceRead = true;
  }
  return choice ?? !isShortWindow();
}

/** Show or hide the strip everywhere, and remember it where storage allows. */
export function saveWaveformDetail(on: boolean): void {
  choice = on;
  choiceRead = true;
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
    // A null key is `localStorage.clear()` elsewhere: read what is left.
    if (event.key !== null && event.key !== WAVEFORM_DETAIL_STORAGE_KEY) return;
    choice = event.key === null ? loadWaveformChoice() : parseWaveformDetail(event.newValue);
    choiceRead = true;
    listener();
  };
  window.addEventListener("storage", onStorage);
  const query = shortWindowQuery();
  query?.addEventListener?.("change", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    query?.removeEventListener?.("change", listener);
  };
}

/** Forget what this window has read, so the next read is from storage (tests). */
export function resetWaveformDetailForTests(): void {
  choice = null;
  choiceRead = false;
  media = null;
}

/** Whether the strip shows, and a way to change it everywhere at once. */
export function useWaveformDetailSetting(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, snapshot, snapshot);
  const set = useCallback((next: boolean) => saveWaveformDetail(next), []);
  return [on, set];
}

/** The span of music the zoomed strip shows, in ms, remembered like the setting above. */
export const WAVEFORM_DETAIL_SPAN_STORAGE_KEY = "cuepoint-waveform-detail-span";

/** What a stored span means; anything that is not one of the strip's stops is the default. */
export function parseWaveformDetailSpan(raw: string | null): number {
  const value = raw !== null && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  return DETAIL_SPANS_MS.includes(value) ? value : DETAIL_SPAN_MS;
}

export function loadWaveformDetailSpan(): number {
  try {
    return parseWaveformDetailSpan(localStorage.getItem(WAVEFORM_DETAIL_SPAN_STORAGE_KEY));
  } catch {
    return DETAIL_SPAN_MS;
  }
}

const spanListeners = new Set<() => void>();

/** What this window chose, kept when storage refuses to remember it. */
let currentSpan: number | null = null;

function spanSnapshot(): number {
  if (currentSpan === null) currentSpan = loadWaveformDetailSpan();
  return currentSpan;
}

/** Zoom the strip everywhere, and remember it where storage allows. */
export function saveWaveformDetailSpan(spanMs: number): void {
  currentSpan = DETAIL_SPANS_MS.includes(spanMs) ? spanMs : DETAIL_SPAN_MS;
  try {
    localStorage.setItem(WAVEFORM_DETAIL_SPAN_STORAGE_KEY, String(currentSpan));
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
  spanListeners.forEach((listener) => listener());
}

function subscribeSpan(listener: () => void): () => void {
  spanListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== WAVEFORM_DETAIL_SPAN_STORAGE_KEY) return;
    currentSpan = parseWaveformDetailSpan(event.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    spanListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forget the span this window has read, so the next read is from storage (tests). */
export function resetWaveformDetailSpanForTests(): void {
  currentSpan = null;
}

/** The strip's span in ms, and a way to change it everywhere at once. */
export function useWaveformDetailSpan(): [number, (spanMs: number) => void] {
  const span = useSyncExternalStore(subscribeSpan, spanSnapshot, spanSnapshot);
  const set = useCallback((next: number) => saveWaveformDetailSpan(next), []);
  return [span, set];
}

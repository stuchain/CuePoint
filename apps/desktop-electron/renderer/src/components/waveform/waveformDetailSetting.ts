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
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { DETAIL_SPANS_MS, DETAIL_SPAN_MS } from "./waveformDetailLayout";

export const WAVEFORM_DETAIL_STORAGE_KEY = "cuepoint-waveform-detail";

/** What a window tall enough for the strip shows when nothing was chosen. */
export const WAVEFORM_DETAIL_DEFAULT = true;

/**
 * Windows with less than 700 scaled px of content height start without the strip. That is the
 * content, not the outer window, and in the size's own units: at 1x the default 1280x800 window
 * (about 740-775 px of content) keeps the strip and a 1280x720 window (about 660) hides it; at
 * 1.5x or 2x the same rows take 1.5 or 2 times the room, so the window must be that much taller
 * (a 735 px window at 2x is 367 scaled px, and the strip, the bar and the status line left no
 * page). The query is rebuilt when the size changes.
 */
export const SHORT_WINDOW_SCALED_PX = 700;

/** The media query for a window too short for the strip at this size. */
export function shortWindowQueryFor(scale: number): string {
  return `(max-height: ${Number((SHORT_WINDOW_SCALED_PX * scale - 0.02).toFixed(2))}px)`;
}

/** The query at 1x. */
export const SHORT_WINDOW_QUERY = shortWindowQueryFor(1);

/** The size the page is drawn at: the document's `data-scale` (set with `--scale`), 1 if none. */
function currentScale(): number {
  if (typeof document === "undefined") return 1;
  const value = Number(document.documentElement.dataset.scale);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

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

/** The query list for the size in force, made on first use and again when the size changes. */
let media: MediaQueryList | null = null;
let mediaScale = 0;

function shortWindowQuery(): MediaQueryList | null {
  const scale = currentScale();
  if (media !== null && mediaScale !== scale) media = null;
  if (media === null && typeof window !== "undefined" && typeof window.matchMedia === "function") {
    media = window.matchMedia(shortWindowQueryFor(scale));
    mediaScale = scale;
  }
  return media;
}

/** Whether the window is short now; a platform without matchMedia counts as tall. */
export function isShortWindow(): boolean {
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

/**
 * Hears when the window crosses the short-window line, and when the size changes: a new size
 * means a new line, so the query list is made again and the listener moves to it.
 */
export function subscribeShortWindow(listener: () => void): () => void {
  let query = shortWindowQuery();
  query?.addEventListener?.("change", listener);
  const observer =
    typeof MutationObserver === "function"
      ? new MutationObserver(() => {
          query?.removeEventListener?.("change", listener);
          query = shortWindowQuery();
          query?.addEventListener?.("change", listener);
          listener();
        })
      : null;
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scale"] });
  return () => {
    query?.removeEventListener?.("change", listener);
    observer?.disconnect();
  };
}

/**
 * Whether the window is short now, live (C207). The compact player bar reads this too, so the bar
 * and the strip share one threshold in the size's own units.
 */
export function useShortWindow(): boolean {
  return useSyncExternalStore(subscribeShortWindow, isShortWindow, () => false);
}

/**
 * Puts `data-short-window` on the page while the window is short (C207), so the stylesheet asks
 * the same question as the code: `:root[data-short-window] .cp-player-bar`. App mounts it once.
 */
export function useShortWindowFlag(): void {
  const short = useShortWindow();
  useEffect(() => {
    const root = document.documentElement;
    if (short) root.setAttribute("data-short-window", "");
    else root.removeAttribute("data-short-window");
    return () => root.removeAttribute("data-short-window");
  }, [short]);
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
  const stopShortWindow = subscribeShortWindow(listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    stopShortWindow();
  };
}

/** Forget what this window has read, so the next read is from storage (tests). */
export function resetWaveformDetailForTests(): void {
  choice = null;
  choiceRead = false;
  media = null;
  mediaScale = 0;
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

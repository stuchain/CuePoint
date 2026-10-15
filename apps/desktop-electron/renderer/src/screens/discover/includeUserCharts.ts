/**
 * Whether a dig with no artists also reads charts made by regular Beatport
 * users (Settings → Beatport). Off to begin with: Beatport's own genre charts
 * page lists only charts with a linked artist.
 *
 * A renderer preference under one key, read through one hook so Settings and
 * Discover agree the moment it changes. The dig request carries it
 * (`include_user_charts`), so each run records what it read. Storage that
 * throws reads as off and forgets the choice rather than breaking the page.
 */
import { useCallback, useSyncExternalStore } from "react";

export const INCLUDE_USER_CHARTS_STORAGE_KEY = "cuepoint-discover-include-user-charts";

/** Whether the setting is on in storage; anything but "on" is off. */
export function loadIncludeUserCharts(): boolean {
  try {
    return localStorage.getItem(INCLUDE_USER_CHARTS_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

/** What this window chose, kept when storage refuses to remember it; null until read or set. */
let current: boolean | null = null;

function snapshot(): boolean {
  if (current === null) current = loadIncludeUserCharts();
  return current;
}

/** Turn the setting on or off everywhere, and remember it where storage allows. */
export function saveIncludeUserCharts(on: boolean): void {
  current = on;
  try {
    localStorage.setItem(INCLUDE_USER_CHARTS_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // A null key is `localStorage.clear()` elsewhere.
    if (event.key !== null && event.key !== INCLUDE_USER_CHARTS_STORAGE_KEY) return;
    current = event.key === null ? false : event.newValue === "on";
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forget what this window has read, so the next read is from storage (tests). */
export function resetIncludeUserChartsForTests(): void {
  current = null;
}

/** Whether charts by regular users are included, and a way to change it everywhere. */
export function useIncludeUserCharts(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, snapshot, snapshot);
  const set = useCallback((next: boolean) => saveIncludeUserCharts(next), []);
  return [on, set];
}

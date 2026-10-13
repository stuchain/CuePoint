/**
 * How tall table rows are against their text (R4-1): Compact until Roomy is chosen.
 *
 * Kept as the key colours setting is (`components/wheel/keyColourSetting.ts`): a
 * renderer preference under one key, read through one hook so a change shows
 * everywhere at once. Roomy is also written on the page (`data-row-density`),
 * where `layout.css` turns it into `--row-density`; Compact is no attribute.
 * Storage that throws reads as Compact and forgets the choice rather than
 * breaking the page.
 */
import { useSyncExternalStore } from "react";

export const ROW_DENSITY_STORAGE_KEY = "cuepoint-row-density";

export type RowDensity = "compact" | "roomy";

/** What a stored value means: roomy only when it says so. */
function parseRowDensity(raw: string | null): RowDensity {
  return raw === "roomy" ? "roomy" : "compact";
}

/** The stored choice; Compact when none was made or storage refuses to be read. */
export function loadRowDensity(): RowDensity {
  try {
    return parseRowDensity(localStorage.getItem(ROW_DENSITY_STORAGE_KEY));
  } catch {
    return "compact";
  }
}

function applyAttribute(density: RowDensity): void {
  if (typeof document === "undefined") return;
  if (density === "roomy") document.documentElement.dataset.rowDensity = "roomy";
  else delete document.documentElement.dataset.rowDensity;
}

const listeners = new Set<() => void>();

/** What this window chose, kept when storage refuses to remember it. */
let current: RowDensity | null = null;

function snapshot(): RowDensity {
  if (current === null) current = loadRowDensity();
  return current;
}

/** Applied once at start, from what is stored. */
export function applyRowDensity(): void {
  current = loadRowDensity();
  applyAttribute(current);
}

/** Set the density everywhere, and remember it where storage allows. */
export function saveRowDensity(density: RowDensity): void {
  current = density;
  applyAttribute(density);
  try {
    localStorage.setItem(ROW_DENSITY_STORAGE_KEY, density);
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // A null key is `localStorage.clear()` elsewhere: read what is left.
    if (event.key !== null && event.key !== ROW_DENSITY_STORAGE_KEY) return;
    current = event.key === null ? loadRowDensity() : parseRowDensity(event.newValue);
    applyAttribute(current);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forget what this window has read, so the next read is from storage (tests). */
export function resetRowDensityForTests(): void {
  current = null;
}

/** The row density, and a way to change it everywhere at once. */
export function useRowDensity(): [RowDensity, (density: RowDensity) => void] {
  const density = useSyncExternalStore(subscribe, snapshot, snapshot);
  return [density, saveRowDensity];
}

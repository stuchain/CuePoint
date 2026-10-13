/**
 * Whether keys are drawn as Camelot-coloured chips (R4-2): on until switched off.
 *
 * Kept as the zoomed waveform's setting is (`waveformDetailSetting.ts`): a
 * renderer preference under one key, read through one hook so a change shows
 * everywhere at once. Off is also written on the page (`data-key-colours`), so
 * the stylesheet can turn every chip into plain text without a hook per chip.
 * Storage that throws reads as on and forgets the choice rather than breaking
 * the page.
 */
import { useSyncExternalStore } from "react";

export const KEY_COLOURS_STORAGE_KEY = "cuepoint-key-colours";

/** What a stored value means: off only when it says so. */
function parseKeyColours(raw: string | null): boolean {
  return raw !== "off";
}

/** The stored choice; on when none was made or storage refuses to be read. */
export function loadKeyColours(): boolean {
  try {
    return parseKeyColours(localStorage.getItem(KEY_COLOURS_STORAGE_KEY));
  } catch {
    return true;
  }
}

function applyAttribute(on: boolean): void {
  if (typeof document === "undefined") return;
  if (on) delete document.documentElement.dataset.keyColours;
  else document.documentElement.dataset.keyColours = "off";
}

const listeners = new Set<() => void>();

/** What this window chose, kept when storage refuses to remember it. */
let current: boolean | null = null;

function snapshot(): boolean {
  if (current === null) current = loadKeyColours();
  return current;
}

/** Applied once at start, from what is stored. */
export function applyKeyColours(): void {
  current = loadKeyColours();
  applyAttribute(current);
}

/** Colour the keys or not everywhere, and remember it where storage allows. */
export function saveKeyColours(on: boolean): void {
  current = on;
  applyAttribute(on);
  try {
    localStorage.setItem(KEY_COLOURS_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // A null key is `localStorage.clear()` elsewhere: read what is left.
    if (event.key !== null && event.key !== KEY_COLOURS_STORAGE_KEY) return;
    current = event.key === null ? loadKeyColours() : parseKeyColours(event.newValue);
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
export function resetKeyColoursForTests(): void {
  current = null;
}

/** Whether keys are coloured, and a way to change it everywhere at once. */
export function useKeyColours(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, snapshot, snapshot);
  return [on, saveKeyColours];
}

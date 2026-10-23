/**
 * How keys are written (K1 to K3): Camelot until Musical or Both is chosen.
 *
 * Kept as the row notation setting is (`tokens/keyNotation.ts`): a renderer preference under
 * one key, read through one hook so a change shows everywhere at once. It is display only:
 * `KeyChip` and the wheel are the places a key is drawn, and files, exports, matching and the
 * engine keep their own notation. A choice other than Camelot is also written on the page
 * (`data-key-notation`); Camelot is no attribute. Storage that throws reads as Camelot and
 * forgets the choice rather than breaking the page.
 */
import { useSyncExternalStore } from "react";

export const KEY_NOTATION_STORAGE_KEY = "cuepoint-key-notation";

export type KeyNotation = "camelot" | "musical" | "both";

/** What a stored value means: Musical or Both only when it says so. */
function parseKeyNotation(raw: string | null): KeyNotation {
  return raw === "musical" || raw === "both" ? raw : "camelot";
}

/** The stored choice; Camelot when none was made or storage refuses to be read. */
export function loadKeyNotation(): KeyNotation {
  try {
    return parseKeyNotation(localStorage.getItem(KEY_NOTATION_STORAGE_KEY));
  } catch {
    return "camelot";
  }
}

function applyAttribute(notation: KeyNotation): void {
  if (typeof document === "undefined") return;
  if (notation !== "camelot") document.documentElement.dataset.keyNotation = notation;
  else delete document.documentElement.dataset.keyNotation;
}

const listeners = new Set<() => void>();

/** What this window chose, kept when storage refuses to remember it. */
let current: KeyNotation | null = null;

function snapshot(): KeyNotation {
  if (current === null) current = loadKeyNotation();
  return current;
}

/** Applied once at start, from what is stored. */
export function applyKeyNotation(): void {
  current = loadKeyNotation();
  applyAttribute(current);
}

/** Write keys this way everywhere, and remember it where storage allows. */
export function saveKeyNotation(notation: KeyNotation): void {
  current = notation;
  applyAttribute(notation);
  try {
    localStorage.setItem(KEY_NOTATION_STORAGE_KEY, notation);
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // A null key is `localStorage.clear()` elsewhere: read what is left.
    if (event.key !== null && event.key !== KEY_NOTATION_STORAGE_KEY) return;
    current = event.key === null ? loadKeyNotation() : parseKeyNotation(event.newValue);
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
export function resetKeyNotationForTests(): void {
  current = null;
}

/** How keys are written now; a change (`saveKeyNotation`) re-draws every place a key shows. */
export function useKeyNotation(): KeyNotation {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

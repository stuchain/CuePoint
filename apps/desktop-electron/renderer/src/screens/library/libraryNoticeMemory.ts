/**
 * What the notice line remembers for the session (LIB-1): when the last import
 * finished, and which import's ready note was dismissed.
 *
 * Session storage, because "for the session" is exactly its lifetime, and
 * guarded, because it can be unavailable (a private window, blocked site data):
 * the note then lasts for the visit and no longer.
 */

const DISMISSED_KEY = "cuepoint-library-ready-note-dismissed";
const DONE_KEY = "cuepoint-library-ready-note-done";
const KEY_NOTE_KEY = "cuepoint-library-key-note-dismissed";
const IMPORTED_KEY = "cuepoint-library-imported-at";

/** The moment of this session's last import, or null if there was none. */
export function readImportedAt(): number | null {
  try {
    const stored = Number(sessionStorage.getItem(IMPORTED_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

/** Remember that an import just finished, so the note outlasts leaving the page. */
export function rememberImport(): number {
  const now = Date.now();
  try {
    sessionStorage.setItem(IMPORTED_KEY, String(now));
  } catch {
    // The note still shows for this visit; only the memory of it is lost.
  }
  return now;
}

/** True when the note for the import at `armedAt` was dismissed this session. */
export function wasDismissed(armedAt: number | null): boolean {
  try {
    return armedAt !== null && sessionStorage.getItem(DISMISSED_KEY) === String(armedAt);
  } catch {
    return false;
  }
}

/** Dismiss the note for the import at `armedAt`, for the rest of the session. */
export function rememberDismissal(armedAt: number | null): void {
  try {
    if (armedAt !== null) sessionStorage.setItem(DISMISSED_KEY, String(armedAt));
  } catch {
    // Dismissed for this visit at least.
  }
}

/** True when the post-import work for the import at `armedAt` has ended this session. */
export function wasChainDone(armedAt: number | null): boolean {
  try {
    return armedAt !== null && sessionStorage.getItem(DONE_KEY) === String(armedAt);
  } catch {
    return false;
  }
}

/** The post-import work for the import at `armedAt` has ended: later jobs never bring the note back. */
export function rememberChainDone(armedAt: number | null): void {
  try {
    if (armedAt !== null) sessionStorage.setItem(DONE_KEY, String(armedAt));
  } catch {
    // Done for this visit at least.
  }
}

/** True when the "no Beatport key" note was dismissed this session. */
export function wasKeyNoteDismissed(): boolean {
  try {
    return sessionStorage.getItem(KEY_NOTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Dismiss the "no Beatport key" note for the rest of the session. */
export function rememberKeyNoteDismissal(): void {
  try {
    sessionStorage.setItem(KEY_NOTE_KEY, "1");
  } catch {
    // Dismissed for this visit at least.
  }
}

/** Whether the page should mount the note for the import at `armedAt`. */
export function isReadyNoteOpen(armedAt: number | null): armedAt is number {
  return armedAt !== null && !wasDismissed(armedAt) && !wasChainDone(armedAt);
}

/**
 * What CuePoint clears when it quits (SET-7): the cache, the logs, or neither.
 *
 * Two places show these two choices, Settings → Privacy and Help → Privacy, and
 * both read and write here, so there is one source. The renderer keeps them in
 * localStorage, as it always has, and tells Electron main when they change. Each
 * place re-reads when it opens or mounts; a write also announces itself so a
 * place that is already open follows.
 */

export const CLEAR_CACHE_ON_EXIT_KEY = "cuepoint-privacy-clear-cache-on-exit";
export const CLEAR_LOGS_ON_EXIT_KEY = "cuepoint-privacy-clear-logs-on-exit";

export interface ExitClearing {
  clearCache: boolean;
  clearLogs: boolean;
}

const CHANGED_EVENT = "cuepoint-exit-clearing-changed";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** The stored choices; storage that throws reads as "clear nothing". */
export function readExitClearing(): ExitClearing {
  return {
    clearCache: readFlag(CLEAR_CACHE_ON_EXIT_KEY),
    clearLogs: readFlag(CLEAR_LOGS_ON_EXIT_KEY),
  };
}

/** Tell Electron main what the choices are now. */
export function sendExitClearing(choices: ExitClearing = readExitClearing()): void {
  void window.cuepoint?.setPrivacyExitPrefs?.({
    clearCacheOnExit: choices.clearCache,
    clearLogsOnExit: choices.clearLogs,
  });
}

/** Remember the choices where storage allows, tell main, and tell any open place. */
export function saveExitClearing(choices: ExitClearing): void {
  try {
    localStorage.setItem(CLEAR_CACHE_ON_EXIT_KEY, choices.clearCache ? "1" : "0");
    localStorage.setItem(CLEAR_LOGS_ON_EXIT_KEY, choices.clearLogs ? "1" : "0");
  } catch {
    // Not remembered across a restart; still sent for this session.
  }
  sendExitClearing(choices);
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

/** Call back when another place saved; returns the way to stop. */
export function onExitClearingChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGED_EVENT, listener);
}

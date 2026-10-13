/**
 * Playing a Beatport sample (C14, DEC-076; Discover's preview cell, DEC-269).
 *
 * A sample is an `<audio>` element of this page, outside the player's queue
 * (DEC-012). **One sound at a time across the app**: the current sample lives
 * at module level, so starting another, from a match card or a Discover row,
 * stops the first; and the player starting (Space, the Now playing bar, a
 * double-click) stops it too. It plays on the system's default output.
 *
 * A sample is named by `{kind, id}`: a match candidate's id, or a Beatport
 * track's. The hook gives one key's view of the shared state, and stops that
 * key's sound when the key changes or the component goes. Offline, or with no
 * sample, the answer is null and the state is "none": an empty state, not an
 * error. A catalog track with no sample is remembered for ten minutes (the engine
 * keeps the authoritative answer), so a table does not ask again; a candidate's is not, since it may be offline only
 * for now.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";

export type PreviewState = "idle" | "loading" | "playing" | "none";

export interface PreviewKey {
  kind: "candidate" | "catalog";
  id: number;
}

interface Current {
  name: string;
  status: "loading" | "playing" | "none";
  audio: HTMLAudioElement | null;
  url: string | null;
  unsubscribe: (() => void) | null;
}

const nameOf = (key: PreviewKey) => `${key.kind}:${key.id}`;

let current: Current | null = null;
let ticket = 0;
/** Tracks Beatport has no sample for, and until when we believe it. */
const missing = new Map<string, number>();
const MISSING_TTL_MS = 10 * 60 * 1000;

function isMissing(name: string): boolean {
  const until = missing.get(name);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  missing.delete(name);
  return false;
}
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Silence and forget whatever is current, and let go of its URL. */
function clear() {
  ticket += 1;
  const was = current;
  current = null;
  if (was) {
    was.unsubscribe?.();
    was.audio?.pause();
    if (was.url) window.cuepoint?.releaseCandidatePreview?.(was.url);
  }
  emit();
}

function askBridge(key: PreviewKey): Promise<string | null> | null {
  const bridge = window.cuepoint;
  if (key.kind === "candidate") {
    return bridge?.getCandidatePreview?.({ candidateId: key.id }) ?? null;
  }
  return bridge?.getCatalogPreview?.({ beatportTrackId: key.id }) ?? null;
}

/** True when this build can fetch samples of this kind at all. */
export function canPreview(kind: PreviewKey["kind"]): boolean {
  const bridge = window.cuepoint;
  return Boolean(kind === "candidate" ? bridge?.getCandidatePreview : bridge?.getCatalogPreview);
}

async function start(key: PreviewKey): Promise<void> {
  const bridge = window.cuepoint;
  const asked = askBridge(key);
  if (!asked) return;
  clear();
  const mine = ticket;
  const name = nameOf(key);
  current = { name, status: "loading", audio: null, url: null, unsubscribe: null };
  emit();

  let url: string | null = null;
  let failed = false;
  try {
    url = await asked;
  } catch {
    failed = true;
  }
  if (mine !== ticket) {
    if (url) bridge?.releaseCandidatePreview?.(url);
    return;
  }
  if (failed) {
    // An error is not an answer: nothing is remembered, and the next press asks again.
    clear();
    return;
  }
  if (!url) {
    if (key.kind === "catalog") missing.set(name, Date.now() + MISSING_TTL_MS);
    current = { name, status: "none", audio: null, url: null, unsubscribe: null };
    emit();
    return;
  }
  // One sound at a time: the player gives way to a sample.
  try {
    const state = await bridge?.player?.getState();
    if (state?.playback.playing && !state.playback.paused) await bridge?.player?.pause();
  } catch {
    // A player that cannot be asked is not a reason to stay silent.
  }
  if (mine !== ticket) {
    bridge?.releaseCandidatePreview?.(url);
    return;
  }
  const audio = new Audio(url);
  audio.addEventListener("ended", () => {
    if (current?.audio === audio) clear();
  });
  audio.addEventListener("error", () => {
    if (current?.audio === audio) clear();
  });
  // The player starting silences a sample that is sounding.
  const unsubscribe =
    bridge?.player?.subscribeState?.((snapshot) => {
      if (current?.audio === audio && snapshot.playback.playing && !snapshot.playback.paused) {
        clear();
      }
    }) ?? null;
  current = { name, status: "loading", audio, url, unsubscribe };
  try {
    await audio.play();
    if (mine === ticket && current) {
      current = { ...current, status: "playing" };
      emit();
    }
  } catch {
    // A refused play() is not "no sample": reset, remember nothing.
    if (mine === ticket) clear();
  }
}

/** Stop whatever sample is sounding or loading, wherever it was started. */
export function stopAllPreviews(): void {
  if (current) clear();
}

export interface BeatportPreview {
  state: PreviewState;
  /** Play the sample, or stop it when it is playing or loading. */
  toggle: () => void;
  stop: () => void;
  /** False when this build cannot fetch this kind of sample at all. */
  canPreview: boolean;
}

export interface BeatportPreviewOptions {
  /**
   * Stop this key's sound when the component goes (default true). A virtualised
   * table's cell scrolls out while its sample plays, so it passes false and the
   * table stops the catalog on its own lifetime (`stopAllPreviews`).
   */
  stopOnUnmount?: boolean;
}

function stateOf(name: string | null): PreviewState {
  if (name === null) return "idle";
  if (current?.name === name) return current.status;
  return isMissing(name) ? "none" : "idle";
}

/** One key's view of the app's single sample; `null` is no key. */
export function useBeatportPreview(
  key: PreviewKey | null,
  { stopOnUnmount = true }: BeatportPreviewOptions = {},
): BeatportPreview {
  const kind = key?.kind ?? null;
  const id = key?.id ?? null;
  const name = key ? nameOf(key) : null;

  // A primitive per key: only the cells whose own state changed re-render.
  const state = useSyncExternalStore(subscribe, () => stateOf(name));

  const stop = useCallback(() => {
    if (name !== null && current?.name === name) clear();
  }, [name]);

  const toggle = useCallback(() => {
    if (kind === null || id === null) return;
    if (current?.name === `${kind}:${id}` && current.status !== "none") {
      clear();
      return;
    }
    if (isMissing(`${kind}:${id}`)) return;
    void start({ kind, id });
  }, [kind, id]);

  // A new key is another sound; leaving the card or the cell silences it.
  useEffect(() => {
    if (name === null || !stopOnUnmount) return;
    return () => {
      if (current?.name === name) clear();
    };
  }, [name, stopOnUnmount]);

  return { state, toggle, stop, canPreview: kind !== null && canPreview(kind) };
}

/** Test seam: forget everything, including which tracks have no sample. */
export function resetBeatportPreviewsForTests(): void {
  if (current) clear();
  missing.clear();
}

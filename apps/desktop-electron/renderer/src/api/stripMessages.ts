/**
 * What the status strip says about the library's and the window's own state (HARDEN-03,
 * HARDEN-05; owner's picks, DEC-305):
 *
 * - A full disk (an `R002` answer to any request): "Your disk is full. CuePoint can't save changes
 *   until there's space." in the strip's error look, until a write is known to have succeeded (the
 *   engine's library counter moved) or a while passes. A change the page merely announces is not
 *   proof: it is also said after a failed write.
 * - A short note, once, quietly, in the place of "Ready": the last session did not end properly, the
 *   window was reopened, an export was interrupted. Notes take turns, each held for a while.
 *
 * Plain module state read through `useSyncExternalStore`, like the engine's online state: the
 * answers come from catches all over the app and from main, none of them near the strip.
 */
import { useSyncExternalStore } from "react";

import { bridgeErrorFields } from "./bridgeError";
import { onRevisionsChanged } from "./jobsStore";

/** The words for a full disk: the engine's own, so the strip and a refused request agree. */
export const DISK_FULL_WORDS = "Your disk is full. CuePoint can't save changes until there's space.";
export const UNCLEAN_EXIT_WORDS = "CuePoint didn't close properly last time. Your library was checked and is fine.";
export const EXPORT_INTERRUPTED_WORDS = "An export was interrupted. Nothing was written.";

/** How long the full-disk line stays when nothing is saved after it. */
export const DISK_FULL_HOLD_MS = 2 * 60_000;
/** How long a note stays before the next one, or "Ready", takes its place. */
export const NOTICE_HOLD_MS = 20_000;

export interface StripMessages {
  diskFull: boolean;
  /** The note showing now, or null. */
  notice: string | null;
}

let snapshot: StripMessages = { diskFull: false, notice: null };
let queue: string[] = [];
let diskTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
/** Whether the strip is showing the note now (a running job takes its place), and how much of its time is left. */
let noticeShowing = false;
let noticeLeftMs = NOTICE_HOLD_MS;
let noticeArmedAt = 0;
let unwire: (() => void) | null = null;
const listeners = new Set<() => void>();

function publish(next: StripMessages): void {
  if (next.diskFull === snapshot.diskFull && next.notice === snapshot.notice) return;
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

function wire(): void {
  if (unwire) return;
  // The library's change counter moves only when the engine has written; that is the proof.
  unwire = onRevisionsChanged((domains) => {
    if (domains.includes("library")) clearDiskFull();
  });
}

/** A write is known to have succeeded: there is room again. */
export function noteWriteSucceeded(): void {
  clearDiskFull();
}

/** A write was refused for lack of room. Said until a later write succeeds, or for a while. */
export function noteDiskFull(): void {
  wire();
  if (diskTimer !== null) clearTimeout(diskTimer);
  diskTimer = setTimeout(clearDiskFull, DISK_FULL_HOLD_MS);
  publish({ ...snapshot, diskFull: true });
}

export function clearDiskFull(): void {
  if (diskTimer !== null) clearTimeout(diskTimer);
  diskTimer = null;
  publish({ ...snapshot, diskFull: false });
}

/** True for an engine error that says the disk is full (`R002`). */
export function isDiskFull(error: unknown): boolean {
  try {
    return bridgeErrorFields(error).code === "R002";
  } catch {
    return false;
  }
}

/** Note a caught failure if it was a full disk; anything else is left alone. Never throws. */
export function noteIfDiskFull(error: unknown): void {
  if (isDiskFull(error)) noteDiskFull();
}

function armNotice(): void {
  if (noticeTimer !== null || snapshot.notice === null || !noticeShowing) return;
  noticeArmedAt = Date.now();
  noticeTimer = setTimeout(showNext, noticeLeftMs);
}

function disarmNotice(): void {
  if (noticeTimer === null) return;
  clearTimeout(noticeTimer);
  noticeTimer = null;
  noticeLeftMs = Math.max(0, noticeLeftMs - (Date.now() - noticeArmedAt));
}

function showNext(): void {
  if (noticeTimer !== null) clearTimeout(noticeTimer);
  noticeTimer = null;
  const next = queue.shift() ?? null;
  noticeLeftMs = NOTICE_HOLD_MS;
  publish({ ...snapshot, notice: next });
  if (next !== null) armNotice();
}

/**
 * The strip says whether it is showing the note. The hold counts only while it is: a job running
 * takes the strip's place, and a note that timed out behind it would never be read.
 */
export function setNoticeShowing(showing: boolean): void {
  if (showing === noticeShowing) return;
  noticeShowing = showing;
  if (showing) armNotice();
  else disarmNotice();
}

/** Say a note in the strip, quietly, after any that are already showing. The same words are never queued twice. */
export function showStripNotice(text: string): void {
  if (snapshot.notice === text || queue.includes(text)) return;
  queue.push(text);
  if (snapshot.notice === null) showNext();
}

export function subscribeStripMessages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStripMessages(): StripMessages {
  return snapshot;
}

export function useStripMessages(): StripMessages {
  return useSyncExternalStore(subscribeStripMessages, getStripMessages);
}

/** Back to the start; for tests. */
export function resetStripMessagesForTests(): void {
  if (diskTimer !== null) clearTimeout(diskTimer);
  if (noticeTimer !== null) clearTimeout(noticeTimer);
  diskTimer = null;
  noticeTimer = null;
  noticeShowing = false;
  noticeLeftMs = NOTICE_HOLD_MS;
  queue = [];
  snapshot = { diskFull: false, notice: null };
  listeners.clear();
  unwire?.();
  unwire = null;
}

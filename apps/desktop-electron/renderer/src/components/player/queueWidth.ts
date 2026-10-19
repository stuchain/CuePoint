/**
 * How wide the queue is (C204, D11).
 *
 * It opens at the Track details width, 213 times the text size (266px at Small), pushes the page
 * the way Track details does, and can be dragged from 200 to 448 times the text size. The width is
 * kept in 1x units, so a change of text size scales the panel with the text instead of leaving a
 * pixel width that is wrong at every other size (the idea behind `inspectorState.ts`, with its own
 * key).
 */
import { useSyncExternalStore } from "react";

export const QUEUE_WIDTH_STORAGE_KEY = "cuepoint.queue.width1x";

/** 1x units: the Track details default, 320px at the default Medium size. */
export const QUEUE_DEFAULT_WIDTH = 213;
export const QUEUE_MIN_WIDTH = 200;
export const QUEUE_MAX_WIDTH = 448;

/** The queue may never take more of the window than this, whatever was chosen on a wider one. */
const MAX_WINDOW_FRACTION = 0.5;

function clamp1x(width: number): number {
  if (!Number.isFinite(width)) return QUEUE_DEFAULT_WIDTH;
  return Math.min(QUEUE_MAX_WIDTH, Math.max(QUEUE_MIN_WIDTH, width));
}

/**
 * The drawn width in real pixels: the 1x width times the scale, between 200 and 448 times the
 * scale, and (when the window is known) no more than half of it. The minimum wins when the two
 * bounds cross, so a very narrow window never collapses the panel.
 */
export function queueWidthPx(width1x: number, scale: number, windowWidth?: number): number {
  const min = Math.round(QUEUE_MIN_WIDTH * scale);
  const wanted = Math.min(Math.round(QUEUE_MAX_WIDTH * scale), Math.max(min, Math.round(clamp1x(width1x) * scale)));
  if (windowWidth === undefined) return wanted;
  return Math.max(min, Math.min(wanted, Math.floor(windowWidth * MAX_WINDOW_FRACTION)));
}

/** The stored width in 1x units; anything unreadable is the default. */
export function loadQueueWidth(): number {
  try {
    const raw = localStorage.getItem(QUEUE_WIDTH_STORAGE_KEY);
    if (raw === null) return QUEUE_DEFAULT_WIDTH;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp1x(parsed) : QUEUE_DEFAULT_WIDTH;
  } catch {
    return QUEUE_DEFAULT_WIDTH;
  }
}

const listeners = new Set<() => void>();
let width1x: number | null = null;

function current(): number {
  width1x ??= loadQueueWidth();
  return width1x;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Choose a width (1x units); it is clamped, remembered and applied everywhere at once. */
export function setQueueWidth1x(next: number): void {
  const value = clamp1x(next);
  width1x = value;
  try {
    localStorage.setItem(QUEUE_WIDTH_STORAGE_KEY, String(Math.round(value * 100) / 100));
  } catch {
    // A forgotten width is not worth breaking the drag over.
  }
  listeners.forEach((listener) => listener());
}

/** The width in 1x units, shared by everything that draws the queue. */
export function useQueueWidth(): number {
  return useSyncExternalStore(subscribe, current, current);
}

/** Forget the held width, so each test reads storage afresh. */
export function resetQueueWidthForTests(): void {
  width1x = null;
}

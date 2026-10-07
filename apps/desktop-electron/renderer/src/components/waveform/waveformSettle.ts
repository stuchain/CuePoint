/**
 * Rows that scroll past are not asked for (WAVE-06).
 *
 * A table scrolled quickly mounts and unmounts hundreds of rows a second. A row
 * of the Library's "Waveform" column asks for its picture only once it has been
 * on screen for `SETTLE_MS`; one that leaves sooner asks nothing.
 *
 * Rows mounted together settle together: every row that starts waiting in one
 * task shares one timer, and their callbacks run in one task, so the cache
 * requests them as one batch rather than one request a row.
 */
import { useEffect, useState } from "react";

/** How long a row must stay on screen before it is asked for. */
export const SETTLE_MS = 100;

interface Group {
  callbacks: Set<() => void>;
}

interface SettlerOptions {
  delayMs?: number;
  setTimeout?: (run: () => void, ms: number) => unknown;
  /** Ends the current task's group; a microtask by default. */
  endOfTask?: (run: () => void) => void;
}

export class Settler {
  private open: Group | null = null;
  private readonly delayMs: number;
  private readonly startTimer: (run: () => void, ms: number) => unknown;
  private readonly endOfTask: (run: () => void) => void;

  constructor(options: SettlerOptions = {}) {
    this.delayMs = options.delayMs ?? SETTLE_MS;
    this.startTimer = options.setTimeout ?? ((run, ms) => setTimeout(run, ms));
    this.endOfTask = options.endOfTask ?? ((run) => queueMicrotask(run));
  }

  /** Run `callback` once `delayMs` has passed; the returned function cancels it. */
  settle(callback: () => void): () => void {
    let group = this.open;
    if (!group) {
      const made: Group = { callbacks: new Set() };
      group = made;
      this.open = made;
      this.endOfTask(() => {
        if (this.open === made) this.open = null;
      });
      this.startTimer(() => {
        const due = [...made.callbacks];
        made.callbacks.clear();
        due.forEach((run) => run());
      }, this.delayMs);
    }
    const held = group;
    held.callbacks.add(callback);
    return () => {
      held.callbacks.delete(callback);
    };
  }
}

/** The one settler the app's rows share. */
const rowSettler = new Settler();

/**
 * True once `key` has been shown for `SETTLE_MS`; false again, and waiting,
 * when it changes. Null never settles.
 */
export function useSettled(key: number | null, settler: Settler = rowSettler): boolean {
  const [settled, setSettled] = useState<number | null>(null);
  useEffect(() => {
    if (key === null) return undefined;
    return settler.settle(() => setSettled(key));
  }, [key, settler]);
  return key !== null && settled === key;
}

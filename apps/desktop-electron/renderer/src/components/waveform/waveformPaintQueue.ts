/**
 * Canvases painted a few at a time (WAVE-06).
 *
 * The Library's Waveform column paints every row's canvas when a page of rows
 * gets its pictures, and those paints all land in one commit: thirty canvases
 * of a few hundred rectangles each made one task long enough to stall a scroll
 * on a slower machine. A canvas asks this queue instead. While the task that
 * asks has spent less than `PAINT_BUDGET_MS` painting, it paints at once, as
 * before; the rest wait, in the order they asked, for later tasks that each
 * paint for at most that long. A single canvas (the bar, the Inspector, a
 * transition) never waits on a quiet queue.
 *
 * A canvas that asks again before it was painted keeps only its latest paint,
 * and one that goes away is cancelled, so nothing stale is drawn.
 */

/** How long one task may spend painting canvases before the rest wait. */
export const PAINT_BUDGET_MS = 6;

interface PaintQueueOptions {
  budgetMs?: number;
  now?: () => number;
  /** Runs the waiting paints in a later task; a zero timeout by default. */
  defer?: (run: () => void) => void;
  /** Ends the current task's budget; a microtask by default. */
  endOfTask?: (run: () => void) => void;
}

export class PaintQueue {
  private readonly waiting = new Map<object, () => void>();
  /** When the current task started painting; null between tasks. */
  private taskStart: number | null = null;
  private scheduled = false;

  private readonly budgetMs: number;
  private readonly now: () => number;
  private readonly defer: (run: () => void) => void;
  private readonly endOfTask: (run: () => void) => void;

  constructor(options: PaintQueueOptions = {}) {
    this.budgetMs = options.budgetMs ?? PAINT_BUDGET_MS;
    this.now = options.now ?? (() => performance.now());
    this.defer = options.defer ?? ((run) => void setTimeout(run, 0));
    this.endOfTask = options.endOfTask ?? ((run) => queueMicrotask(run));
  }

  /**
   * Paint `key`'s canvas with `paint`: now while this task has time and nothing
   * waits ahead of it, otherwise later. The returned function cancels a paint
   * still waiting.
   */
  paint(key: object, paint: () => void): () => void {
    this.waiting.delete(key);
    if (this.waiting.size === 0 && this.hasTime()) {
      paint();
      return () => {};
    }
    this.waiting.set(key, paint);
    this.schedule();
    return () => {
      if (this.waiting.get(key) === paint) this.waiting.delete(key);
    };
  }

  /** Paints waiting now. */
  get size(): number {
    return this.waiting.size;
  }

  private hasTime(): boolean {
    const now = this.now();
    if (this.taskStart === null) {
      this.taskStart = now;
      this.endOfTask(() => {
        this.taskStart = null;
      });
    }
    return now - this.taskStart < this.budgetMs;
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.defer(() => this.run());
  }

  private run(): void {
    this.scheduled = false;
    const start = this.now();
    for (const [key, paint] of this.waiting) {
      this.waiting.delete(key);
      paint();
      if (this.now() - start >= this.budgetMs) break;
    }
    if (this.waiting.size > 0) this.schedule();
  }
}

/** The one queue every waveform canvas shares. */
export const waveformPaints = new PaintQueue();

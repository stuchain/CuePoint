/**
 * A heartbeat for a process that may stop answering without exiting (HARDEN-05, fact 5).
 *
 * A supervisor restarts a process it sees exit. One that is suspended, starved or wholly wedged
 * does not exit, and was never found. While it is up, `probe` is asked every `intervalMs` and
 * given `timeoutMs` to answer; `maxMisses` misses in a row (3 x 15 s) call it dead, and `onDead`
 * runs once. A single answer resets the count, so two misses then an answer restart nothing.
 *
 * The next probe is waited for, never overlapped with the last: a probe that hangs is a miss at
 * its timeout, not another probe on top of it. A probe that throws is a miss.
 */

export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_TIMEOUT_MS = 10_000;
export const HEARTBEAT_MAX_MISSES = 3;

export interface HeartbeatOptions {
  /** Resolves (to anything but `false`) when the process answered; rejects or resolves `false` when not. */
  probe: () => Promise<unknown>;
  /** The process is not answering any more: three misses in a row. Runs once, then the heartbeat stops. */
  onDead: () => void;
  intervalMs?: number;
  timeoutMs?: number;
  maxMisses?: number;
}

export class Heartbeat {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private misses = 0;
  /** Counts starts and stops, so a probe that finishes after a stop does nothing. */
  private epoch = 0;

  constructor(private readonly options: HeartbeatOptions) {}

  get active(): boolean {
    return this.running;
  }

  /** Misses in a row so far; for tests. */
  get missed(): number {
    return this.misses;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.misses = 0;
    this.epoch += 1;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.epoch += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const epoch = this.epoch;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.beat(epoch);
    }, this.options.intervalMs ?? HEARTBEAT_INTERVAL_MS);
    // A heartbeat must not keep the app alive.
    this.timer.unref?.();
  }

  private async beat(epoch: number): Promise<void> {
    const answered = await this.ask();
    // Stopped (or restarted) while the probe was out: its answer is about a process that is gone.
    if (epoch !== this.epoch) return;
    if (answered) {
      this.misses = 0;
    } else {
      this.misses += 1;
      if (this.misses >= (this.options.maxMisses ?? HEARTBEAT_MAX_MISSES)) {
        this.stop();
        try {
          this.options.onDead();
        } catch {
          /* what the supervisor does about it must not throw into a timer */
        }
        return;
      }
    }
    this.schedule();
  }

  private ask(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const limit = setTimeout(() => resolve(false), this.options.timeoutMs ?? HEARTBEAT_TIMEOUT_MS);
      limit.unref?.();
      let pending: Promise<unknown>;
      try {
        pending = this.options.probe();
      } catch {
        clearTimeout(limit);
        resolve(false);
        return;
      }
      pending.then(
        (result) => {
          clearTimeout(limit);
          resolve(result !== false);
        },
        () => {
          clearTimeout(limit);
          resolve(false);
        },
      );
    });
  }
}

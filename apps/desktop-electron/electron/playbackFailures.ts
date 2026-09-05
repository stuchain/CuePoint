/**
 * Telling the user about tracks that would not play (PLAYER-10, DEC-054).
 *
 * The hard requirement here is not the message, it is the *silence between*
 * messages. DEC-037 leaves file existence unchecked until Phase 7, so the
 * player is the first thing in CuePoint to discover a disconnected drive — and
 * on a disconnected drive every track in the queue fails, one after another, as
 * fast as mpv can try them. A toast per failure would put five thousand toasts
 * on screen. One toast that says "5,000 tracks could not be played" is the
 * whole point of the step.
 *
 * So failures are collected into a **run**: consecutive failures with no
 * successful playback between them. A run is reported once, when it ends —
 * which is when nothing has failed for `FAILURE_COALESCE_MS`, or when playback
 * stops because there is nothing left to try. A run of one names the track,
 * because a single missing file is worth naming; a run of twelve does not try
 * to name twelve.
 *
 * The timer is what makes the run's end observable. It is deliberately short:
 * long enough that a drive full of failures reports once, short enough that a
 * single failure is reported while the user still remembers what they clicked.
 */

/**
 * How long a run waits for another failure before it is reported.
 *
 * Failures on a dead drive arrive within a few milliseconds of each other
 * (mpv fails to open a file far faster than it plays one), so this window
 * closes only when the failures genuinely stop.
 */
export const FAILURE_COALESCE_MS = 400;

export interface PlaybackFailure {
  /** What the queue calls the track. May be blank for an untitled item. */
  title: string;
  /** mpv's own explanation, from `end-file`'s `file_error`, when it gave one. */
  reason: string | null;
}

export interface FailureReport {
  count: number;
  /** The title, only when exactly one track failed. */
  title: string | null;
  /** The reason, only when exactly one track failed and mpv gave one. */
  reason: string | null;
  /** True when this run of failures is what ended playback. */
  stopped: boolean;
  message: string;
}

/** What the user is told. */
export function failureMessage(
  count: number,
  title: string | null,
  reason: string | null,
  stopped: boolean,
): string {
  const named = title !== null && title.trim() !== "";
  let message: string;
  if (count <= 1) {
    message = named ? `Could not play “${title!.trim()}”` : "Could not play that track";
    if (reason && reason.trim() !== "") message += ` (${reason.trim()})`;
  } else {
    message = `${count.toLocaleString()} tracks could not be played`;
  }
  // Said only when the failures are why nothing is playing any more. A run that
  // ended because the next track played fine needs no such warning.
  return stopped ? `${message} — playback stopped` : message;
}

/**
 * Something the user is told once (PLAYER-10).
 *
 * `track-failed` is a file that would not play; `player-unavailable` is mpv
 * itself being gone. PLAYER-03 flagged the risk of confusing the two, and they
 * are answered differently: one is "the drive is unplugged", the other is
 * "there is no audio player".
 */
export type PlayerNoticeKind = "track-failed" | "player-unavailable";

export interface PlayerNotice {
  /** Rises with every notice, so a renderer can tell a repeat from a re-send. */
  id: number;
  kind: PlayerNoticeKind;
  message: string;
  /** How many tracks the notice covers. Zero when it is not about tracks. */
  count: number;
  /** True when playback stopped as a result. */
  stopped: boolean;
}

export interface FailureReporterOptions {
  onReport: (report: FailureReport) => void;
  /** Overridden in tests that do not want to wait. */
  windowMs?: number;
}

export class FailureReporter {
  private count = 0;
  private first: PlaybackFailure | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private readonly windowMs: number;

  constructor(private readonly options: FailureReporterOptions) {
    this.windowMs = options.windowMs ?? FAILURE_COALESCE_MS;
  }

  /** How many failures are waiting to be reported. Zero when none are. */
  get pending(): number {
    return this.count;
  }

  record(failure: PlaybackFailure): void {
    if (this.disposed) return;
    this.count += 1;
    this.first ??= failure;
    this.arm();
  }

  /**
   * Playback stopped, so report now rather than after the window.
   *
   * Waiting here would be wrong twice over: the message would arrive after the
   * user has already noticed the silence, and it would not be able to say that
   * the silence is the point.
   */
  stopped(): void {
    this.flush(true);
  }

  /** Report whatever has accumulated. Does nothing when nothing has. */
  flush(stopped = false): void {
    this.clearTimer();
    if (this.count === 0) return;
    const count = this.count;
    const first = this.first;
    this.count = 0;
    this.first = null;
    const title = count === 1 ? (first?.title ?? null) : null;
    const reason = count === 1 ? (first?.reason ?? null) : null;
    this.options.onReport({
      count,
      title,
      reason,
      stopped,
      message: failureMessage(count, title, reason, stopped),
    });
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.count = 0;
    this.first = null;
  }

  private arm(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush(false);
    }, this.windowMs);
    // Never a reason to keep the process alive; a pending toast is not work.
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

/**
 * What the engine's and the player's supervisors report, and when (REPORT-05, DEC-028, DEC-126).
 *
 * Both supervisors restart a process that dies, up to a bound, and give up after it. From
 * outside that is one story, so it is one report: the first exit that was not asked for opens
 * an incident, each restart is a breadcrumb on its trail, and the incident ends with ONE event,
 * when a restart comes back healthy or when the supervisor gives up. A crash loop of three
 * restarts and a give-up is one event and the breadcrumbs, never four reports.
 *
 * The supervisors do not import the Sentry SDK. They are given a `ProcessReporter`, which
 * `main.ts` builds from `reporting.ts`, so a test records the calls and a supervisor with no
 * reporter does nothing. Nothing here is a business rule: it only decides what is worth saying.
 *
 * Not reported, because the callers never reach this file: a deliberate `stop()`, the app quitting,
 * and the user's Restart. Their exits are ours.
 *
 * An incident still open when the app quits (`abandon()`) is dropped, not sent as an "interrupted"
 * event: `main.ts` waits for neither the SDK's flush nor its transport before the app exits (the quit
 * path holds the app for the supervisors' `stop()` and nothing else), so such an event would be sent
 * only on a lucky quit. Its breadcrumbs are lost with the process. If a flush is ever wired into the
 * quit path, `abandon()` is the place to send it.
 */

/** Lines kept from each of a process's output streams. */
export const OUTPUT_TAIL_LINES = 50;
/** The longest line kept; a runaway line is cut and says so. */
export const OUTPUT_LINE_CHARS = 2000;

/** `line`, cut to `OUTPUT_LINE_CHARS` with a marker when it was longer. */
export function capLine(line: string): string {
  return line.length > OUTPUT_LINE_CHARS ? `${line.slice(0, OUTPUT_LINE_CHARS)} ...[truncated]` : line;
}

export type ProcessName = "engine" | "player";

/** How an incident ended. */
export type IncidentOutcome = "recovered" | "gave-up" | "start-failed";

/** The last lines of a process's output, by stream. Either may be absent (the player has no stdout). */
export interface OutputTail {
  stdout?: readonly string[];
  stderr?: readonly string[];
}

/** The attachment an event carries: a name `reportScrub.ts` allows, and its text, not yet scrubbed. */
export interface IncidentAttachment {
  filename: "engine-output.txt" | "player-output.txt";
  text: string;
}

/** One event: what happened to which process, with the numbers that explain it. */
export interface ProcessIncident {
  process: ProcessName;
  outcome: IncidentOutcome;
  /** The event's message, e.g. "engine exited unexpectedly". */
  message: string;
  data: {
    /** The exit code of the last exit that was not asked for, if it exited with one. */
    exit_code: number | null;
    /** The signal that ended it, if one did. */
    signal: string | null;
    /** Automatic restarts made during the incident. */
    restarts: number;
    /** How long the process that died last had run, in milliseconds. */
    uptime_ms: number | null;
    /** Exits that were not asked for, during the incident. */
    exits: number;
    /** Why the supervisor stopped trying (`gave-up` and `start-failed`). */
    reason?: string;
  };
  attachment: IncidentAttachment | null;
}

export interface ProcessReporter {
  breadcrumb(category: string, message: string, data?: Record<string, unknown>): void;
  incident(incident: ProcessIncident): void;
  /** A secret the supervisor made (the engine's session token), so the scrubber can remove it. */
  addToken?(token: string): void;
}

export interface ProcessExit {
  code: number | null;
  signal: string | null;
  /** How long the process had run, in milliseconds. */
  uptimeMs: number | null;
}

/** The text of an output tail: each stream under a heading, last lines only. */
export function outputText(tail: OutputTail): string {
  const parts: string[] = [];
  for (const stream of ["stdout", "stderr"] as const) {
    const lines = tail[stream];
    if (lines === undefined) continue;
    const kept = lines.slice(-OUTPUT_TAIL_LINES);
    parts.push(`== ${stream} (last ${kept.length} lines) ==`, ...(kept.length > 0 ? kept : ["(nothing)"]));
  }
  return parts.join("\n");
}

/**
 * The state machine for one supervised process. A supervisor tells it what happened; it
 * speaks to the reporter. Never throws: a reporter that fails is no reason to stop a supervisor.
 */
export class IncidentTracker {
  private open: { last: ProcessExit; exits: number; restarts: number } | null = null;
  private readonly startFailures = new Set<string>();

  constructor(
    private readonly process: ProcessName,
    private readonly reporter: ProcessReporter | undefined,
  ) {}

  /** True from the first exit that was not asked for until the incident's event is sent. */
  get isOpen(): boolean {
    return this.open !== null;
  }

  /** The process exited and nobody asked it to. Opens an incident, or adds an exit to the open one. */
  exited(exit: ProcessExit): void {
    if (this.open === null) this.open = { last: exit, exits: 1, restarts: 0 };
    else {
      this.open.last = exit;
      this.open.exits += 1;
    }
    this.crumb(`${this.process} exited unexpectedly`, {
      exit_code: exit.code,
      signal: exit.signal,
      uptime_ms: exit.uptimeMs,
    });
  }

  /** An automatic restart is about to be tried. */
  restarting(attempt: number, delayMs: number): void {
    if (this.open !== null) this.open.restarts += 1;
    this.crumb(`${this.process} restarting`, { attempt, delay_ms: delayMs });
  }

  /** A restart came back healthy. Ends the open incident with its event; nothing when none is open. */
  recovered(output: OutputTail): void {
    if (this.open === null) return;
    this.send("recovered", `${this.process} exited unexpectedly`, undefined, output);
  }

  /**
   * The supervisor will not try again: the open incident's one event. Nothing when none is open, so a
   * second restart loop reaching its end cannot send a second report for the same incident.
   */
  gaveUp(reason: string, output: OutputTail): void {
    if (this.open === null) return;
    this.send("gave-up", `${this.process} exited unexpectedly and was given up on`, reason, output);
  }

  /** The app is quitting with an incident open: forget it, unsent (see the file comment). */
  abandon(): void {
    this.open = null;
  }

  /**
   * A launch that failed without an exit to explain it (a health check that timed out, a
   * missing bundled engine). Once per `key` for as long as this tracker lives, which is the
   * launch of the app. Nothing while an incident is open: that one carries the story.
   */
  startFailed(key: string, message: string, reason: string, output: OutputTail): void {
    if (this.open !== null || this.startFailures.has(key)) return;
    this.startFailures.add(key);
    this.send("start-failed", message, reason, output);
  }

  private send(outcome: IncidentOutcome, message: string, reason: string | undefined, output: OutputTail): void {
    const open = this.open;
    this.open = null;
    const incident: ProcessIncident = {
      process: this.process,
      outcome,
      message,
      data: {
        exit_code: open?.last.code ?? null,
        signal: open?.last.signal ?? null,
        restarts: open?.restarts ?? 0,
        uptime_ms: open?.last.uptimeMs ?? null,
        exits: open?.exits ?? 0,
        ...(reason !== undefined ? { reason } : {}),
      },
      attachment: {
        filename: this.process === "engine" ? "engine-output.txt" : "player-output.txt",
        text: outputText(output),
      },
    };
    try {
      this.reporter?.incident(incident);
    } catch {
      // Reporting must never stop a supervisor.
    }
  }

  private crumb(message: string, data: Record<string, unknown>): void {
    try {
      this.reporter?.breadcrumb("process", message, data);
    } catch {
      // As above.
    }
  }
}

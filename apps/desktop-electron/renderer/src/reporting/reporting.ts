/**
 * The page's error reporting (REPORT-06, DEC-126, DEC-127, DEC-128, DEC-152).
 *
 * `setupRendererReporting` starts the reporter before React renders, and only when
 * Electron main says reporting is set up (it has an address to send to): a build
 * with none does nothing. Reports go through main, whose `beforeSend` applies the
 * choice and the scrubber to every error event. The page keeps its own copy of the
 * choice (`setReportingChoice`) so it also adds no steps, makes no report and shows
 * no report id while reporting is off.
 *
 * Every function here is safe to call when reporting is not set up, and never throws.
 */
import { bridgeErrorFields, isEngineRefusal } from "../api/bridgeError";
import type { CuePointBridge } from "../api/cuepointBridge.types";
import {
  electronRendererFacade,
  rendererSdkOptions,
  type FeedbackPayload,
  type ReportingFacade,
} from "./sdk";

/** The part of the bridge this module reads. */
type ReportingBridge = Pick<CuePointBridge, "errorReporting" | "engineErrorFields">;

interface State {
  sdk: ReportingFacade;
  /** Where an error's status, code and report id are read from (`bridgeErrorFields`). */
  bridge: ReportingBridge;
  enabled: boolean;
}

let state: State | null = null;
let lastReport: string | null = null;
/**
 * What was reported for an error object, so one that is caught, reported and rethrown is
 * one event (and the boundary can still show its id).
 */
let reportedErrors = new WeakMap<object, string | null>();
/** What was reported for each distinct error (its text and its top frame), so a poll that fails every few seconds is one event. */
let reportedKeys = new Map<string, string | null>();
const MAX_REPORTED_KEYS = 200;
/** The error `reportUnexpected` is handing to the SDK, which `beforeSend` has already judged. */
let ownCapture: { error: unknown } | null = null;

export interface RendererReportingOptions {
  bridge?: ReportingBridge;
  /** Replaces the real SDK; for tests. */
  sdk?: ReportingFacade;
}

/**
 * Start reporting. Answers true when it started. Nothing is set up when the bridge is
 * missing or cannot be read, or when main has not set reporting up. Never throws.
 */
export async function setupRendererReporting(options: RendererReportingOptions = {}): Promise<boolean> {
  try {
    const bridge = options.bridge ?? (typeof window === "undefined" ? undefined : window.cuepoint);
    if (!bridge?.errorReporting) return false;
    const answer = await bridge.errorReporting.get();
    if (answer.configured !== true) return false;
    const sdk = options.sdk ?? electronRendererFacade();
    state = { sdk, bridge, enabled: answer.enabled };
    lastReport = null;
    reportedErrors = new WeakMap();
    reportedKeys = new Map();
    ownCapture = null;
    sdk.init(
      rendererSdkOptions({
        breadcrumbAllowed: () => state?.enabled === true,
        beforeSend: judgeEvent,
      }),
    );
    return true;
  } catch {
    // Reporting must never stop the app starting.
    state = null;
    return false;
  }
}

/** Forget everything; for tests. */
export function resetRendererReporting(): void {
  state = null;
  lastReport = null;
  reportedErrors = new WeakMap();
  reportedKeys = new Map();
  ownCapture = null;
}

/** Whether a report may be made now: set up, and the choice is on. */
export function reportingActive(): boolean {
  return state !== null && state.enabled;
}

/** Whether reporting is set up at all, whatever the choice (Help's menu item is disabled without it). */
export function reportingSetUp(): boolean {
  return state !== null;
}

/** The Settings switch changed. Takes effect at once: later steps and reports are not kept. */
export function setReportingChoice(enabled: boolean): void {
  if (state !== null) state.enabled = enabled;
}

/** The id of the last report this page made, or of the last engine report it saw. */
export function lastReportId(): string | null {
  return lastReport;
}

export interface UnexpectedContext {
  /** React's component stack, from an error boundary. */
  componentStack?: string;
  tags?: Record<string, string>;
}

/**
 * The engine or the player is not there: stopped, starting or restarting. Polled calls fail
 * this way every few seconds for as long as it lasts, so it is not a bug report; main reports
 * an outage once (REPORT-05). Main marks such an error `UNAVAILABLE` across the bridge.
 */
function isOutage(error: unknown, bridge: ReportingBridge): boolean {
  if (bridgeErrorFields(error, bridge).code === "UNAVAILABLE") return true;
  if (!(error instanceof Error)) return false;
  return error.message.startsWith("Engine not running") || error.message === "fetch failed";
}

/** A string that says which error this is, whatever was thrown: its name, text and top frame. */
function errorKey(error: unknown): string {
  if (error instanceof Error) {
    const frame = (error.stack ?? "").split("\n").find((line) => /^\s+at\s/.test(line)) ?? "";
    return `${error.name}|${error.message}|${frame.trim()}`;
  }
  if (typeof error === "string") return `string|${error}`;
  try {
    return `${typeof error}|${JSON.stringify(error) ?? String(error)}`;
  } catch {
    return `${typeof error}|${Object.prototype.toString.call(error)}`;
  }
}

/** What is to be done with an error: say nothing (null id) or answer an earlier id, or send it. */
type Admission = { send: false; id: string | null } | { send: true; key: string };

function admit(error: unknown, on: State): Admission {
  if (typeof error === "object" && error !== null && reportedErrors.has(error)) {
    return { send: false, id: reportedErrors.get(error) ?? null };
  }
  if (isEngineRefusal(error, on.bridge) || isOutage(error, on.bridge)) return { send: false, id: null };
  const { reportId } = bridgeErrorFields(error, on.bridge);
  if (reportId !== null) {
    // Already reported, by the engine or by main: its id is the report, and the last one.
    lastReport = reportId;
    return { send: false, id: null };
  }
  const key = errorKey(error);
  if (reportedKeys.has(key)) return { send: false, id: reportedKeys.get(key) ?? null };
  return { send: true, key };
}

function remember(error: unknown, key: string, id: string): void {
  if (reportedKeys.size >= MAX_REPORTED_KEYS) reportedKeys.clear();
  reportedKeys.set(key, id);
  if (typeof error === "object" && error !== null) reportedErrors.set(error, id);
  lastReport = id;
}

/**
 * The SDK's `beforeSend`, for every event it is about to send. An event `reportUnexpected`
 * made was judged there. Any other with an `originalException` (the global handlers': an
 * uncaught error, an unhandled rejection) gets the same rules, and a sent one is remembered, so
 * it is the last report and is not sent twice. An event with no exception passes.
 */
function judgeEvent(event: Record<string, unknown>, hint?: { originalException?: unknown }): Record<string, unknown> | null {
  const on = state;
  if (on === null || !on.enabled) return null;
  try {
    const original = hint?.originalException;
    if (ownCapture !== null && ownCapture.error === original) return event;
    if (original === undefined || original === null) return event;
    const verdict = admit(original, on);
    if (!verdict.send) return null;
    if (typeof event.event_id === "string") remember(original, verdict.key, event.event_id);
    return event;
  } catch {
    return event;
  }
}

/**
 * Report an error the page did not expect. Nothing for an engine refusal (the engine
 * said no; nothing is broken), nothing for an outage, and nothing for an error carrying
 * a `reportId` (the engine or main already reported it; the id is remembered as the last
 * report). An error already reported, by object or by its text and top frame, is not
 * reported again and answers the id it had. Answers the event id, or null when nothing
 * was sent. Never throws.
 */
export function reportUnexpected(error: unknown, context: UnexpectedContext = {}): string | null {
  const on = state;
  if (on === null || !on.enabled) return null;
  try {
    const verdict = admit(error, on);
    if (!verdict.send) return verdict.id;
    ownCapture = { error };
    let id: string;
    try {
      id = on.sdk.captureException(error, {
        level: "error",
        ...(context.tags ? { tags: context.tags } : {}),
        // Beside `level` and `tags`, not under a `captureContext` key: the SDK reads a hint
        // holding any of those as the capture context itself.
        ...(context.componentStack ? { contexts: { react: { componentStack: context.componentStack } } } : {}),
      });
    } finally {
      ownCapture = null;
    }
    remember(error, verdict.key, id);
    return id;
  } catch {
    return null;
  }
}

/** A step before an error. Nothing is kept when reporting is off. Never throws. */
export function reportBreadcrumb(category: string, message: string): void {
  const on = state;
  if (on === null || !on.enabled) return;
  try {
    on.sdk.addBreadcrumb({ category, message, level: "info" });
  } catch {
    // A step is not worth a failure.
  }
}

/** The destination the user is on, by its id (`library`, `clean`): never the path, hash or query. */
export function reportNavigation(destinationId: string): void {
  reportBreadcrumb("navigation", destinationId);
}

/** An error toast was shown. Its kind only: the words may carry a name. */
export function reportToast(kind: string): void {
  reportBreadcrumb("toast", kind);
}

/**
 * Send the user's note as Sentry user feedback (DEC-152). The note is sent exactly as
 * written; the version and the last report id are the app's own fields. Resolves with the
 * feedback id once Sentry has answered with a success, and with null when reporting is off
 * or not set up. Rejects when the note was not sent, so the dialog can say so.
 */
export async function sendProblemReport(note: string, version: string): Promise<string | null> {
  const on = state;
  if (on === null || !on.enabled) return null;
  const last = lastReport;
  const payload: FeedbackPayload = {
    message: note,
    tags: { "app.version": version, ...(last ? { "last.report": last } : {}) },
    ...(last && /^[0-9a-f]{32}$/i.test(last) ? { associatedEventId: last } : {}),
  };
  const { id, sent } = await on.sdk.captureFeedback(payload);
  if (!sent) throw new Error("The note was not sent.");
  return id;
}

/**
 * Electron main reports its own failures (REPORT-04, DEC-126, DEC-127, DEC-128, DEC-149).
 *
 * `setupMainReporting` starts the Sentry Electron SDK at the top of `main.ts`, and
 * only when a DSN is given (`mainReportingDsn`: `CUEPOINT_SENTRY_DSN`, else the built-in DSN
 * of a packaged app, never from source). Everything the SDK would do by default that DEC-127
 * forbids is switched off here, and REPORT-02's scrubber is the last step of every
 * event and breadcrumb:
 *
 * - the plain transport, never the offline one that queues reports on disk and sends
 *   them at the next launch ("never queued for later", DEC-128);
 * - `sendDefaultPii: false`, no server name, no tracing, no client reports;
 * - an allowlist of integrations (`MAIN_INTEGRATIONS`), not a blocklist: no native
 *   crash dumps (DEC-149), screenshots, replay, local variables, console, session
 *   or network breadcrumbs, and none the SDK adds in a later release until it is chosen;
 * - the choice (`ErrorReportingChoice`) is read at the time of each event and each
 *   breadcrumb, so turning reporting off takes effect at once.
 *
 * What the SDK does not report by itself is reported here: a throwing IPC handler
 * (`wrapIpcHandler`), a renderer or helper process that is gone, `engine.start()`'s
 * swallowed failure. An engine error is never reported twice: below 500 it is a
 * refusal and is not reported, and one of 500 or more that the engine reported
 * itself (it carries `reportId`) is a breadcrumb naming that report. The engine and the
 * player are reported by their supervisors, once per incident, through `processReporter`
 * (REPORT-05): an outage seen by IPC is only a breadcrumb.
 *
 * Renderer to main: the SDK is started with `ipcMode` Classic only. That opens no `sentry-ipc`
 * protocol; the page reaches main's `sentry-ipc.*` channels only through the narrow
 * `__SENTRY_IPC__` bridge in `preload.cjs` (REPORT-06), which forwards error events and feedback
 * and drops the rest. What a renderer SDK sends bypasses main's `beforeSend` except for error
 * events: feedback, sessions, logs, metrics, replay, profile chunks, spans and scope updates (user,
 * tags, extras, breadcrumbs) do not pass it, so the renderer SDK keeps them off and the preload
 * refuses them; main's scrubber still runs over the scope data when an event is sent.
 *
 * The SDK is a value (`ReportingSdk`) because `@sentry/electron/main` throws on load
 * when it is not inside Electron, so this file can be tested under Node.
 */
import { createRequire } from "node:module";

import { bridgeSafeError } from "./bridgeError";
import type { BuildInfo } from "./buildInfo";
import { EngineError, setEngineTraceHeaders } from "./engineClient";
import type { ProcessIncident, ProcessReporter } from "./processWatch";
import { scrubAttachment, scrubEvent, type ScrubContext } from "./reportScrub";

/** What `guardRendererChannels` needs of Electron's `ipcMain`. */
export interface GuardableIpc {
  listeners(channel: string): Array<(...args: never[]) => unknown>;
  removeAllListeners(channel: string): unknown;
  on(channel: string, listener: (...args: never[]) => unknown): unknown;
}

/** The channels the SDK listens on with `ipcMain.on`, which have no handler of their own to catch. */
const SDK_ON_CHANNELS = ["sentry-ipc.envelope", "sentry-ipc.structured-log", "sentry-ipc.metric", "sentry-ipc.scope"];

/**
 * The SDK parses what the page sends inside an `ipcMain.on` listener that does not catch:
 * an envelope that is not an envelope would be an uncaught exception in main. Each of those
 * listeners is wrapped, so a bad message from the page is dropped (and noted), never thrown.
 * `ipc` is Electron's `ipcMain`; without it (outside Electron) nothing is wrapped.
 */
export function guardRendererChannels(ipc: GuardableIpc | undefined = loadIpcMain()): void {
  if (!ipc) return;
  for (const channel of SDK_ON_CHANNELS) {
    const listeners = ipc.listeners(channel);
    if (listeners.length === 0) continue;
    ipc.removeAllListeners(channel);
    for (const listener of listeners) {
      ipc.on(channel, (...args: never[]) => {
        try {
          return listener(...args);
        } catch {
          breadcrumb("renderer-report", "a message from the page was dropped");
          return undefined;
        }
      });
    }
  }
}

function loadIpcMain(): GuardableIpc | undefined {
  try {
    const found = createRequire(import.meta.url)("electron") as { ipcMain?: GuardableIpc };
    return found.ipcMain;
  } catch {
    return undefined;
  }
}

/** The part of the Sentry SDK this file uses. */
export interface ReportingSdk {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, hint?: Record<string, unknown>): string;
  captureMessage(message: string, hint?: Record<string, unknown>): string;
  /** The one call that takes an `EventHint`, and so the one that can carry attachments (REPORT-05). */
  captureEvent(event: Record<string, unknown>, hint?: Record<string, unknown>): string;
  addBreadcrumb(crumb: Record<string, unknown>): void;
  getTraceData(): Record<string, string | undefined>;
  getDefaultIntegrations(options: Record<string, unknown>): ReadonlyArray<{ name: string }>;
  /** The SDK's plain transport: events are sent now or lost, never stored. */
  makeElectronTransport: unknown;
}

export interface MainReportingOptions {
  /** From `mainReportingDsn()`; none means nothing is set up. */
  dsn?: string;
  /** The user's choice, read each time an event or breadcrumb would be kept. */
  choice: () => boolean;
  /**
   * Held, not copied: `addReportingToken` adds the engine's token to it when
   * it is known.
   */
  scrubContext: ScrubContext;
  /** Replaces the plain transport; for tests, with a fake. */
  transport?: unknown;
  /** Replaces the Electron SDK; for tests. */
  sdk?: ReportingSdk;
  /**
   * Which build this is (`buildInfo.ts`): its release, `dist` and environment stamp every event
   * main sends, and the renderer's, which go through main (REPORT-07, DEC-126).
   */
  build?: Pick<BuildInfo, "release" | "dist" | "environment">;
}

/**
 * The integrations that stay on, by the name the SDK gives them. Uncaught exceptions
 * and unhandled rejections are on; the rest add context to an event (what runtime and
 * what OS) or tidy it (grouping, paths, linked causes) and read nothing of the user's.
 */
export const MAIN_INTEGRATIONS: readonly string[] = [
  "OnUncaughtException",
  "OnUnhandledRejection",
  "EventFilters",
  "InboundFilters",
  "FunctionToString",
  "LinkedErrors",
  "ElectronContext",
  "AdditionalContext",
  "GpuContext",
  "Context",
  "NormalizePaths",
];

/** Calls the renderer polls; their success is not worth a breadcrumb among 50. */
const QUIET_CHANNELS = new Set([
  "engine:status",
  "engine:listJobs",
  "engine:getJob",
  "player:getState",
  "errorReporting:get",
  "app:buildInfo",
  "testHooks:enabled",
]);
/** Most distinct unexpected IPC errors remembered for the once-per-launch rule. */
const MAX_REPORTED_IPC = 200;
const BREADCRUMB_LIMIT = 50;

interface Active {
  sdk: ReportingSdk;
  choice: () => boolean;
  ctx: ScrubContext;
}

let active: Active | null = null;
const reportedOnce = new Set<string>();
let lastQuietIpc: string | null = null;
/** What main reported for each unexpected IPC error (key to event id), so a repeat answers the same id. */
const reportedIpc = new Map<string, string | null>();
let quitting = false;

/**
 * The Electron project's DSN (DEC-148), EU region: main and the renderer report to it. A DSN only
 * allows sending events, so it is safe to ship, as the Qt app shipped its own. Used only by a
 * packaged app with `CUEPOINT_SENTRY_DSN` unset (DEC-150).
 */
export const BUILT_IN_MAIN_DSN =
  "https://54d66cd51dba660a8c6f2a5ca6ffe4bc@o4510867725746176.ingest.de.sentry.io/4512215272915024";

/**
 * The DSN main reports to, or undefined for none (DEC-148, DEC-150). `CUEPOINT_SENTRY_DSN` set to
 * `off` (any case) is none; set to anything else it is that DSN in any build; unset or empty it is
 * the built-in DSN for a packaged app (`packaged`) and none from source.
 */
export function mainReportingDsn(env: NodeJS.ProcessEnv = process.env, packaged = false): string | undefined {
  const value = (env.CUEPOINT_SENTRY_DSN ?? "").trim();
  if (value.toLowerCase() === "off") return undefined;
  if (value !== "") return value;
  return packaged ? BUILT_IN_MAIN_DSN : undefined;
}

function loadElectronSdk(): ReportingSdk {
  // Required, not imported: loading it outside Electron throws, and `main.ts` is
  // bundled with its packages external.
  const sentry = createRequire(import.meta.url)("@sentry/electron/main") as ReportingSdk;
  return {
    init: (options) => sentry.init(options),
    captureException: (error, hint) => sentry.captureException(error, hint),
    captureMessage: (message, hint) => sentry.captureMessage(message, hint),
    captureEvent: (event, hint) => sentry.captureEvent(event, hint),
    addBreadcrumb: (crumb) => sentry.addBreadcrumb(crumb),
    getTraceData: () => sentry.getTraceData(),
    getDefaultIntegrations: (options) => sentry.getDefaultIntegrations(options),
    makeElectronTransport: sentry.makeElectronTransport,
  };
}

function enabledNow(): Active | null {
  if (active === null) return null;
  try {
    return active.choice() ? active : null;
  } catch {
    return null;
  }
}

/** The one place the choice is applied to an event, then the scrubber, last. */
function beforeSend(event: Record<string, unknown>): Record<string, unknown> | null {
  const on = enabledNow();
  return on === null ? null : scrubEvent(event, on.ctx);
}

function beforeBreadcrumb(crumb: Record<string, unknown>): Record<string, unknown> | null {
  const on = enabledNow();
  if (on === null) return null;
  const kept = scrubEvent({ breadcrumbs: [crumb] }, on.ctx).breadcrumbs;
  return Array.isArray(kept) && kept.length > 0 ? (kept[0] as Record<string, unknown>) : null;
}

/**
 * Start reporting. Answers false, and sets nothing up, when there is no DSN. Call
 * before `app.whenReady()`: the SDK registers its protocol before the app is ready.
 */
export function setupMainReporting(options: MainReportingOptions): boolean {
  const dsn = options.dsn?.trim();
  if (!dsn || dsn.toLowerCase() === "off") return false;
  const build = options.build;
  try {
    const sdk = options.sdk ?? loadElectronSdk();
    const base = { dsn, sendDefaultPii: false };
    const integrations = sdk.getDefaultIntegrations(base).filter((i) => MAIN_INTEGRATIONS.includes(i.name));

    active = { sdk, choice: options.choice, ctx: options.scrubContext };
    reportedOnce.clear();
    reportedIpc.clear();
    lastQuietIpc = null;
    quitting = false;

    sdk.init({
      ...base,
      // A list, so the SDK's own defaults (native dumps, screenshots, offline-only
      // breadcrumbs, local variables) are replaced rather than added to.
      defaultIntegrations: integrations,
      includeServerName: false,
      attachScreenshot: false,
      sendClientReports: false,
      maxBreadcrumbs: BREADCRUMB_LIMIT,
      // IPCMode.Classic (1): no `sentry-ipc` protocol is registered. See the file comment.
      ipcMode: 1,
      transport: options.transport ?? sdk.makeElectronTransport,
      ...(build?.release ? { release: build.release } : {}),
      ...(build?.dist ? { dist: build.dist } : {}),
      ...(build?.environment ? { environment: build.environment } : {}),
      beforeSend,
      beforeBreadcrumb,
    });

    guardRendererChannels();

    // With tracing off the SDK still has a trace id for the process, and it is the id
    // on main's own events. The engine continues it, so an engine report and the main
    // report it led to share one (DEC-126). Nothing is added once the choice is off.
    setEngineTraceHeaders(() => {
      const on = enabledNow();
      if (on === null) return {};
      const data = on.sdk.getTraceData();
      const headers: Record<string, string> = {};
      if (typeof data["sentry-trace"] === "string") headers["sentry-trace"] = data["sentry-trace"];
      if (typeof data.baggage === "string") headers.baggage = data.baggage;
      return headers;
    });
    return true;
  } catch {
    // Reporting must never stop the app: a missing module or a refused init is no reporting.
    teardownMainReporting();
    return false;
  }
}

/** The app is quitting: processes that go now are going on purpose. Nothing is reported as gone. */
export function markQuitting(): void {
  quitting = true;
}

/** Add a secret (the engine's session token) to what the scrubber removes. */
export function addReportingToken(token: string): void {
  if (active !== null && token && !active.ctx.tokens.includes(token)) active.ctx.tokens.push(token);
}

/** Stop reporting and forget what was learned; for tests. */
export function teardownMainReporting(): void {
  active = null;
  reportedOnce.clear();
  reportedIpc.clear();
  lastQuietIpc = null;
  quitting = false;
  setEngineTraceHeaders(null);
}

export interface ReportContext {
  tags?: Record<string, string>;
  level?: "fatal" | "error" | "warning";
}

/**
 * Report an error main did not expect. Answers the event id, or null when reporting
 * is off, is not set up, or the SDK failed. Never throws.
 */
export function reportUnexpected(error: unknown, context: ReportContext = {}): string | null {
  const on = enabledNow();
  if (on === null) return null;
  try {
    return on.sdk.captureException(error, { level: context.level ?? "error", tags: context.tags ?? {} });
  } catch {
    return null;
  }
}

/**
 * The rule for an engine error (fact 3). Below 500 it is a refusal: nothing. At 500 or
 * more with a `reportId` the engine reported it: a breadcrumb naming that report. At
 * 500 or more without one the engine could not: an event. Answers the event id, if one
 * was made. Anything that is not an `EngineError` is an unexpected error.
 */
export function reportEngineError(error: unknown): string | null {
  if (!(error instanceof EngineError)) return reportUnexpected(error);
  if (error.status < 500) return null;
  if (error.reportId !== null) {
    // The raw id, under `report_id`: REPORT-02's scrubber keeps a 32-hex value under that key.
    breadcrumb("engine.report", "the engine reported this error", {
      report_id: error.reportId,
      status: error.status,
      code: error.code,
    });
    return null;
  }
  return reportUnexpected(error, {
    tags: { "engine.status": String(error.status), "engine.code": error.code },
  });
}

export interface ProcessGoneDetails {
  reason: string;
  exitCode?: number;
}

/**
 * A renderer or helper process that is gone: an event, except for a clean exit (nothing), a
 * `killed` one (a breadcrumb) and any after quit began (nothing).
 */
export function reportProcessGone(kind: string, details: ProcessGoneDetails): string | null {
  if (details.reason === "clean-exit" || quitting) return null;
  if (details.reason === "killed") {
    // Something ended it (the user, the OS, a supervisor restarting it): a step, not a failure.
    breadcrumb("process", `${kind} process killed`, { exit_code: details.exitCode ?? null });
    return null;
  }
  const on = enabledNow();
  if (on === null) return null;
  try {
    return on.sdk.captureMessage(`${kind} process gone: ${details.reason}`, {
      level: "error",
      tags: {
        "process.type": kind,
        "process.reason": details.reason,
        "process.exit_code": String(details.exitCode ?? ""),
      },
    });
  } catch {
    return null;
  }
}

/**
 * One event for a process incident (REPORT-05): the engine or the player exited without being
 * asked to, was restarted, or was given up on. Answers the event id, or null when reporting is
 * off, is not set up, or the SDK failed. Never throws.
 *
 * The tail of the process's output goes as an attachment, scrubbed line by line here, before
 * the SDK sees it. Attachments live in the SDK's `EventHint`, which `captureMessage` does not
 * take (its second argument is a scope context), so the event goes through `captureEvent`.
 * `beforeSend` still runs on the event (the choice, then `scrubEvent`). It is handed the hint too
 * but only ever looks at the event, so the attachment text is scrubbed here, before the SDK has it.
 */
export function reportProcessIncident(incident: ProcessIncident): string | null {
  const on = enabledNow();
  if (on === null) return null;
  try {
    const { attachment } = incident;
    const text = attachment === null ? null : scrubAttachment(attachment.filename, attachment.text, on.ctx);
    return on.sdk.captureEvent(
      {
        message: incident.message,
        level: "error",
        tags: {
          "process.type": incident.process,
          "process.outcome": incident.outcome,
          "process.exit_code": String(incident.data.exit_code ?? ""),
        },
        extra: { ...incident.data },
      },
      {
        attachments:
          attachment !== null && text !== null
            ? [{ filename: attachment.filename, data: text, contentType: "text/plain" }]
            : [],
      },
    );
  } catch {
    return null;
  }
}

/** What a supervisor is given to report with (`processWatch.ts`); `main.ts` passes it to both. */
export const processReporter: ProcessReporter = {
  breadcrumb,
  incident: (incident) => {
    reportProcessIncident(incident);
  },
  addToken: addReportingToken,
};

/** Report an error once for each `key` in a launch. A report that was not made does not use the key. */
export function reportOnce(key: string, error: unknown, context?: ReportContext): string | null {
  if (enabledNow() === null || reportedOnce.has(key)) return null;
  const id = reportUnexpected(error, context);
  if (id !== null) reportedOnce.add(key);
  return id;
}

/** A step before an error. Nothing is kept when reporting is off. Never throws. */
export function breadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
  const on = enabledNow();
  if (on === null) return;
  try {
    on.sdk.addBreadcrumb({ category, message, level: "info", ...(data ? { data } : {}) });
  } catch {
    // A breadcrumb is not worth a failure.
  }
}

type Outcome = "ok" | "refused" | "failed" | "unavailable";

/**
 * The engine or the player is not there: stopped, starting, restarting or gone. Polled calls
 * fail this way every couple of seconds for as long as it lasts, so it is a breadcrumb, never an
 * event; an outage is REPORT-05's to report once, from the supervisor that knows about it.
 */
export function isUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "PlayerUnavailableError") return true;
  if (error.message.startsWith("Engine not running")) return true;
  if (error instanceof TypeError && error.message === "fetch failed") return true;
  const code = (error.cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && /^(ECONNREFUSED|ECONNRESET|EPIPE|UND_ERR_)/.test(code);
}

/**
 * An unexpected IPC error is reported once per launch for each channel, name and message.
 * Answers the event id it was reported under, also for a repeat, so the page can name it.
 */
function reportIpcOnce(channel: string, error: unknown): string | null {
  const key = `${channel}|${error instanceof Error ? `${error.name}|${error.message}` : String(error)}`;
  if (reportedIpc.has(key)) return reportedIpc.get(key) ?? null;
  if (reportedIpc.size >= MAX_REPORTED_IPC) reportedIpc.clear();
  const id = reportUnexpected(error, { tags: { "ipc.channel": channel } });
  reportedIpc.set(key, id);
  return id;
}

function ipcBreadcrumb(channel: string, outcome: Outcome): void {
  if (outcome === "ok") {
    if (QUIET_CHANNELS.has(channel) || lastQuietIpc === channel) return;
    lastQuietIpc = channel;
  } else {
    lastQuietIpc = null;
  }
  breadcrumb("ipc", channel, { outcome });
}

/**
 * Every `ipcMain.handle` handler goes through this, in one place (`main.ts`'s `handle`).
 * It records the channel and the outcome, never the arguments. A handler that throws
 * reports (`reportEngineError` for an `EngineError`, otherwise `reportUnexpected`) and
 * rethrows in the form that survives the bridge. A handler that returns a refusal as a
 * value is not a failure.
 */
export function wrapIpcHandler<E, A extends unknown[], R>(
  channel: string,
  handler: (event: E, ...args: A) => R | Promise<R>,
): (event: E, ...args: A) => Promise<R> {
  return async (event, ...args) => {
    try {
      const result = await handler(event, ...args);
      ipcBreadcrumb(channel, "ok");
      return result;
    } catch (error) {
      // What the page is told about the error: main's event id when main reported it (so the
      // page does not report it again and can name it), or that the engine or player is gone.
      let reportId: string | null = null;
      let code: string | undefined;
      try {
        // The call's own breadcrumb first, so the trail on its event ends with it.
        if (error instanceof EngineError) {
          ipcBreadcrumb(channel, error.status < 500 ? "refused" : "failed");
          reportId = reportEngineError(error);
        } else if (isUnavailable(error)) {
          ipcBreadcrumb(channel, "unavailable");
          code = "UNAVAILABLE";
        } else {
          ipcBreadcrumb(channel, "failed");
          reportId = reportIpcOnce(channel, error);
        }
      } catch {
        // Reporting must not change what the caller sees.
      }
      throw bridgeSafeError(error, { reportId, code });
    }
  };
}

/**
 * The renderer's error reporter, as a value (REPORT-06, DEC-126, DEC-127, DEC-128).
 *
 * `ReportingFacade` is the part of the Sentry SDK the page uses, so a test can hand
 * the reporting module a fake. `electronRendererFacade` is the real one: the
 * `@sentry/electron` renderer SDK, which sends through the page's
 * `window.__SENTRY_IPC__` (the narrow bridge in `preload.cjs`) to Electron main.
 *
 * What the renderer SDK sends bypasses main's `beforeSend` unless it is an error
 * event: feedback, sessions, client reports, logs, metrics, replay, spans, profile
 * chunks and scope updates do not pass the choice or the scrubber. So none of those
 * is switched on here (`rendererSdkOptions`), and the preload refuses what is left.
 */
import * as Sentry from "@sentry/electron/renderer";

/** What the page asks of the SDK. */
export interface ReportingFacade {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, hint?: Record<string, unknown>): string;
  /**
   * Sent through main as Sentry user feedback. Resolves once Sentry has answered: `sent` is
   * true only for a 2xx. Never rejects.
   */
  captureFeedback(feedback: FeedbackPayload): Promise<{ id: string; sent: boolean }>;
  addBreadcrumb(crumb: Record<string, unknown>): void;
}

export interface FeedbackPayload {
  /** The user's note, as written. */
  message: string;
  /** The error report this feedback is about, when there is one. */
  associatedEventId?: string;
  /** The app's own fields: the version and the last report id. */
  tags: Record<string, string>;
}

/** How long a note waits for Sentry's answer before it counts as not sent. */
const FEEDBACK_WAIT_MS = 15_000;

/** The most steps kept before an error. */
export const RENDERER_BREADCRUMB_LIMIT = 50;

/**
 * The integrations that stay on: the page's uncaught errors and unhandled rejections,
 * and the tidying that keeps an event readable. Named here so a test holds the list.
 * Everything else the SDK adds by default is off, and so is Electron's scope-to-main
 * integration, which would push user, tags and breadcrumbs to main unscrubbed.
 *
 * Not here, and so off: `breadcrumbsIntegration` (console, click and input text, fetch,
 * XHR, history), `httpContextIntegration` (the page's URL, hash and headers), browser
 * sessions, replay, feedback widget, tracing, logs and metrics.
 */
export function rendererIntegrations(): unknown[] {
  return [
    Sentry.inboundFiltersIntegration(),
    Sentry.functionToStringIntegration(),
    Sentry.browserApiErrorsIntegration(),
    Sentry.globalHandlersIntegration({ onerror: true, onunhandledrejection: true }),
    Sentry.linkedErrorsIntegration(),
    Sentry.dedupeIntegration(),
  ];
}

export interface RendererSdkOptions {
  /** Read each time a step is added; off keeps nothing. */
  breadcrumbAllowed: () => boolean;
  /** Judges each event before it goes to main: the same rules `reportUnexpected` applies. */
  beforeSend: (event: Record<string, unknown>, hint?: { originalException?: unknown }) => Record<string, unknown> | null;
}

/**
 * The options the SDK is started with. No DSN: reports go through main, which has it.
 * No `setUser`, no tags, no `initialScope`: nothing personal is attached, and the
 * Electron renderer SDK ignores `initialScope` anyway.
 */
export function rendererSdkOptions(
  { breadcrumbAllowed, beforeSend }: RendererSdkOptions,
  integrations: unknown[] = rendererIntegrations(),
): Record<string, unknown> {
  return {
    // A list and `false`, so the SDK's own defaults are replaced, not added to.
    defaultIntegrations: false,
    integrations,
    sendDefaultPii: false,
    sendClientReports: false,
    enableLogs: false,
    tracesSampleRate: undefined,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    autoSessionTracking: false,
    maxBreadcrumbs: RENDERER_BREADCRUMB_LIMIT,
    beforeSend,
    beforeBreadcrumb: (crumb: Record<string, unknown>) => (breadcrumbAllowed() ? crumb : null),
  };
}

/** The real SDK. Used only inside Electron; the page has no other way to reach main. */
export function electronRendererFacade(): ReportingFacade {
  return {
    init: (options) => Sentry.init(options as Parameters<typeof Sentry.init>[0]),
    captureException: (error, hint) => Sentry.captureException(error, hint),
    captureFeedback: ({ message, associatedEventId, tags }) =>
      new Promise((resolve) => {
        const client = Sentry.getClient();
        if (!client) return resolve({ id: "", sent: false });
        let id = "";
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Not `Sentry.sendFeedback`, which adds the page's URL: `captureFeedback` sends what we give it.
        const off = client.on("afterSendEvent", (event, response) => {
          if (id === "" || event.event_id !== id) return;
          off();
          clearTimeout(timer);
          const code = (response as { statusCode?: number } | undefined)?.statusCode;
          resolve({ id, sent: typeof code === "number" && code >= 200 && code < 300 });
        });
        timer = setTimeout(() => {
          off();
          resolve({ id, sent: false });
        }, FEEDBACK_WAIT_MS);
        id = Sentry.captureFeedback({ message, tags, ...(associatedEventId ? { associatedEventId } : {}) });
        if (id === "") {
          off();
          clearTimeout(timer);
          resolve({ id, sent: false });
        }
      }),
    addBreadcrumb: (crumb) => Sentry.addBreadcrumb(crumb),
  };
}

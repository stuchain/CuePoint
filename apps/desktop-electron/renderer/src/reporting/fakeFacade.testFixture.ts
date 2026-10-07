import { vi } from "vitest";
import type { FeedbackPayload, ReportingFacade } from "./sdk";

/** A reporter that records what it was asked to send; for tests. */
export function fakeFacade(): ReportingFacade & {
  exceptions: Array<{ error: unknown; hint?: Record<string, unknown> }>;
  breadcrumbs: Array<Record<string, unknown>>;
  feedback: FeedbackPayload[];
  initOptions: Array<Record<string, unknown>>;
  uncaught(error: unknown): string | null;
} {
  let next = 0;
  const exceptions: Array<{ error: unknown; hint?: Record<string, unknown> }> = [];
  const breadcrumbs: Array<Record<string, unknown>> = [];
  const feedback: FeedbackPayload[] = [];
  const initOptions: Array<Record<string, unknown>> = [];
  const id = () => `${(++next).toString(16).padStart(32, "a")}`;
  return {
    exceptions,
    breadcrumbs,
    feedback,
    initOptions,
    init: vi.fn((options) => void initOptions.push(options)),
    // As the real SDK does: the event goes through `beforeSend` with the error as its original exception.
    captureException: vi.fn((error, hint) => {
      const eventId = id();
      const beforeSend = initOptions.at(-1)?.beforeSend as
        | ((event: Record<string, unknown>, hint: { originalException: unknown }) => unknown)
        | undefined;
      const kept = beforeSend ? beforeSend({ event_id: eventId }, { originalException: error }) : {};
      if (kept !== null) exceptions.push({ error, hint });
      return eventId;
    }),
    /** What a global handler does: an uncaught error becomes an event, which goes through `beforeSend`. */
    uncaught(error: unknown) {
      const eventId = id();
      const beforeSend = initOptions.at(-1)?.beforeSend as (e: Record<string, unknown>, h: { originalException: unknown }) => unknown;
      const kept = beforeSend({ event_id: eventId }, { originalException: error });
      if (kept !== null) exceptions.push({ error });
      return kept === null ? null : eventId;
    },
    captureFeedback: vi.fn(async (payload) => {
      feedback.push(payload);
      return { id: id(), sent: true };
    }),
    addBreadcrumb: vi.fn((crumb) => void breadcrumbs.push(crumb)),
  };
}

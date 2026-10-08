import { afterEach, describe, expect, it, vi } from "vitest";

import type { CuePointBridge } from "../api/cuepointBridge.types";
import { fakeFacade } from "./fakeFacade.testFixture";
import {
  lastReportId,
  reportBreadcrumb,
  reportNavigation,
  reportToast,
  reportUnexpected,
  reportingActive,
  resetRendererReporting,
  sendProblemReport,
  setReportingChoice,
  setupRendererReporting,
} from "./reporting";
import { RENDERER_BREADCRUMB_LIMIT, rendererSdkOptions } from "./sdk";

type Bridge = Pick<CuePointBridge, "errorReporting" | "engineErrorFields">;

function bridge(enabled: boolean, configured: boolean | undefined, fields?: Record<string, unknown>): Bridge {
  return {
    errorReporting: {
      get: async () => ({ enabled, ...(configured === undefined ? {} : { configured }) }),
      set: async (value) => ({ enabled: value }),
    },
    engineErrorFields: (message) => (fields && message in fields ? (fields[message] as never) : null),
  };
}

async function started(options: { enabled?: boolean; configured?: boolean | undefined; fields?: Record<string, unknown> } = {}) {
  const sdk = fakeFacade();
  const on = await setupRendererReporting({
    sdk,
    bridge: bridge(options.enabled ?? true, "configured" in options ? options.configured : true, options.fields),
  });
  return { sdk, on };
}

afterEach(() => resetRendererReporting());

describe("setupRendererReporting", () => {
  it("starts the reporter when main has set reporting up", async () => {
    const { sdk, on } = await started();
    expect(on).toBe(true);
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("does nothing when main has not set reporting up, or has no answer", async () => {
    for (const configured of [false, undefined]) {
      const { sdk, on } = await started({ configured });
      expect(on).toBe(false);
      expect(sdk.init).not.toHaveBeenCalled();
      expect(reportUnexpected(new Error("x"))).toBeNull();
    }
    expect(await setupRendererReporting({ sdk: fakeFacade(), bridge: {} })).toBe(false);
  });

  it("does nothing, and does not throw, when the bridge fails", async () => {
    const failing: Bridge = {
      errorReporting: { get: () => Promise.reject(new Error("no")), set: async () => ({ enabled: true }) },
    };
    expect(await setupRendererReporting({ sdk: fakeFacade(), bridge: failing })).toBe(false);
  });

  it("starts with the choice main answered", async () => {
    await started({ enabled: false });
    expect(reportingActive()).toBe(false);
    setReportingChoice(true);
    expect(reportingActive()).toBe(true);
  });
});

describe("rendererSdkOptions", () => {
  it("switches off everything that bypasses main's choice and scrubber", () => {
    const options = rendererSdkOptions({ breadcrumbAllowed: () => true, beforeSend: (e) => e }, []);
    expect(options).toMatchObject({
      defaultIntegrations: false,
      sendDefaultPii: false,
      sendClientReports: false,
      enableLogs: false,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      autoSessionTracking: false,
      maxBreadcrumbs: RENDERER_BREADCRUMB_LIMIT,
    });
    // No tracing, no DSN of its own, nothing personal attached.
    for (const key of ["tracesSampleRate", "tracesSampler", "dsn", "initialScope", "profilesSampleRate"]) {
      expect(options[key]).toBeUndefined();
    }
  });

  it("allows only the global handlers and tidying integrations, and no breadcrumb or context ones", async () => {
    const { rendererIntegrations } = await import("./sdk");
    const names = rendererIntegrations().map((i) => (i as { name: string }).name);
    expect(names).toEqual(
      expect.arrayContaining(["GlobalHandlers", "LinkedErrors", "InboundFilters"]),
    );
    for (const forbidden of ["Breadcrumbs", "HttpContext", "BrowserSession", "Replay", "Feedback", "ScopeToMain", "BrowserTracing"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("drops a step when the choice is off", () => {
    let on = true;
    const options = rendererSdkOptions({ breadcrumbAllowed: () => on, beforeSend: (e) => e }, []);
    const before = options.beforeBreadcrumb as (c: Record<string, unknown>) => unknown;
    expect(before({ message: "a" })).toEqual({ message: "a" });
    on = false;
    expect(before({ message: "a" })).toBeNull();
  });
});

describe("reportUnexpected", () => {
  it("records one event for an unexpected error", async () => {
    const { sdk } = await started();
    const id = reportUnexpected(new Error("boom"));
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(sdk.exceptions).toHaveLength(1);
    expect(lastReportId()).toBe(id);
  });

  it("sends nothing for an engine refusal", async () => {
    const { sdk } = await started({ fields: { "bpm must be between 20 and 300": { status: 400, code: "INVALID_REQUEST", reportId: null } } });
    expect(reportUnexpected(new Error("bpm must be between 20 and 300"))).toBeNull();
    expect(sdk.exceptions).toHaveLength(0);
  });

  it("sends nothing for an error the engine already reported, and remembers its id as the last", async () => {
    const reportId = "b".repeat(32);
    const { sdk } = await started({ fields: { "engine failed": { status: 500, code: "X", reportId } } });
    expect(reportUnexpected(new Error("engine failed"))).toBeNull();
    expect(sdk.exceptions).toHaveLength(0);
    expect(lastReportId()).toBe(reportId);
  });

  it("reads the fields an error carries itself", async () => {
    const { sdk } = await started();
    const error = Object.assign(new Error("nope"), { status: 404, code: "NOT_FOUND", reportId: null });
    expect(reportUnexpected(error)).toBeNull();
    const reported = Object.assign(new Error("again"), { status: 500, code: "X", reportId: "c".repeat(32) });
    expect(reportUnexpected(reported)).toBeNull();
    expect(sdk.exceptions).toHaveLength(0);
  });

  it("sends nothing for an engine outage", async () => {
    const { sdk } = await started();
    expect(reportUnexpected(new Error("Engine not running"))).toBeNull();
    expect(sdk.exceptions).toHaveLength(0);
  });

  it("sends nothing while reporting is off", async () => {
    const { sdk } = await started({ enabled: false });
    expect(reportUnexpected(new Error("boom"))).toBeNull();
    expect(sdk.exceptions).toHaveLength(0);
  });

  it("reports an error once, by object and by text, and answers the same id", async () => {
    const { sdk } = await started();
    // The same site makes the same error each time, as a failing poll does.
    const poll = () => new Error("poll failed");
    const error = poll();
    const first = reportUnexpected(error);
    expect(reportUnexpected(error)).toBe(first);
    expect(reportUnexpected(poll())).toBe(first);
    expect(sdk.exceptions).toHaveLength(1);
    expect(reportUnexpected(new Error("another"))).not.toBe(first);
    expect(sdk.exceptions).toHaveLength(2);
  });

  it("passes the component stack along as a context", async () => {
    const { sdk } = await started();
    reportUnexpected(new Error("render"), { componentStack: "\n    at Page" });
    expect(sdk.exceptions[0]!.hint).toMatchObject({
      level: "error",
      contexts: { react: { componentStack: "\n    at Page" } },
    });
  });

  it("never throws, even when the reporter does", async () => {
    const { sdk } = await started();
    vi.mocked(sdk.captureException).mockImplementation(() => {
      throw new Error("sdk broke");
    });
    expect(reportUnexpected(new Error("x"))).toBeNull();
  });
});

describe("steps before an error", () => {
  it("records a navigation step with the destination id and nothing after it", async () => {
    const { sdk } = await started();
    reportNavigation("clean");
    expect(sdk.breadcrumbs).toEqual([{ category: "navigation", message: "clean", level: "info" }]);
  });

  it("records a toast's kind, never its words", async () => {
    const { sdk } = await started();
    reportToast("warning");
    expect(sdk.breadcrumbs).toEqual([{ category: "toast", message: "warning", level: "info" }]);
  });

  it("keeps nothing while reporting is off or not set up", async () => {
    reportBreadcrumb("navigation", "library");
    const { sdk } = await started({ enabled: false });
    reportBreadcrumb("navigation", "library");
    expect(sdk.breadcrumbs).toHaveLength(0);
  });
});

describe("sendProblemReport", () => {
  it("sends one feedback item with the note as written, the version and the last report id", async () => {
    const { sdk } = await started();
    const last = reportUnexpected(new Error("boom"));
    const note = "  I was dropping a track on /Users/me/Music/Secret Song.mp3  ";
    expect(await sendProblemReport(note, "1.0.0-test.1")).not.toBeNull();
    expect(sdk.feedback).toEqual([
      {
        message: note,
        associatedEventId: last,
        tags: { "app.version": "1.0.0-test.1", "last.report": last },
      },
    ]);
  });

  it("sends with no last report when there is none", async () => {
    const { sdk } = await started();
    await sendProblemReport("hello", "1.0.0");
    expect(sdk.feedback[0]).toEqual({ message: "hello", tags: { "app.version": "1.0.0" } });
  });

  it("sends nothing while reporting is off", async () => {
    const { sdk } = await started({ enabled: false });
    expect(await sendProblemReport("hello", "1.0.0")).toBeNull();
    expect(sdk.feedback).toHaveLength(0);
  });

  it("rejects when Sentry did not take the note", async () => {
    const { sdk } = await started();
    vi.mocked(sdk.captureFeedback).mockResolvedValue({ id: "e".repeat(32), sent: false });
    await expect(sendProblemReport("hello", "1.0.0")).rejects.toThrow(/not sent/);
  });
});

describe("events from the global handlers", () => {
  it("are sent once, and the last report is the sent event", async () => {
    const { sdk } = await started();
    const rejection = () => new Error("unhandled rejection");
    const id = sdk.uncaught(rejection());
    expect(id).not.toBeNull();
    expect(lastReportId()).toBe(id);
    expect(sdk.uncaught(rejection())).toBeNull();
    expect(sdk.exceptions).toHaveLength(1);
  });

  it("follow the same rules: not a refusal, not an outage, not one already reported", async () => {
    const reportId = "f".repeat(32);
    const { sdk } = await started({
      fields: {
        "bpm too high": { status: 400, code: "INVALID_REQUEST", reportId: null },
        "main reported this": { status: null, code: null, reportId },
        "player gone": { status: null, code: "UNAVAILABLE", reportId: null },
      },
    });
    expect(sdk.uncaught(new Error("bpm too high"))).toBeNull();
    expect(sdk.uncaught(new Error("player gone"))).toBeNull();
    expect(sdk.uncaught(new Error("Engine not running"))).toBeNull();
    expect(sdk.uncaught(new Error("main reported this"))).toBeNull();
    expect(sdk.exceptions).toEqual([]);
    expect(lastReportId()).toBe(reportId);
  });

  it("send nothing while reporting is off", async () => {
    const { sdk } = await started({ enabled: false });
    expect(sdk.uncaught(new Error("x"))).toBeNull();
  });
});

describe("what counts as the same error", () => {
  it("two different bugs with the same message both report", async () => {
    const { sdk } = await started();
    const at = (frame: string) => Object.assign(new Error("Cannot read properties of undefined"), { stack: `Error: x\n    at ${frame}` });
    const first = reportUnexpected(at("render (index.js:1:100)"));
    const second = reportUnexpected(at("effect (index.js:9:900)"));
    expect(second).not.toBe(first);
    expect(sdk.exceptions).toHaveLength(2);
  });

  it("reports a rejection that is not an Error, and tells two different ones apart", async () => {
    const { sdk } = await started();
    expect(reportUnexpected({ reason: "a" })).not.toBeNull();
    expect(reportUnexpected({ reason: "b" })).not.toBeNull();
    expect(reportUnexpected("plain string")).not.toBeNull();
    expect(sdk.exceptions).toHaveLength(3);
  });
});

describe("an engine or player outage marked by main", () => {
  it("is not reported", async () => {
    const { sdk } = await started({ fields: { "The audio player is not running.": { status: null, code: "UNAVAILABLE", reportId: null } } });
    expect(reportUnexpected(new Error("The audio player is not running."))).toBeNull();
    expect(sdk.exceptions).toEqual([]);
  });
});

describe("an error main already reported", () => {
  it("is not reported again, and its id is the last report", async () => {
    const reportId = "a1".repeat(16);
    const { sdk } = await started({ fields: { "handler broke": { status: null, code: null, reportId } } });
    expect(reportUnexpected(new Error("handler broke"))).toBeNull();
    expect(sdk.exceptions).toEqual([]);
    expect(lastReportId()).toBe(reportId);
  });
});

import * as Node from "@sentry/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EngineError } from "./engineClient";
import { BRIDGE_ERROR_MARKER } from "./bridgeError";
import {
  MAIN_INTEGRATIONS,
  addReportingToken,
  breadcrumb,
  mainReportingDsn,
  reportEngineError,
  reportOnce,
  reportProcessGone,
  reportUnexpected,
  setupMainReporting,
  teardownMainReporting,
  markQuitting,
  isUnavailable,
  wrapIpcHandler,
  type ReportingSdk,
} from "./reporting";
import type { ScrubContext } from "./reportScrub";

/**
 * Main reports its own failures, and nothing else (REPORT-04, DEC-126, DEC-127, DEC-149).
 *
 * `@sentry/electron/main` cannot be imported under Node (it reads
 * `process.versions.electron` on load), so `setupMainReporting` takes the SDK as a
 * value. Here that value is a facade over the real Node client of the same Sentry
 * release the Electron SDK is built on: real scopes, real breadcrumbs, real
 * `beforeSend`/`beforeBreadcrumb` hooks, and a fake transport that keeps what would
 * have been sent. The Electron-only parts (which integrations are on, the transport,
 * the real uncaught-exception hook) are checked by what `setupMainReporting` hands to
 * `init`, and in a real app by `e2e/reportErrors.spec.ts`.
 */

const DSN = "https://publickey@o0.ingest.example.invalid/1";

interface Sent {
  event: Record<string, unknown>;
  envelope: unknown;
}

let sent: Sent[];
let initOptions: Record<string, unknown>;
let enabled: boolean;
let initCalls: number;
/** Breadcrumbs as handed to the SDK, before any hook (so what the scrubber later does is not tested here). */
let handed: Array<Record<string, unknown>>;

const ctx: ScrubContext = {
  home: "/home/anna",
  userName: "anna",
  appRoots: [],
  tokens: [],
};

/** Integrations as the Electron SDK would hand them over, by name. */
const SDK_DEFAULTS = [
  "SentryMinidump",
  "ElectronBreadcrumbs",
  "ElectronNet",
  "ElectronContext",
  "ChildProcess",
  "OnUncaughtException",
  "PreloadInjection",
  "AdditionalContext",
  "Screenshots",
  "GpuContext",
  "RendererEventLoopBlock",
  "MainProcessSession",
  "EventFilters",
  "FunctionToString",
  "LinkedErrors",
  "Console",
  "NodeFetch",
  "OnUnhandledRejection",
  "ContextLines",
  "LocalVariablesAsync",
  "Context",
  "NormalizePaths",
];

const PLAIN_TRANSPORT = Symbol("plain transport");

function facade(): ReportingSdk {
  return {
    init(options) {
      initCalls++;
      initOptions = options;
      Node.setNodeAsyncContextStrategy();
      const client = new Node.NodeClient({
        ...options,
        integrations: [],
        stackParser: Node.defaultStackParser,
        transport: () => ({
          send: async (envelope: unknown) => {
            const item = (envelope as unknown[][][])[1]![0]!;
            if ((item[0] as { type?: string }).type === "event") {
              sent.push({ event: item[1] as Record<string, unknown>, envelope });
            }
            return {};
          },
          flush: async () => true,
        }),
      } as ConstructorParameters<typeof Node.NodeClient>[0]);
      Node.getCurrentScope().setClient(client);
      client.init();
    },
    captureException: (error, hint) => Node.captureException(error, hint),
    captureMessage: (message, hint) => Node.captureMessage(message, hint as never),
    addBreadcrumb: (crumb) => {
      handed.push(crumb);
      Node.addBreadcrumb(crumb);
    },
    getTraceData: () => ({ ...Node.getTraceData() }),
    getDefaultIntegrations: () => SDK_DEFAULTS.map((name) => ({ name })),
    makeElectronTransport: PLAIN_TRANSPORT,
  };
}

async function flush(): Promise<void> {
  await Node.getClient()?.flush(1000);
}

function setup(extra: Partial<Parameters<typeof setupMainReporting>[0]> = {}): boolean {
  return setupMainReporting({
    dsn: DSN,
    choice: () => enabled,
    scrubContext: ctx,
    sdk: facade(),
    env: {},
    ...extra,
  });
}

function crumbs(): Array<Record<string, unknown>> {
  const scope = Node.getIsolationScope() as unknown as { getScopeData(): { breadcrumbs: Array<Record<string, unknown>> } };
  return scope.getScopeData().breadcrumbs;
}

beforeEach(() => {
  sent = [];
  enabled = true;
  initCalls = 0;
  handed = [];
  initOptions = {};
  ctx.tokens = [];
});

afterEach(async () => {
  teardownMainReporting();
  await Node.getClient()?.close(0);
  Node.getCurrentScope().clear();
  Node.getIsolationScope().clear();
  Node.getCurrentScope().setClient(undefined);
});

describe("the DSN", () => {
  it("comes from CUEPOINT_SENTRY_DSN only, and unset, empty or off is none", () => {
    expect(mainReportingDsn({})).toBeUndefined();
    expect(mainReportingDsn({ CUEPOINT_SENTRY_DSN: "" })).toBeUndefined();
    expect(mainReportingDsn({ CUEPOINT_SENTRY_DSN: "   " })).toBeUndefined();
    expect(mainReportingDsn({ CUEPOINT_SENTRY_DSN: "off" })).toBeUndefined();
    expect(mainReportingDsn({ CUEPOINT_SENTRY_DSN: "OFF" })).toBeUndefined();
    expect(mainReportingDsn({ CUEPOINT_SENTRY_DSN: ` ${DSN} ` })).toBe(DSN);
  });

  it("with none, nothing is set up and every helper does nothing", async () => {
    expect(setup({ dsn: undefined })).toBe(false);
    expect(setup({ dsn: "" })).toBe(false);
    expect(setup({ dsn: "off" })).toBe(false);
    expect(initCalls).toBe(0);

    expect(reportUnexpected(new Error("x"))).toBeNull();
    expect(reportEngineError(new EngineError("m", { status: 500 }))).toBeNull();
    expect(reportProcessGone("renderer", { reason: "crashed", exitCode: 1 })).toBeNull();
    expect(reportOnce("k", new Error("x"))).toBeNull();
    breadcrumb("app", "ready");
    await flush();
    expect(sent).toEqual([]);
  });
});

describe("what init is given (fact 7)", () => {
  it("sets up and answers true", () => {
    expect(setup()).toBe(true);
    expect(initCalls).toBe(1);
    expect(initOptions.dsn).toBe(DSN);
  });

  it("opens no renderer protocol: IPC mode Classic only", () => {
    setup();
    expect(initOptions.ipcMode).toBe(1);
  });

  it("sends no PII, no server name, no tracing, no replay, no screenshots, no client reports", () => {
    setup();

    expect(initOptions.sendDefaultPii).toBe(false);
    expect(initOptions.serverName ?? "").toBe("");
    expect(initOptions.includeServerName).not.toBe(true);
    for (const key of ["tracesSampleRate", "tracesSampler", "profilesSampleRate", "enableTracing"]) {
      expect(initOptions[key], key).toBeUndefined();
    }
    for (const key of ["replaysSessionSampleRate", "replaysOnErrorSampleRate", "attachScreenshot"]) {
      expect(initOptions[key] ?? 0, key).toBeFalsy();
    }
    expect(initOptions.sendClientReports).toBe(false);
    expect(initOptions.maxBreadcrumbs).toBe(50);
  });

  it("uses the plain transport, never the offline queue (DEC-128)", () => {
    setup();
    expect(initOptions.transport).toBe(PLAIN_TRANSPORT);

    const fake = () => ({ send: async () => ({}), flush: async () => true });
    setup({ transport: fake as never });
    expect(initOptions.transport).toBe(fake);
  });

  it("takes release, dist and environment from the environment (REPORT-07 fills them)", () => {
    setup({ env: { CUEPOINT_RELEASE: "1.2.3", CUEPOINT_DIST: "abc1234", CUEPOINT_ENVIRONMENT: "staging" } });
    expect(initOptions).toMatchObject({ release: "1.2.3", dist: "abc1234", environment: "staging" });

    setup({ env: {} });
    expect(initOptions.release).toBeUndefined();
    expect(initOptions.dist).toBeUndefined();
    expect(initOptions.environment).toBeUndefined();
  });

  it("keeps uncaught exceptions and unhandled rejections on, and nothing native, screenshot, replay or console", () => {
    setup();
    const names = (initOptions.defaultIntegrations as Array<{ name: string }>).map((i) => i.name);

    expect(names).toContain("OnUncaughtException");
    expect(names).toContain("OnUnhandledRejection");
    for (const forbidden of [
      "SentryMinidump",
      "ElectronMinidump",
      "Screenshots",
      "Console",
      "LocalVariablesAsync",
      "LocalVariables",
      "MainProcessSession",
      "BrowserWindowSession",
      "ElectronNet",
      "NodeFetch",
      "ChildProcess",
      "PreloadInjection",
      "RendererEventLoopBlock",
      "RendererProfiling",
      "StartupTracing",
    ]) {
      expect(names, forbidden).not.toContain(forbidden);
    }
    expect([...names].sort()).toEqual(names.filter((n) => MAIN_INTEGRATIONS.includes(n)).sort());
  });

  it("builds the list from an allowlist, so an integration the SDK adds later is off until chosen", () => {
    const sdk = facade();
    sdk.getDefaultIntegrations = () => [{ name: "OnUncaughtException" }, { name: "SomethingNew" }];

    setup({ sdk });

    expect((initOptions.defaultIntegrations as Array<{ name: string }>).map((i) => i.name)).toEqual([
      "OnUncaughtException",
    ]);
  });
});

describe("reporting never stops the app", () => {
  it("answers false and clears everything when init throws", async () => {
    const sdk = facade();
    sdk.init = () => {
      throw new Error("refused");
    };

    expect(setup({ sdk })).toBe(false);

    expect(reportUnexpected(new Error("x"))).toBeNull();
    breadcrumb("app", "ready");
    expect(handed).toEqual([]);
  });

  it("answers false when the SDK cannot be loaded or listed", () => {
    const sdk = facade();
    sdk.getDefaultIntegrations = () => {
      throw new Error("no module");
    };
    expect(setup({ sdk })).toBe(false);
    expect(reportUnexpected(new Error("x"))).toBeNull();
  });

  it("leaves no trace headers behind when it fails", async () => {
    const { EngineClient } = await import("./engineClient");
    const sdk = facade();
    sdk.init = () => {
      throw new Error("refused");
    };
    setup({ sdk });
    const seen: Array<Record<string, string>> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init?: RequestInit) => {
      seen.push(init!.headers as Record<string, string>);
      return new Response("{}", { status: 200 });
    }) as never;
    try {
      await new EngineClient(1, "t").clearCuepointCache();
    } finally {
      globalThis.fetch = original;
    }
    expect(seen[0]!["sentry-trace"]).toBeUndefined();
  });
});

describe("beforeSend", () => {
  it("records an event when the choice is on, scrubbed last", async () => {
    setup();
    ctx.tokens.push("sekret-engine-token");

    reportUnexpected(new Error("failed at /home/anna/Music/set.xml with sekret-engine-token"));
    await flush();

    expect(sent).toHaveLength(1);
    const text = JSON.stringify(sent[0]!.event);
    expect(text).not.toContain("anna");
    expect(text).not.toContain("sekret-engine-token");
    expect(text).toContain("<home>");
    expect(text).toContain("<token>");
  });

  it("drops what the scrubber drops: server name, user, request", async () => {
    setup();
    Node.getIsolationScope().setUser({ id: "7", email: "anna@example.com" });

    reportUnexpected(new Error("x"));
    await flush();

    const event = sent[0]!.event;
    expect(event.user).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(event.request).toBeUndefined();
  });

  it("records nothing when the choice is off, and reads it at the time", async () => {
    setup();
    enabled = false;
    Node.captureException(new Error("straight to the SDK"));
    reportUnexpected(new Error("through the helper"));
    await flush();
    expect(sent).toEqual([]);

    enabled = true;
    reportUnexpected(new Error("on again"));
    await flush();
    expect(sent).toHaveLength(1);
  });

  it("records one event for an uncaught exception as the SDK's hook reports it", async () => {
    setup();
    const error = new Error("boom in main");

    Node.captureException(error, {
      originalException: error,
      captureContext: { level: "fatal" },
      data: { mechanism: { handled: false, type: "generic" } },
    } as never);
    await flush();

    expect(sent).toHaveLength(1);
    expect(sent[0]!.event.level).toBe("fatal");
  });
});

describe("beforeBreadcrumb", () => {
  it("keeps a breadcrumb scrubbed, and drops console and ui ones", () => {
    setup();

    breadcrumb("app", "opened /home/anna/Music/a.flac");
    Node.addBreadcrumb({ category: "console", message: "a track title" });
    Node.addBreadcrumb({ category: "ui.click", message: "button.track" });
    Node.addBreadcrumb({ category: "ui.input", message: "typed" });

    const kept = crumbs();
    expect(kept.map((c) => c.category)).toEqual(["app"]);
    expect(String(kept[0]!.message)).not.toContain("anna");
  });

  it("keeps none when the choice is off", () => {
    setup();
    enabled = false;

    breadcrumb("app", "ready");
    Node.addBreadcrumb({ category: "app", message: "direct" });

    expect(crumbs()).toEqual([]);
  });

  it("keeps at most 50, the newest", () => {
    setup();
    for (let i = 0; i < 60; i++) breadcrumb("app", `step ${i}`);

    const kept = crumbs();
    expect(kept).toHaveLength(50);
    expect(kept.at(-1)!.message).toBe("step 59");
  });
});

describe("engine errors (fact 3)", () => {
  it("a refusal below 500 records nothing, whatever its code", async () => {
    setup();

    for (const status of [400, 404, 409, 422]) {
      expect(reportEngineError(new EngineError("no", { status, code: "INVALID_REQUEST" }))).toBeNull();
    }
    await flush();

    expect(sent).toEqual([]);
    expect(crumbs()).toEqual([]);
  });

  it("a 500 with a report id adds a breadcrumb naming it and records no event", async () => {
    setup();
    const id = "0123456789abcdef0123456789abcdef";

    const result = reportEngineError(new EngineError("The library failed.", { status: 500, code: "X", reportId: id }));
    await flush();

    expect(result).toBeNull();
    expect(sent).toEqual([]);
    // Handed over raw, under `report_id`; REPORT-02's scrubber keeps it under that key.
    expect(handed).toHaveLength(1);
    expect(handed[0]).toMatchObject({ category: "engine.report", data: { report_id: id, status: 500, code: "X" } });
  });

  it("a 500 without a report id records one event, with its status and code", async () => {
    setup();

    const id = reportEngineError(new EngineError("The library failed.", { status: 503, code: "ENGINE_REQUEST_FAILED" }));
    await flush();

    expect(typeof id).toBe("string");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.event.tags).toMatchObject({ "engine.status": "503", "engine.code": "ENGINE_REQUEST_FAILED" });
  });

  it("anything else handed to it is an unexpected error", async () => {
    setup();

    reportEngineError(new TypeError("not an engine error"));
    await flush();

    expect(sent).toHaveLength(1);
  });

  it("records nothing with the choice off", async () => {
    setup();
    enabled = false;

    reportEngineError(new EngineError("m", { status: 500 }));
    await flush();

    expect(sent).toEqual([]);
  });
});

describe("processes that are gone", () => {
  it("records a renderer or helper that crashed, with reason and exit code", async () => {
    setup();

    reportProcessGone("renderer", { reason: "crashed", exitCode: 139 });
    reportProcessGone("GPU", { reason: "launch-failed", exitCode: 1 });
    await flush();

    expect(sent).toHaveLength(2);
    expect(sent[0]!.event.tags).toMatchObject({
      "process.type": "renderer",
      "process.reason": "crashed",
      "process.exit_code": "139",
    });
  });

  it("makes a killed process a breadcrumb, not an event", async () => {
    setup();

    expect(reportProcessGone("Utility", { reason: "killed", exitCode: 0 })).toBeNull();
    await flush();

    expect(sent).toEqual([]);
    expect(handed).toHaveLength(1);
    expect(handed[0]).toMatchObject({ category: "process" });
  });

  it("records nothing once the app is quitting", async () => {
    setup();
    markQuitting();

    expect(reportProcessGone("renderer", { reason: "crashed", exitCode: 1 })).toBeNull();
    await flush();

    expect(sent).toEqual([]);
  });

  it("records nothing for a clean exit", async () => {
    setup();

    expect(reportProcessGone("renderer", { reason: "clean-exit", exitCode: 0 })).toBeNull();
    await flush();

    expect(sent).toEqual([]);
  });
});

describe("once per launch", () => {
  it("reports a key once", async () => {
    setup();

    expect(reportOnce("engine.start", new Error("a"))).not.toBeNull();
    expect(reportOnce("engine.start", new Error("b"))).toBeNull();
    expect(reportOnce("other", new Error("c"))).not.toBeNull();
    await flush();

    expect(sent).toHaveLength(2);
  });

  it("does not spend the key when the choice is off", async () => {
    setup();
    enabled = false;
    reportOnce("engine.start", new Error("a"));
    enabled = true;

    expect(reportOnce("engine.start", new Error("a"))).not.toBeNull();
  });
});

describe("the IPC wrapper", () => {
  const event = {} as never;

  it("passes the answer through, and leaves a breadcrumb with the channel and outcome only", async () => {
    setup();
    const handler = wrapIpcHandler("engine:searchLibrary", async (_e, params: { q: string }) => ({ found: params.q }));

    await expect(handler(event, { q: "secret track title" })).resolves.toEqual({ found: "secret track title" });

    const [crumb] = crumbs();
    expect(crumb).toMatchObject({ category: "ipc", message: "engine:searchLibrary" });
    expect(crumb!.data).toEqual({ outcome: "ok" });
    expect(JSON.stringify(crumb)).not.toContain("secret track title");
  });

  it("records one event for a handler that throws, and rethrows the same error", async () => {
    setup();
    const failure = new TypeError("handler broke");
    const handler = wrapIpcHandler("engine:restart", () => {
      throw failure;
    });

    await expect(handler(event)).rejects.toBe(failure);
    await flush();

    expect(sent).toHaveLength(1);
    expect(sent[0]!.event.tags).toMatchObject({ "ipc.channel": "engine:restart" });
    expect(crumbs().at(-1)!.data).toEqual({ outcome: "failed" });
  });

  it("records nothing for a handler that returns a refusal as a value", async () => {
    setup();
    const handler = wrapIpcHandler("engine:startRekordboxExport", async () => ({
      value: null,
      refusal: { code: "LIBRARY_BUSY" },
    }));

    await handler(event);
    await flush();

    expect(sent).toEqual([]);
  });

  it("records nothing for an EngineError refusal, and rethrows it bridge-safe", async () => {
    setup();
    const handler = wrapIpcHandler("engine:setTrackOverrides", async () => {
      throw new EngineError("bpm must be between 20 and 300", { status: 400, code: "INVALID_REQUEST" });
    });

    const thrown = (await handler(event).catch((e: unknown) => e)) as Error;
    await flush();

    expect(sent).toEqual([]);
    expect(thrown).not.toBeInstanceOf(EngineError);
    expect(thrown.message).toBe(
      `bpm must be between 20 and 300${BRIDGE_ERROR_MARKER}` +
        JSON.stringify({ status: 400, code: "INVALID_REQUEST", reportId: null }),
    );
    expect(crumbs().at(-1)!.data).toEqual({ outcome: "refused" });
  });

  it("a 500 with a report id is a breadcrumb, not an event, and its id crosses the bridge", async () => {
    setup();
    const handler = wrapIpcHandler("engine:getTags", async () => {
      throw new EngineError("The engine failed.", { status: 500, code: "X", reportId: "ab".repeat(16) });
    });

    const thrown = (await handler(event).catch((e: unknown) => e)) as Error;
    await flush();

    expect(sent).toEqual([]);
    expect(crumbs().map((c) => c.category)).toEqual(["ipc", "engine.report"]);
    expect(thrown.message).toContain(`"reportId":"${"ab".repeat(16)}"`);
  });

  it("a 500 without a report id is one event", async () => {
    setup();
    const handler = wrapIpcHandler("engine:getTags", async () => {
      throw new EngineError("The engine failed.", { status: 502, code: "ENGINE_REQUEST_FAILED" });
    });

    await handler(event).catch(() => undefined);
    await flush();

    expect(sent).toHaveLength(1);
  });

  it("rethrows a plain error as it is, and does not mark it", async () => {
    setup();
    const plain = new Error("The engine is not connected.");
    const handler = wrapIpcHandler("engine:status", () => {
      throw plain;
    });

    await expect(handler(event)).rejects.toBe(plain);
  });

  it("never fails the call because reporting is off or unset", async () => {
    const handler = wrapIpcHandler("engine:status", () => {
      throw new Error("x");
    });
    await expect(handler(event)).rejects.toThrow("x");

    setup();
    enabled = false;
    await expect(handler(event)).rejects.toThrow("x");
    await flush();
    expect(sent).toEqual([]);
  });

  it("does not fill the breadcrumbs with the same quiet call over and over", async () => {
    setup();
    const poll = wrapIpcHandler("engine:status", () => ({ connected: true }));
    const other = wrapIpcHandler("engine:browseLibrary", () => ({}));

    for (let i = 0; i < 10; i++) await poll(event);
    await other(event);

    expect(crumbs().map((c) => c.message)).toEqual(["engine:browseLibrary"]);
  });

  it("does not record the polled calls' successes at all", async () => {
    setup();
    for (const channel of ["engine:listJobs", "engine:getJob", "player:getState"]) {
      await wrapIpcHandler(channel, () => ({}))(event);
    }
    expect(crumbs()).toEqual([]);
  });

  it("treats an engine or player that is not there as unavailable: a breadcrumb, never an event", async () => {
    setup();
    const unavailable: Error[] = [
      new Error("Engine not running"),
      new TypeError("fetch failed"),
      Object.assign(new Error("connect"), { cause: { code: "ECONNREFUSED" } }),
      Object.assign(new Error("The audio player is not running."), { name: "PlayerUnavailableError" }),
    ];
    for (const error of unavailable) {
      const handler = wrapIpcHandler("engine:listJobs", () => {
        throw error;
      });
      for (let i = 0; i < 10; i++) await expect(handler(event)).rejects.toBe(error);
    }
    await flush();

    expect(sent).toEqual([]);
    expect(crumbs().map((c) => c.data)).toContainEqual({ outcome: "unavailable" });
    expect(unavailable.every(isUnavailable)).toBe(true);
    expect(isUnavailable(new TypeError("x is not a function"))).toBe(false);
  });

  it("reports the same unexpected error once per launch, and a different one separately", async () => {
    setup();
    const same = wrapIpcHandler("engine:getTags", () => {
      throw new TypeError("handler broke");
    });
    for (let i = 0; i < 10; i++) await same(event).catch(() => undefined);
    await flush();
    expect(sent).toHaveLength(1);

    await wrapIpcHandler("engine:getTags", () => {
      throw new TypeError("handler broke differently");
    })(event).catch(() => undefined);
    await wrapIpcHandler("engine:restart", () => {
      throw new TypeError("handler broke");
    })(event).catch(() => undefined);
    await flush();
    expect(sent).toHaveLength(3);
  });
});

describe("one story across the bridge (DEC-126)", () => {
  it("main's trace headers are the SDK's, and main's own events carry the same trace id", async () => {
    setup();
    const headers = Node.getTraceData();
    reportUnexpected(new Error("x"));
    await flush();

    const traceId = String(headers["sentry-trace"]).split("-")[0];
    expect((sent[0]!.event.contexts as { trace: { trace_id: string } }).trace.trace_id).toBe(traceId);
    expect(headers.baggage).toContain(`sentry-trace_id=${traceId}`);
  });

  it("setup gives engine requests the headers, and teardown takes them away", async () => {
    const { EngineClient } = await import("./engineClient");
    const seen: Array<Record<string, string>> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seen.push(init!.headers as Record<string, string>);
      return new Response("{}", { status: 200 });
    }) as never;
    try {
      setup();
      await new EngineClient(1, "t").clearCuepointCache();
      teardownMainReporting();
      await new EngineClient(1, "t").clearCuepointCache();
    } finally {
      globalThis.fetch = original;
    }

    expect(seen[0]!["sentry-trace"]).toMatch(/^[0-9a-f]{32}-[0-9a-f]{16}/);
    expect(seen[0]!.baggage).toContain("sentry-trace_id=");
    expect(seen[1]!["sentry-trace"]).toBeUndefined();
  });

  it("adds no headers when reporting is off, so nothing carries a trace for a person who said no", async () => {
    const { EngineClient } = await import("./engineClient");
    const seen: Array<Record<string, string>> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seen.push(init!.headers as Record<string, string>);
      return new Response("{}", { status: 200 });
    }) as never;
    try {
      setup();
      enabled = false;
      await new EngineClient(1, "t").clearCuepointCache();
    } finally {
      globalThis.fetch = original;
    }

    expect(seen[0]!["sentry-trace"]).toBeUndefined();
    expect(seen[0]!.baggage).toBeUndefined();
  });
});

describe("tokens learned after start", () => {
  it("are scrubbed once added", async () => {
    setup();
    addReportingToken("late-engine-token-123");

    reportUnexpected(new Error("calling with late-engine-token-123"));
    await flush();

    expect(JSON.stringify(sent[0]!.event)).not.toContain("late-engine-token-123");
  });
});

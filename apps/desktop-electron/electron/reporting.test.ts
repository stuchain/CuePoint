import * as Node from "@sentry/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EngineError } from "./engineClient";
import { BRIDGE_ERROR_MARKER } from "./bridgeError";
import {
  MAIN_INTEGRATIONS,
  addReportingToken,
  breadcrumb,
  BUILT_IN_MAIN_DSN,
  mainReportingDsn,
  reportEngineError,
  processReporter,
  reportOnce,
  reportProcessGone,
  reportProcessIncident,
  reportUnexpected,
  setupMainReporting,
  teardownMainReporting,
  markQuitting,
  isUnavailable,
  wrapIpcHandler,
  guardRendererChannels,
  type ReportingSdk,
} from "./reporting";
import type { ProcessIncident } from "./processWatch";
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
  /** The attachment items that travelled with the event, by filename (REPORT-05). */
  attachments: Array<{ filename: string; text: string }>;
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
            const items = (envelope as unknown[][][])[1]!;
            const item = items[0]!;
            if ((item[0] as { type?: string }).type === "event") {
              const attachments = items
                .filter((i) => (i[0] as { type?: string }).type === "attachment")
                .map((i) => ({
                  filename: (i[0] as { filename: string }).filename,
                  text: typeof i[1] === "string" ? i[1] : new TextDecoder().decode(i[1] as Uint8Array),
                }));
              sent.push({ event: item[1] as Record<string, unknown>, envelope, attachments });
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
    captureEvent: (event, hint) => Node.captureEvent(event as never, hint as never),
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

  it("resolves as a table: built in only for a packaged app (REPORT-08, DEC-148, DEC-150)", () => {
    const explicit = "https://k@example.invalid/9";
    const rows: Array<[string, NodeJS.ProcessEnv, boolean, string | undefined]> = [
      ["packaged, unset", {}, true, BUILT_IN_MAIN_DSN],
      ["packaged, empty", { CUEPOINT_SENTRY_DSN: "" }, true, BUILT_IN_MAIN_DSN],
      ["packaged, blank", { CUEPOINT_SENTRY_DSN: "  " }, true, BUILT_IN_MAIN_DSN],
      ["packaged, off", { CUEPOINT_SENTRY_DSN: "off" }, true, undefined],
      ["packaged, OFF", { CUEPOINT_SENTRY_DSN: "OFF" }, true, undefined],
      ["packaged, explicit", { CUEPOINT_SENTRY_DSN: explicit }, true, explicit],
      ["from source, unset", {}, false, undefined],
      ["from source, off", { CUEPOINT_SENTRY_DSN: "off" }, false, undefined],
      ["from source, explicit", { CUEPOINT_SENTRY_DSN: explicit }, false, explicit],
    ];
    for (const [name, env, packaged, expected] of rows) {
      expect(mainReportingDsn(env, packaged), name).toBe(expected);
    }
    // Where it is not told, it is a source run: nothing.
    expect(mainReportingDsn({})).toBeUndefined();
  });

  it("the built-in DSN is the Electron project's, in the EU region, and a bare DSN", () => {
    expect(BUILT_IN_MAIN_DSN).toMatch(/^https:\/\/[0-9a-f]{32}@o\d+\.ingest\.de\.sentry\.io\/4512215272915024$/);
    expect(BUILT_IN_MAIN_DSN).not.toContain("4510867733217360"); // the engine's project
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

  it("stamps the build's release, dist and environment on every event (REPORT-07)", () => {
    setup({ build: { release: "cuepoint@1.2.3", dist: "abc1234", environment: "production" } });
    expect(initOptions).toMatchObject({ release: "cuepoint@1.2.3", dist: "abc1234", environment: "production" });

    // A build that recorded no commit has no dist, rather than a made-up one.
    setup({ build: { release: "cuepoint@1.2.3", dist: null, environment: "development" } });
    expect(initOptions.dist).toBeUndefined();

    setup({});
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

  it("records one event for a handler that throws, and rethrows it carrying the event's id", async () => {
    setup();
    const failure = new TypeError("handler broke");
    const handler = wrapIpcHandler("engine:restart", () => {
      throw failure;
    });

    const thrown = (await handler(event).catch((e: unknown) => e)) as Error;
    await flush();

    expect(sent).toHaveLength(1);
    const reportId = sent[0]!.event.event_id as string;
    expect(thrown.message).toBe(
      `handler broke${BRIDGE_ERROR_MARKER}` + JSON.stringify({ status: null, code: null, reportId }),
    );
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

  it("a repeat of an error main already reported answers the same id, with no second event", async () => {
    setup();
    const handler = wrapIpcHandler("engine:restart", () => {
      throw new TypeError("handler broke");
    });

    const first = (await handler(event).catch((e: unknown) => e)) as Error;
    const second = (await handler(event).catch((e: unknown) => e)) as Error;
    await flush();

    expect(sent).toHaveLength(1);
    expect(second.message).toBe(first.message);
    expect(first.message).toContain(`"reportId":"${sent[0]!.event.event_id as string}"`);
  });

  it("a 500 without a report id that main reports crosses the bridge with main's id", async () => {
    setup();
    const handler = wrapIpcHandler("engine:getTags", async () => {
      throw new EngineError("The engine failed.", { status: 502, code: "ENGINE_REQUEST_FAILED" });
    });

    const thrown = (await handler(event).catch((e: unknown) => e)) as Error;
    await flush();

    expect(thrown.message).toContain(`"reportId":"${sent[0]!.event.event_id as string}"`);
  });

  it("marks an outage as UNAVAILABLE, so the page does not report it", async () => {
    setup();
    const handler = wrapIpcHandler("engine:status", () => {
      throw new Error("Engine not running");
    });

    const thrown = (await handler(event).catch((e: unknown) => e)) as Error;
    await flush();

    expect(sent).toEqual([]);
    expect(thrown.message).toBe(
      `Engine not running${BRIDGE_ERROR_MARKER}` + JSON.stringify({ status: null, code: "UNAVAILABLE", reportId: null }),
    );
  });

  it("rethrows an error main did not report as it is, and does not mark it", async () => {
    const plain = new Error("The engine is not connected.");
    const handler = wrapIpcHandler("engine:status", () => {
      throw plain;
    });

    // Reporting is not set up: nothing was reported, so there is nothing to say about it.
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
      for (let i = 0; i < 10; i++) {
        const thrown = (await handler(event).catch((e: unknown) => e)) as Error;
        expect(thrown.message).toBe(
          error.message + BRIDGE_ERROR_MARKER + JSON.stringify({ status: null, code: "UNAVAILABLE", reportId: null }),
        );
      }
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

describe("a process incident (REPORT-05)", () => {
  const incident = (overrides: Partial<ProcessIncident> = {}): ProcessIncident => ({
    process: "engine",
    outcome: "gave-up",
    message: "engine exited unexpectedly and was given up on",
    data: { exit_code: 3, signal: null, restarts: 3, uptime_ms: 1200, exits: 4, reason: "gave up" },
    attachment: {
      filename: "engine-output.txt",
      text: "== stderr (last 2 lines) ==\nopening /Users/anna/Music/x.flac\nauth failed with late-token-abc",
    },
    ...overrides,
  });

  it("is one event with its numbers, and the tail as a scrubbed attachment", async () => {
    setup();
    ctx.tokens.push("late-token-abc");

    const id = reportProcessIncident(incident());
    await flush();

    expect(typeof id).toBe("string");
    expect(sent).toHaveLength(1);
    const { event, attachments } = sent[0]!;
    expect(event.message).toBe("engine exited unexpectedly and was given up on");
    expect(event.level).toBe("error");
    expect(event.tags).toMatchObject({
      "process.type": "engine",
      "process.outcome": "gave-up",
      "process.exit_code": "3",
    });
    expect(event.extra).toMatchObject({ exit_code: 3, restarts: 3, uptime_ms: 1200, exits: 4 });

    // The attachment is shaped by REPORT-02's scrubber: no home path, no token, and it is named
    // as the scrubber allows.
    expect(attachments).toHaveLength(1);
    expect(attachments[0]!.filename).toBe("engine-output.txt");
    expect(attachments[0]!.text).not.toContain("/Users/anna");
    expect(attachments[0]!.text).not.toContain("anna");
    expect(attachments[0]!.text).not.toContain("late-token-abc");
    expect(attachments[0]!.text).toContain("== stderr (last 2 lines) ==");
  });

  it("is subject to the choice: off at the time of the event, nothing is made", async () => {
    setup();
    enabled = false;

    expect(reportProcessIncident(incident())).toBeNull();
    await flush();
    expect(sent).toEqual([]);
  });

  it("still passes through beforeSend, which applies the choice and scrubs the event", async () => {
    setup();
    const seen: unknown[] = [];
    const before = initOptions.beforeSend as (event: Record<string, unknown>) => Record<string, unknown> | null;
    // The SDK calls `beforeSend` with the event: turning the choice off after `captureEvent`
    // returned but before it is processed must still drop it.
    expect(typeof before).toBe("function");
    enabled = false;
    seen.push(before({ message: "x" }));
    expect(seen).toEqual([null]);
    enabled = true;

    reportProcessIncident(incident({ data: { exit_code: 1, signal: null, restarts: 0, uptime_ms: 5, exits: 1, reason: "/Users/anna/Music/x.flac" } }));
    await flush();
    expect(JSON.stringify(sent[0]!.event)).not.toContain("/Users/anna");
  });

  it("sends no attachment but the two output tails: any other name is dropped", async () => {
    setup();
    reportProcessIncident(incident({ attachment: { filename: "secrets.txt" as never, text: "hunter2" } }));
    await flush();
    expect(sent[0]!.attachments).toEqual([]);
  });

  it("sends none when the incident has none", async () => {
    setup();
    reportProcessIncident(incident({ attachment: null }));
    await flush();
    expect(sent[0]!.attachments).toEqual([]);
  });

  it("does nothing when reporting is not set up", async () => {
    expect(reportProcessIncident(incident())).toBeNull();
  });

  it("the reporter handed to the supervisors makes breadcrumbs, events and learns tokens", async () => {
    setup();
    processReporter.breadcrumb("process", "engine restarting", { attempt: 1 });
    processReporter.incident(incident());
    processReporter.addToken?.("learned-by-supervisor");
    reportUnexpected(new Error("learned-by-supervisor"));
    await flush();

    expect(sent).toHaveLength(2);
    expect(JSON.stringify(sent[1]!.event)).not.toContain("learned-by-supervisor");
    expect(handed.some((c) => c.message === "engine restarting")).toBe(true);
  });
});

describe("the page's channels (REPORT-06)", () => {
  it("wraps each of the SDK's listeners so a bad message from the page is dropped, not thrown", () => {
    const listeners = new Map<string, Array<(...args: never[]) => unknown>>();
    const ipc = {
      listeners: (channel: string) => [...(listeners.get(channel) ?? [])],
      removeAllListeners: (channel: string) => void listeners.delete(channel),
      on: (channel: string, listener: (...args: never[]) => unknown) =>
        void listeners.set(channel, [...(listeners.get(channel) ?? []), listener]),
    };
    const seen: unknown[] = [];
    listeners.set("sentry-ipc.envelope", [
      (...args: never[]) => {
        seen.push(args[0]);
        throw new SyntaxError("Unexpected token in JSON");
      },
    ]);
    listeners.set("sentry-ipc.start", [() => seen.push("start")]);

    guardRendererChannels(ipc);

    const [wrapped] = listeners.get("sentry-ipc.envelope")!;
    expect(() => wrapped!("not an envelope" as never)).not.toThrow();
    expect(seen).toEqual(["not an envelope"]);
    expect(listeners.get("sentry-ipc.start")).toHaveLength(1);
  });

  it("does nothing outside Electron", () => {
    expect(() => guardRendererChannels(undefined)).not.toThrow();
  });
});

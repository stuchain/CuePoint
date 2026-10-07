/**
 * The renderer's way to main for error reports (REPORT-06, DEC-126, DEC-127, DEC-128).
 *
 * The preload is run with a fake `electron`, as `preloadErrors.test.ts` does, and what it
 * exposes as `__SENTRY_IPC__` is called as the Sentry renderer SDK would call it: only an
 * error event goes through, feedback goes through only while the choice is on, and every
 * other kind of message is dropped.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "preload.cjs"), "utf-8");

interface SentryBridge {
  sendRendererStart(): void;
  sendEnvelope(envelope: string | Uint8Array): void;
  sendFeedback(envelope: string | Uint8Array): Promise<unknown>;
  sendScope(json: string): void;
  sendStatus(status: unknown): void;
  sendStructuredLog(log: unknown): void;
  sendMetric(metric: unknown): void;
}

function load(choice: boolean) {
  const exposed: Record<string, unknown> = {};
  const send = vi.fn();
  const invoke = vi.fn(async (channel: string) => {
    if (channel === "errorReporting:get") return { enabled: choice, configured: true };
    return { sent: channel };
  });
  const electron = {
    contextBridge: { exposeInMainWorld: (name: string, api: unknown) => (exposed[name] = api) },
    ipcRenderer: { invoke, send, on: vi.fn(), removeListener: vi.fn() },
    webUtils: { getPathForFile: () => "" },
  };
  new Function("require", source)((name: string) => {
    if (name !== "electron") throw new Error(`unexpected require ${name}`);
    return electron;
  });
  const sentry = (exposed.__SENTRY_IPC__ as Record<string, SentryBridge>)["sentry-ipc"]!;
  return { sentry, send, invoke };
}

const header = JSON.stringify({ event_id: "a".repeat(32) });
const envelope = (...items: Array<{ type: string; payload?: string; length?: number }>): string =>
  [
    header,
    ...items.flatMap(({ type, payload = "{}", length }) => [
      JSON.stringify({ type, ...(length !== undefined ? { length } : {}) }),
      payload,
    ]),
  ].join("\n");

describe("the Sentry bridge in the preload", () => {
  it("exposes exactly the SDK's methods, in its own namespace", () => {
    const { sentry } = load(true);
    expect(Object.keys(sentry).sort()).toEqual(
      ["sendEnvelope", "sendFeedback", "sendMetric", "sendRendererStart", "sendScope", "sendStatus", "sendStructuredLog"].sort(),
    );
  });

  it("starts the renderer and forwards an error event", () => {
    const { sentry, send } = load(true);
    sentry.sendRendererStart();
    sentry.sendEnvelope(envelope({ type: "event" }));
    expect(send.mock.calls.map((c) => c[0])).toEqual(["sentry-ipc.start", "sentry-ipc.envelope"]);
  });

  it("drops an envelope with a binary item, whatever its type, and one whose payload is not JSON", () => {
    const { sentry, send } = load(true);
    const body = "line one\nline two";
    sentry.sendEnvelope(new TextEncoder().encode(envelope({ type: "event", payload: body, length: body.length })));
    sentry.sendEnvelope(envelope({ type: "attachment", payload: body, length: body.length }));
    sentry.sendEnvelope(envelope({ type: "event", payload: "not json" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("reads a length of 0 as @sentry/core does: the payload is a line of JSON", () => {
    const { sentry, send } = load(true);
    sentry.sendEnvelope(envelope({ type: "event", payload: '{"a":1}', length: 0 }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("drops an envelope with a trailing item header and no payload, or a missing item type", () => {
    const { sentry, send } = load(true);
    sentry.sendEnvelope(`${header}\n${JSON.stringify({ type: "event" })}`);
    sentry.sendEnvelope(`${header}\n{}\n{}`);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["session", "sessions", "replay_event", "replay_recording", "span", "log", "trace_metric", "client_report", "profile_chunk", "transaction", "feedback"])(
    "does not forward a %s envelope",
    (type) => {
      const { sentry, send } = load(true);
      sentry.sendEnvelope(envelope({ type }));
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("does not forward an envelope that mixes an event with another kind, or one it cannot read", () => {
    const { sentry, send } = load(true);
    sentry.sendEnvelope(envelope({ type: "event" }, { type: "session" }));
    sentry.sendEnvelope("not an envelope");
    sentry.sendEnvelope("");
    expect(send).not.toHaveBeenCalled();
  });

  it("drops scope, status, log and metric updates", () => {
    const { sentry, send, invoke } = load(true);
    sentry.sendScope('{"user":{"id":"x"}}');
    sentry.sendStatus("ok");
    sentry.sendStructuredLog({ body: "x" });
    sentry.sendMetric({ name: "x" });
    expect(send).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("forwards feedback only while the choice is on", async () => {
    const on = load(true);
    await on.sentry.sendFeedback(envelope({ type: "feedback" }));
    expect(on.invoke.mock.calls.map((c) => c[0])).toEqual(["errorReporting:get", "sentry-ipc.feedback"]);

    const off = load(false);
    await expect(off.sentry.sendFeedback(envelope({ type: "feedback" }))).resolves.toEqual({});
    expect(off.invoke.mock.calls.map((c) => c[0])).toEqual(["errorReporting:get"]);
  });

  it("does not forward an event on the feedback channel", async () => {
    const { sentry, invoke } = load(true);
    await sentry.sendFeedback(envelope({ type: "event" }));
    expect(invoke).not.toHaveBeenCalled();
  });
});

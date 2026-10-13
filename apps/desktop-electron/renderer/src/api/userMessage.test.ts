import { describe, expect, it } from "vitest";
import { NEEDS_DESKTOP, OUTAGE_MESSAGE, OUTAGE_PARTWAY_MESSAGE, isOutage, userMessage } from "./userMessage";

function withFields(message: string, fields: Record<string, unknown>): Error {
  return Object.assign(new Error(message), fields);
}

describe("userMessage", () => {
  it("says one sentence when the background process is unreachable", () => {
    expect(userMessage(withFields("anything", { code: "UNAVAILABLE" }))).toBe(OUTAGE_MESSAGE);
    expect(userMessage(new Error("fetch failed"))).toBe(OUTAGE_MESSAGE);
    expect(userMessage(new Error("Engine not running (exit 1)"))).toBe(OUTAGE_MESSAGE);
  });

  it("recognises an outage the bridge knows by message", () => {
    const bridge = { engineErrorFields: () => ({ status: null, code: "UNAVAILABLE", reportId: null }) };
    expect(isOutage(new Error("odd text"))).toBe(false);
    expect(isOutage(new Error("odd text"), bridge)).toBe(true);
  });

  it("keeps the engine's own words for a refusal and for a 5xx", () => {
    expect(userMessage(withFields("No such track", { status: 404 }))).toBe("No such track");
    expect(userMessage(withFields("boom", { status: 500 }))).toBe("boom");
    expect(isOutage(withFields("boom", { status: 500 }))).toBe(false);
  });

  it("falls back for what is not an Error", () => {
    expect(userMessage("x")).toBe("x");
    expect(userMessage(undefined, "F")).toBe("F");
    expect(userMessage(undefined)).toBe("undefined");
  });

  it("has a fixed sentence for the missing desktop app", () => {
    expect(NEEDS_DESKTOP).toBe("This needs the CuePoint desktop app.");
  });

  it("says the work may be part done when the outage came after a job started", () => {
    expect(userMessage(new Error("fetch failed"), undefined, { partway: true })).toBe(OUTAGE_PARTWAY_MESSAGE);
    expect(userMessage(new Error("fetch failed"), undefined, { partway: false })).toBe(OUTAGE_MESSAGE);
    expect(OUTAGE_PARTWAY_MESSAGE).toBe(
      "CuePoint lost touch with its background process partway through. Activity shows what was done.",
    );
    expect(userMessage(withFields("No such track", { status: 404 }), undefined, { partway: true })).toBe("No such track");
  });

  it("keeps the missing-desktop sentence even when it is marked as an outage", () => {
    expect(userMessage(withFields(NEEDS_DESKTOP, { code: "UNAVAILABLE" }))).toBe(NEEDS_DESKTOP);
    expect(userMessage(withFields(NEEDS_DESKTOP, { code: "UNAVAILABLE" }), "F", { partway: true })).toBe(NEEDS_DESKTOP);
  });

  it("keeps an outage sentence already worded, whichever it is", () => {
    for (const words of [OUTAGE_MESSAGE, OUTAGE_PARTWAY_MESSAGE]) {
      expect(userMessage(withFields(words, { code: "UNAVAILABLE" }))).toBe(words);
    }
  });

  it("never throws, even for a value that cannot be turned into text", () => {
    const hostile = {
      toString() {
        throw new Error("no");
      },
    };
    expect(userMessage(hostile)).toBe("Something went wrong.");
    expect(userMessage(hostile, "F")).toBe("F");
  });
});

import { describe, expect, it, vi } from "vitest";

import { bridgeErrorFields, isEngineRefusal } from "./bridgeError";

/** An Error that reached the page: only its message is left (`contextBridge`, Electron 34). */
const bridged = (message: string) => new Error(message);

describe("bridgeErrorFields", () => {
  it("reads the fields the error has", () => {
    const error = Object.assign(new Error("m"), { status: 500, code: "X", reportId: "r1" });

    expect(bridgeErrorFields(error)).toEqual({ status: 500, code: "X", reportId: "r1" });
  });

  it("asks the bridge by message when the error lost them", () => {
    const engineErrorFields = vi.fn(() => ({ status: 400, code: "INVALID_REQUEST", reportId: null }));

    const fields = bridgeErrorFields(bridged("bpm must be between 20 and 300"), { engineErrorFields });

    expect(fields).toEqual({ status: 400, code: "INVALID_REQUEST", reportId: null });
    expect(engineErrorFields).toHaveBeenCalledWith("bpm must be between 20 and 300");
  });

  it("is all null for an error the bridge has no record of, or no bridge at all", () => {
    const none = { status: null, code: null, reportId: null };

    expect(bridgeErrorFields(bridged("x"), { engineErrorFields: () => null })).toEqual(none);
    expect(bridgeErrorFields(bridged("x"), {})).toEqual(none);
    expect(bridgeErrorFields(bridged("x"), undefined)).toEqual(none);
  });

  it("is all null for anything that is not an object, and never throws", () => {
    const none = { status: null, code: null, reportId: null };

    expect(bridgeErrorFields("text")).toEqual(none);
    expect(bridgeErrorFields(null)).toEqual(none);
    expect(
      bridgeErrorFields(bridged("x"), {
        engineErrorFields: () => {
          throw new Error("bridge gone");
        },
      }),
    ).toEqual(none);
  });
});

describe("isEngineRefusal", () => {
  const answering = (status: number | null) => ({
    engineErrorFields: () => ({ status, code: null, reportId: null }),
  });

  it("is true below 500 and false at 500 or more", () => {
    expect(isEngineRefusal(bridged("a"), answering(400))).toBe(true);
    expect(isEngineRefusal(bridged("a"), answering(499))).toBe(true);
    expect(isEngineRefusal(bridged("a"), answering(500))).toBe(false);
    expect(isEngineRefusal(bridged("a"), answering(503))).toBe(false);
  });

  it("is false for an error that is not the engine's", () => {
    expect(isEngineRefusal(bridged("a"), answering(null))).toBe(false);
    expect(isEngineRefusal(new TypeError("a"))).toBe(false);
  });
});

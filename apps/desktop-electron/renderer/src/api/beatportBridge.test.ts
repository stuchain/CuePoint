/**
 * No Beatport bridge type hands the page a raw token (C12).
 *
 * The token lives in main and the engine's memory. The renderer is told a state, a masked preview
 * and an end; what it sends (a pasted token) goes one way, into main. These checks are types, so
 * a field that would carry a token fails the compile, and a source scan so a new one is noticed.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import bridgeTypesSource from "./cuepointBridge.types.ts?raw";
import type { BeatportAuth, BeatportTokenStatus, CuePointBridge } from "./cuepointBridge.types";

const lf = (text: string): string => text.replace(/\r\n/g, "\n");

/** The body of an exported interface in the bridge types, as text. */
function interfaceBody(name: string): string {
  const match = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(lf(bridgeTypesSource));
  if (!match) throw new Error(`${name} not found`);
  return match[1]!;
}

describe("the Beatport bridge types", () => {
  it("BeatportAuth is exactly a state, a mask, an end and the storage flag", () => {
    // Exhaustive: adding a field (a token!) to the type makes this object fail to compile.
    const fields: Record<keyof BeatportAuth, true> = {
      state: true,
      masked: true,
      expires_at: true,
      secure_storage: true,
    };
    expect(Object.keys(fields).sort()).toEqual(["expires_at", "masked", "secure_storage", "state"]);
    expectTypeOf<BeatportAuth["masked"]>().toEqualTypeOf<string | null>();
    expectTypeOf<BeatportAuth["state"]>().toEqualTypeOf<
      "signed_out" | "signed_in" | "expired" | "pasted" | "env" | "unavailable"
    >();
  });

  it("BeatportTokenStatus has a mask and a source, and no token", () => {
    const fields: Record<keyof BeatportTokenStatus, true> = { configured: true, masked: true, source: true };
    expect(Object.keys(fields).sort()).toEqual(["configured", "masked", "source"]);
    expectTypeOf<NonNullable<BeatportTokenStatus["source"]>>().toEqualTypeOf<"env" | "session" | "config">();
  });

  it("every sign-in method answers a BeatportAuth", () => {
    expectTypeOf<ReturnType<CuePointBridge["beatportSignIn"]>>().toEqualTypeOf<Promise<BeatportAuth>>();
    expectTypeOf<ReturnType<CuePointBridge["beatportSignOut"]>>().toEqualTypeOf<Promise<BeatportAuth>>();
    expectTypeOf<ReturnType<CuePointBridge["getBeatportAuth"]>>().toEqualTypeOf<Promise<BeatportAuth>>();
    expectTypeOf<ReturnType<CuePointBridge["saveBeatportPastedToken"]>>().toEqualTypeOf<Promise<BeatportAuth>>();
    expectTypeOf<Parameters<CuePointBridge["onBeatportAuthChanged"]>[0]>().toEqualTypeOf<(auth: BeatportAuth) => void>();
    expectTypeOf<ReturnType<CuePointBridge["onBeatportAuthChanged"]>>().toEqualTypeOf<() => void>();
  });

  it("names no field token, accessToken or the like in the Beatport interfaces", () => {
    for (const name of ["BeatportAuth", "BeatportTokenStatus"]) {
      const fields = [...interfaceBody(name).matchAll(/^\s{2}([A-Za-z_]+)\??:/gm)].map((m) => m[1]!);
      expect(fields.filter((field) => /token|secret|bearer|password/i.test(field))).toEqual([]);
    }
  });

  it("offers no bridge method that reads the token", () => {
    const bridge = lf(bridgeTypesSource);
    expect(bridge).not.toMatch(/\b(getBeatportToken|readBeatportToken|takeLegacy\w*|setBeatportSession\w*)\b/);
  });
});

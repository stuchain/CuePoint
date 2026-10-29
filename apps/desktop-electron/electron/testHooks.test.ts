import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { engineEnvironment } from "./engineSupervisor";
import { E2E_DISPLAY_ENV } from "./testWindowPlacement";
import { testHooksEnabled } from "./testHooks";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("the engine's test hooks (HARDEN-05)", () => {
  it("are on only with CUEPOINT_E2E=1", () => {
    expect(testHooksEnabled({ CUEPOINT_E2E: "1" })).toBe(true);
    expect(testHooksEnabled({})).toBe(false);
    expect(testHooksEnabled({ CUEPOINT_E2E: "0" })).toBe(false);
    expect(testHooksEnabled({ CUEPOINT_E2E: "true" })).toBe(false);
  });

  it("are not turned on by the display variable alone", () => {
    expect(testHooksEnabled({ [E2E_DISPLAY_ENV]: "left" })).toBe(false);
    expect(testHooksEnabled({ [E2E_DISPLAY_ENV]: "primary" })).toBe(false);
  });

  it("reach the engine only when main says so, whatever the environment inherited", () => {
    const base = { port: 1, token: "t", sessionId: "s", parentPid: 1, decoderPath: null, errorReporting: false };
    expect(engineEnvironment({ ...base, env: { CUEPOINT_TEST_HOOKS: "1" } }).CUEPOINT_TEST_HOOKS).toBeUndefined();
    expect(engineEnvironment({ ...base, env: {}, testHooks: testHooksEnabled({ CUEPOINT_E2E: "1" }) }).CUEPOINT_TEST_HOOKS).toBe("1");
  });

  it("are set for the whole e2e suite by the playwright config, and used by main through this file", () => {
    const config = fs.readFileSync(path.join(here, "..", "playwright.config.ts"), "utf8");
    expect(config).toMatch(/process\.env\.CUEPOINT_E2E \?\?= "1"/);
    const main = fs.readFileSync(path.join(here, "main.ts"), "utf8");
    expect(main).toContain("testHooks: (): boolean => testHooksEnabled()");
  });
});

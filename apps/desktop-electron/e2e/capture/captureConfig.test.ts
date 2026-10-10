/**
 * The capture runs only when asked (SITE-04): `npm run capture:showcase` uses its
 * own Playwright config, and the normal suite's config ignores the capture folder,
 * so `npm run test:e2e` never opens the app to take pictures.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import mainConfig from "../../playwright.config";
import captureConfig from "./playwright.capture.config";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("the showcase capture is outside the normal suite", () => {
  it("the main Playwright config ignores every spec under e2e/capture", () => {
    const ignore = ([] as string[]).concat((mainConfig.testIgnore as string[] | string | undefined) ?? []);
    expect(ignore).toContain("**/capture/**");
  });

  it("the capture config runs only e2e/capture, one worker, no retries", () => {
    // Playwright resolves testDir against the config file, so "./" is this folder
    expect(path.resolve(here, captureConfig.testDir!)).toBe(here);
    expect(captureConfig.workers).toBe(1);
    expect(captureConfig.retries).toBe(0);
  });

  it("package.json has the one command that retakes the pictures", () => {
    const pkg = JSON.parse(readFileSync(path.join(here, "../../package.json"), "utf-8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["capture:showcase"]).toContain("playwright test");
    expect(pkg.scripts["capture:showcase"]).toContain("e2e/capture/playwright.capture.config.ts");
  });
});

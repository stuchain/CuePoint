import { defineConfig } from "@playwright/test";

/**
 * The website's pictures, taken from the app (SITE-04): `npm run capture:showcase`.
 *
 * Its own config, so the main suite (`playwright.config.ts`, which ignores this
 * folder) never takes them, and so a capture is one app at a time with no retry:
 * a picture that failed should be looked at, not retaken blind.
 */
process.env.CUEPOINT_E2E_DISPLAY ??= "left";

/**
 * A test run reports nothing to Sentry. A packaged app sends to the built-in
 * DSN, and the suite's own reloads and engine kills filled the Electron project
 * with errors no user saw (ELECTRON-2, ELECTRON-3). The reporting specs set
 * their own DSN for each launch.
 */
process.env.CUEPOINT_SENTRY_DSN ??= "off";

export default defineConfig({
  testDir: "./",
  testMatch: "**/*.spec.ts",
  timeout: 900_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
});

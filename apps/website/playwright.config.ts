import { defineConfig } from "@playwright/test";

/**
 * SITE-03's browser checks run against `astro preview` of the built dist/ (run `npm run build` first).
 * Locally set PW_CHROMIUM_PATH to a Chromium binary (for example /opt/pw-browsers/chromium); in CI the
 * browser installed by `npx playwright install --with-deps chromium` is used.
 */
const executablePath = process.env["PW_CHROMIUM_PATH"] || undefined;
/** The preview server's port; set WEBSITE_PORT when another checkout already holds 4321. */
const port = Number(process.env["WEBSITE_PORT"] || 4321);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}/`,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `npx astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

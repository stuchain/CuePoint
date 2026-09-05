import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  /**
   * Every spec here launches a whole Electron application — several of them
   * twice, and the player specs also start an mpv child process. Playwright's
   * default is half the CPU count, which on a 16-core machine means eight
   * desktop apps at once: the suite spent four minutes thrashing and timed a
   * test out at two minutes, where two workers finish everything in one.
   *
   * Capped rather than serialised: two still overlaps the launch waits, which
   * is where the real time goes, without the contention.
   */
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
});

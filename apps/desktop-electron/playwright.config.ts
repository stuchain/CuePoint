import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  /**
   * One worker, deliberately.
   *
   * Every spec here launches a whole Electron application — several of them
   * twice, and the player specs also start an mpv child process. Playwright's
   * default is half the CPU count, which on a 16-core machine means eight
   * desktop apps at once: the suite spent four minutes thrashing and timed a
   * test out at two minutes. Two workers fixed that and was right while every
   * spec was small.
   *
   * ORG-13 made two things true that two workers cannot survive. The media
   * keys are a **machine-global** resource, so a second copy of the app
   * already holds them and which run fails depends on timing. And the batch
   * spec imports 50,000 tracks and changes all of them, which starves whatever
   * is beside it — the player's failure runs are coalesced on a 400ms timer,
   * and a starved renderer splits one run into two.
   *
   * Both are real contention rather than flaky tests, and neither is worth
   * weakening an assertion for. A suite whose result depends on which spec
   * happened to be running alongside is not a gate, and the minute and a half
   * this costs is the cheapest thing in this phase.
   */
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
});

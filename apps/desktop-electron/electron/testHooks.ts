/**
 * Whether this is an end-to-end run that may have the engine's test-only routes (HARDEN-05).
 *
 * Only `CUEPOINT_E2E=1`, which `playwright.config.ts` sets for the whole suite. The display
 * variable that places a test window is not enough on its own: a person who sets it for a
 * reason of their own must not get a route that can make the engine stop answering.
 */
export const E2E_ENV = "CUEPOINT_E2E";

export function testHooksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[E2E_ENV] === "1";
}

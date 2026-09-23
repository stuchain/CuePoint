/**
 * Wait until the engine can actually be called.
 *
 * Every spec here drives the real app against the real engine, and a window is
 * not an engine. The two used to be close enough to ignore, because
 * `createWindow()` awaited `engine.start()` and so the first window appeared
 * only once the engine had answered — the specs inherited the wait without
 * asking for it.
 *
 * That is no longer true, and it should not have been relied on. A packaged
 * macOS engine is a PyInstaller one-file build that takes about ten seconds to
 * unpack and bind on a cold start, and hiding the whole application behind it
 * was the wrong trade: the shell now opens immediately and says "Starting
 * engine…" until the engine answers. So a spec that means "the engine is
 * ready" has to say so, which is what this is for.
 *
 * It asks the bridge rather than reading the status strip, because a spec that
 * has not rendered the strip — or is about to reload the window — still needs
 * the same answer, and because the bridge is what the spec is about to use.
 */
import { expect, type Page } from "@playwright/test";

/**
 * How long to wait, matching the supervisor's own health budget.
 *
 * `HEALTH_TIMEOUT_MS` is 90s for an engine that may be unpacking 76MB; a spec
 * that gave up sooner would report a slow start as a broken one.
 */
export const ENGINE_READY_TIMEOUT_MS = 90_000;

/** Resolve once `getEngineStatus()` reports a connected engine. */
export async function waitForEngine(
  window: Page,
  timeout: number = ENGINE_READY_TIMEOUT_MS,
): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          const status = await window.evaluate(() =>
            (window as never as Record<string, any>).cuepoint?.getEngineStatus?.(),
          );
          return status?.connected === true;
        } catch {
          // The bridge is not there yet, or the page is mid-navigation.
          return false;
        }
      },
      { timeout, message: "the engine never reported itself connected" },
    )
    .toBe(true);
}

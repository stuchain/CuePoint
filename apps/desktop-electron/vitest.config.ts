import { defineConfig } from "vitest/config";

/**
 * Unit tests for Electron **main-process** code (PLAYER-02).
 *
 * The renderer has had its own vitest project since FOUNDATION-12; `electron/`
 * had no harness at all, which is why `engineSupervisor` and `engineClient` are
 * untested. PLAYER-02 needs one — its whole contract is protocol behaviour that
 * only a test can pin down — so this config covers that directory.
 *
 * Node environment, not jsdom: this code talks to sockets and child processes,
 * and none of it should ever touch a DOM.
 */
export default defineConfig({
  test: {
    environment: "node",
    // The showcase fixture and the capture config (SITE-04) are the only tests
    // under e2e/ vitest runs; the Playwright specs there are its own.
    include: ["electron/**/*.test.ts", "e2e/fixtures/showcase/*.test.ts", "e2e/capture/*.test.ts"],
    // The renderer runs its own suite from renderer/.
    exclude: ["renderer/**", "node_modules/**", "e2e/*.spec.ts", "e2e/capture/*.spec.ts"],
    // Headroom for the integration tests, which start real mpv processes and
    // wait for real playback. Comfortably above the in-test `waitFor` budgets,
    // so a genuine failure reports what it was waiting for instead of being
    // cut off by the runner on a loaded machine.
    testTimeout: 30_000,
  },
});

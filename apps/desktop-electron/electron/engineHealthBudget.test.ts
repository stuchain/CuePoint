/**
 * How long the engine gets to start (found by the Phase 8 macOS pass).
 *
 * The supervisor allowed 5 seconds — 20 attempts, 250ms apart — and a packaged
 * macOS engine does not cold-start in five seconds. It is a PyInstaller
 * one-file build whose first run unpacks ~76MB into a temporary directory and
 * imports the whole engine before it can bind a socket: measured 9.7s on an M5
 * Pro. So the health check timed out on every fresh macOS launch, and since
 * `getStatus()` reported a spawned child as connected, the strip said "Engine
 * connected" while every request through it failed.
 *
 * `scripts/build_engine_sidecar.py` had already been bitten by this and allows
 * 90s, with the reasoning written beside it. This file keeps the supervisor's
 * budget from drifting back under the number that is known to be too small:
 * it is a bound for "never starts", not a latency policy, and the thing that
 * makes waiting acceptable is that `starting` tells the UI what is happening.
 */
import { describe, expect, it } from "vitest";

import { HEALTH_POLL_MS, HEALTH_TIMEOUT_MS } from "./engineSupervisor";

/** What a packaged macOS engine actually took, cold, when this was measured. */
const MEASURED_MACOS_COLD_START_MS = 9_700;

describe("the engine's health budget", () => {
  it("is comfortably longer than a measured macOS cold start", () => {
    // Not merely "longer": a budget that only just clears the one machine it
    // was measured on fails on a slower disk, a busier machine, or a larger
    // engine. Three times over is the margin, and it is still only a bound.
    expect(HEALTH_TIMEOUT_MS).toBeGreaterThanOrEqual(MEASURED_MACOS_COLD_START_MS * 3);
  });

  it("is not the five seconds that failed", () => {
    expect(HEALTH_TIMEOUT_MS).toBeGreaterThan(5_000);
  });

  it("polls often enough to feel immediate once the engine is up", () => {
    // The budget is generous so that a slow start is survived; the interval is
    // short so that a fast one is not made to look slow.
    expect(HEALTH_POLL_MS).toBeLessThanOrEqual(500);
    expect(HEALTH_POLL_MS).toBeGreaterThan(0);
  });

  it("agrees with the build script's own timeout, which learned this first", () => {
    // Both numbers answer the same question about the same binary. If one
    // moves without the other, one of them is wrong.
    expect(HEALTH_TIMEOUT_MS).toBe(90_000);
  });
});

/**
 * An engine call made while the engine starts waits for it.
 *
 * The window stopped waiting for the engine (found by the Phase 8 macOS pass,
 * where a packaged engine takes about ten seconds to answer), and nothing took
 * its place: the first screen asked for its data straight away, was refused,
 * and the Library read the refusal as "No collection imported yet" — to a
 * library that was there, on every launch, until something made it ask again.
 * It reproduced on Windows too, where the development engine takes about four
 * seconds.
 *
 * The launch itself is stubbed: what is under test is the supervisor holding a
 * request until the start it is racing has finished, not spawning Python.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineClient, type LibrarySummary } from "./engineClient";
import { EngineSupervisor, type EngineStatus } from "./engineSupervisor";

/** The fields a finished launch sets, which `client()` reads. */
interface Launched {
  port: number | null;
  token: string | null;
  healthy: boolean;
}

/** A launch the test finishes by hand, as the engine answering would. */
function controlledLaunch(supervisor: EngineSupervisor) {
  let finish!: (status: EngineStatus) => void;
  const launch = vi
    .spyOn(EngineSupervisor.prototype as never as { launch: () => Promise<EngineStatus> }, "launch")
    .mockImplementation(
      () =>
        new Promise<EngineStatus>((resolve) => {
          finish = resolve;
        }),
    );
  const state = supervisor as never as Launched;
  return {
    launch,
    answer() {
      state.port = 51234;
      state.token = "token";
      state.healthy = true;
      finish({ connected: true });
    },
    fail() {
      finish({ connected: false, error: "Engine health check failed or timed out" });
    },
  };
}

const SUMMARY = { library_empty: false } as LibrarySummary;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("an engine call made while the engine starts", () => {
  it("waits for the engine and then gets its answer", async () => {
    const supervisor = new EngineSupervisor();
    const engine = controlledLaunch(supervisor);
    const summary = vi.spyOn(EngineClient.prototype, "getLibrarySummary").mockResolvedValue(SUMMARY);

    void supervisor.start();
    const asked = supervisor.getLibrarySummary();
    let settled = false;
    void asked.finally(() => {
      settled = true;
    });

    // Still starting: the request is held, not sent and not refused.
    expect(engine.launch).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    expect(summary).not.toHaveBeenCalled();

    engine.answer();

    await expect(asked).resolves.toBe(SUMMARY);
    expect(summary).toHaveBeenCalledOnce();
  });

  it("is refused as before when the start fails, rather than waiting forever", async () => {
    const supervisor = new EngineSupervisor();
    const engine = controlledLaunch(supervisor);

    void supervisor.start();
    const asked = supervisor.getLibraryPlaylists();

    engine.fail();

    await expect(asked).rejects.toThrow(/Engine not running/);
  });

  it("goes straight through once the engine is up", async () => {
    const supervisor = new EngineSupervisor();
    const engine = controlledLaunch(supervisor);
    const summary = vi.spyOn(EngineClient.prototype, "getLibrarySummary").mockResolvedValue(SUMMARY);

    const started = supervisor.start();
    engine.answer();
    await started;

    await expect(supervisor.getLibrarySummary()).resolves.toBe(SUMMARY);
    expect(summary).toHaveBeenCalledOnce();
  });

  it("with no engine started at all, is refused immediately", async () => {
    const supervisor = new EngineSupervisor();

    await expect(supervisor.getLibrarySummary()).rejects.toThrow(/Engine not running/);
  });
});

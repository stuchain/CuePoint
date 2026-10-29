import { describe, expect, it, vi } from "vitest";

import type { LibraryStatus } from "./engineClient";
import { INTEGRITY_INTERVAL_MS, IntegrityChecker, integrityCheckDue, settledLibrary } from "./integrityCheck";

/**
 * When the library is checked for damage (HARDEN-03): after an unclean exit and after 7 days, not
 * otherwise, and never before the first paint.
 */

const NOW = Date.parse("2026-10-29T12:00:00.000Z");
const daysAgo = (days: number): string => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

function library(over: Partial<LibraryStatus> = {}, check: LibraryStatus["integrityCheck"] = { state: "idle", finishedAt: null }): LibraryStatus {
  return {
    state: "ok",
    appVersion: "1.0.0",
    libraryVersion: "1.0.0",
    schemaVersion: 30,
    headVersion: 30,
    newestGoodBackup: null,
    preUpgradeBackup: null,
    requiredFreeBytes: null,
    failedMigration: null,
    uncleanExit: false,
    computedAt: new Date(NOW).toISOString(),
    integrityCheck: check,
    launchBackupSkipped: null,
    ...over,
  };
}

interface Rig {
  checker: IntegrityChecker;
  engine: { getLibraryStatus: ReturnType<typeof vi.fn>; startIntegrityCheck: ReturnType<typeof vi.fn> };
  saved: Array<{ lastIntegrityCheckAt: string | null }>;
  changed: LibraryStatus[];
  calls: string[];
}

/** An engine that is `ok` and finishes a check with `result` on its second look. */
function rig(options: {
  unclean?: boolean;
  last?: string | null;
  states?: LibraryStatus[];
  result?: LibraryStatus["integrityCheck"]["state"];
}): Rig {
  const calls: string[] = [];
  const saved: Array<{ lastIntegrityCheckAt: string | null }> = [];
  const changed: LibraryStatus[] = [];
  let started = false;
  const script = [...(options.states ?? [])];
  const engine = {
    getLibraryStatus: vi.fn(async () => {
      calls.push("status");
      const next = script.shift();
      if (next) return next;
      return library(
        {},
        started
          ? { state: options.result ?? "ok", finishedAt: new Date(NOW).toISOString() }
          : { state: "idle", finishedAt: null },
      );
    }),
    startIntegrityCheck: vi.fn(async () => {
      calls.push("check");
      started = true;
      return { state: "running", finishedAt: null };
    }),
  };
  const checker = new IntegrityChecker({
    engine,
    settings: {
      read: () => ({ lastIntegrityCheckAt: options.last ?? null }),
      update: (patch) => saved.push(patch),
    },
    uncleanExit: () => options.unclean ?? false,
    now: () => NOW,
    sleep: async () => undefined,
    onChanged: (state) => changed.push(state),
  });
  return { checker, engine, saved, changed, calls };
}

describe("when a check is due", () => {
  it("after an unclean exit, whatever the date", () => {
    expect(integrityCheckDue({ uncleanExit: true, lastCheckedAt: daysAgo(0), now: NOW })).toBe(true);
  });
  it("after 7 days, and not before", () => {
    expect(integrityCheckDue({ uncleanExit: false, lastCheckedAt: daysAgo(7), now: NOW })).toBe(true);
    expect(integrityCheckDue({ uncleanExit: false, lastCheckedAt: daysAgo(30), now: NOW })).toBe(true);
    expect(integrityCheckDue({ uncleanExit: false, lastCheckedAt: daysAgo(6.9), now: NOW })).toBe(false);
    expect(integrityCheckDue({ uncleanExit: false, lastCheckedAt: daysAgo(0), now: NOW })).toBe(false);
    expect(INTEGRITY_INTERVAL_MS).toBe(7 * 24 * 3600 * 1000);
  });
  it("when none has ever finished, and when the date is not believable", () => {
    expect(integrityCheckDue({ uncleanExit: false, lastCheckedAt: null, now: NOW })).toBe(true);
    expect(integrityCheckDue({ uncleanExit: false, lastCheckedAt: "garbage", now: NOW })).toBe(true);
    expect(integrityCheckDue({ uncleanExit: false, lastCheckedAt: daysAgo(-3), now: NOW })).toBe(true);
  });
});

describe("the integrity check", () => {
  it("runs after an unclean exit even a day after the last one, and records the date it passed", async () => {
    const r = rig({ unclean: true, last: daysAgo(1) });
    expect(await r.checker.afterFirstPaint()).toBe("passed");
    expect(r.engine.startIntegrityCheck).toHaveBeenCalledTimes(1);
    expect(r.saved).toEqual([{ lastIntegrityCheckAt: new Date(NOW).toISOString() }]);
  });

  it("runs after 7 days", async () => {
    const r = rig({ last: daysAgo(8) });
    expect(await r.checker.afterFirstPaint()).toBe("passed");
    expect(r.engine.startIntegrityCheck).toHaveBeenCalledTimes(1);
  });

  it("does not run otherwise: the engine is not even asked", async () => {
    const r = rig({ last: daysAgo(2) });
    expect(await r.checker.afterFirstPaint()).toBe("not-due");
    expect(r.engine.getLibraryStatus).not.toHaveBeenCalled();
    expect(r.engine.startIntegrityCheck).not.toHaveBeenCalled();
    expect(r.saved).toEqual([]);
  });

  it("is once per session", async () => {
    const r = rig({ unclean: true });
    await r.checker.afterFirstPaint();
    await r.checker.afterFirstPaint();
    expect(r.engine.startIntegrityCheck).toHaveBeenCalledTimes(1);
  });

  it("waits for the library to be ok first, and asks nothing of one that has a screen of its own", async () => {
    const waits = rig({ unclean: true, states: [library({ state: "upgrading" }), library({ state: "upgrading" })] });
    expect(await waits.checker.afterFirstPaint()).toBe("passed");
    expect(waits.calls.indexOf("check")).toBeGreaterThanOrEqual(2);

    const damaged = rig({ unclean: true, states: [library({ state: "damaged" })] });
    expect(await damaged.checker.afterFirstPaint()).toBe("not-ready");
    expect(damaged.engine.startIntegrityCheck).not.toHaveBeenCalled();
  });

  it("does not record a check that failed, and tells the page", async () => {
    const r = rig({ unclean: true, result: "failed" });
    expect(await r.checker.afterFirstPaint()).toBe("failed");
    expect(r.saved).toEqual([]);
    expect(r.changed).toHaveLength(1);
  });

  it("does not record one that did not finish", async () => {
    const r = rig({ unclean: true, result: "idle" });
    expect(await r.checker.afterFirstPaint()).toBe("unfinished");
    expect(r.saved).toEqual([]);
  });

  it("never delays the first paint: nothing is asked before it is called, and calling it returns at once", async () => {
    const r = rig({ unclean: true });
    // Built, and the window is being made: the engine has not been touched.
    expect(r.engine.getLibraryStatus).not.toHaveBeenCalled();
    expect(r.engine.startIntegrityCheck).not.toHaveBeenCalled();

    // `afterFirstPaint` hands back a promise without having asked a thing synchronously: the
    // caller (main's `reveal`) is never held by it.
    const pending = r.checker.afterFirstPaint();
    expect(pending).toBeInstanceOf(Promise);
    expect(r.engine.startIntegrityCheck).not.toHaveBeenCalled();
    await pending;
  });

  it("is wired after the window shows in main, and nowhere before it", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const main = readFileSync(fileURLToPath(new URL("./main.ts", import.meta.url)), "utf8");
    const calls = [...main.matchAll(/void integrity\.afterFirstPaint\(\);/g)].map((m) => m.index ?? -1);
    expect(calls).toHaveLength(2); // the window shown, and shown without focus (tests)
    // Not awaited: the window's creation is never held by it.
    expect(main).not.toMatch(/await\s+integrity\.afterFirstPaint/);
    // Each follows the window's own show, in the same block.
    const inactive = main.indexOf("win.showInactive();");
    const shown = main.indexOf("win.show();", main.indexOf("const reveal = (): void => {"));
    expect(inactive).toBeGreaterThan(-1);
    expect(shown).toBeGreaterThan(-1);
    expect(main.slice(inactive, calls[0]).split("\n").length).toBeLessThan(4);
    expect(calls[0]).toBeGreaterThan(inactive);
    expect(calls[1]).toBeGreaterThan(shown);
    expect(main.slice(shown, calls[1]).split("\n").length).toBeLessThan(8);
  });
});

describe("settling after Try again", () => {
  it("answers the state once it is no longer upgrading", async () => {
    const states = [library({ state: "upgrading" }), library({ state: "upgrading" }), library({ state: "upgrade_failed" })];
    const settled = await settledLibrary(
      { getLibraryStatus: async () => states.shift() ?? library() },
      { sleep: async () => undefined },
    );
    expect(settled?.state).toBe("upgrade_failed");
  });

  it("gives up with null when the time runs out", async () => {
    let clock = 0;
    const settled = await settledLibrary(
      { getLibraryStatus: async () => library({ state: "upgrading" }) },
      { sleep: async () => void (clock += 1000), now: () => clock, maxMs: 3000 },
    );
    expect(settled).toBeNull();
  });
});

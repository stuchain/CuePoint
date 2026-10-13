import { describe, expect, it, vi } from "vitest";

import type { FinishedCall } from "./engineCallTiming";
import { createPageSwitchLog } from "./pageSwitchLog";

function setup() {
  let clock = 0;
  let active = 0;
  let calls: FinishedCall[] = [];
  let tick: (() => void) | null = null;
  const log = { info: vi.fn(), warn: vi.fn() };
  const pageLog = createPageSwitchLog({
    log,
    now: () => clock,
    wallNow: () => 1_000_000 + clock,
    inFlight: () => active,
    callsBetween: (a, b) => calls.filter((c) => c.endedAt >= a && c.endedAt <= b),
    setInterval: (fn) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
  });
  const advance = (ms: number) => {
    for (let i = 0; i < ms / 25; i++) {
      clock += 25;
      tick?.();
    }
  };
  return {
    pageLog,
    log,
    advance,
    setActive: (n: number) => (active = n),
    addCall: (c: Omit<FinishedCall, "endedAt">) => calls.push({ ...c, endedAt: 1_000_000 + clock }),
    isWatching: () => tick !== null,
  };
}

describe("createPageSwitchLog", () => {
  it("waits for in-flight 0 to hold for 150 ms, then writes one line", () => {
    const t = setup();
    t.setActive(2);
    t.pageLog.report("clean", 120);
    t.advance(500);
    t.addCall({ method: "GET", route: "/api/v1/clean/health", ms: 610, status: 200 });
    t.addCall({ method: "GET", route: "/api/v1/x", ms: 20, status: 200 });
    t.setActive(0);
    t.advance(100);
    t.setActive(1);
    t.advance(50);
    t.setActive(0);
    t.advance(125);
    expect(t.log.info).not.toHaveBeenCalled();
    t.advance(50);
    expect(t.log.info).toHaveBeenCalledTimes(1);
    expect(t.log.info).toHaveBeenCalledWith(
      "page",
      "clean drawn 120 ms, settled 675 ms, 2 calls, slowest GET /api/v1/clean/health 610 ms",
    );
    expect(t.isWatching()).toBe(false);
  });

  it("gives up at 15 s", () => {
    const t = setup();
    t.setActive(1);
    t.pageLog.report("library", 50);
    t.advance(14_975);
    expect(t.log.warn).not.toHaveBeenCalled();
    t.advance(25);
    expect(t.log.warn).toHaveBeenCalledTimes(1);
    expect(t.log.warn.mock.calls[0]![1]).toContain("settled 15000 ms");
  });

  it("is a WARN when drawn or settled takes over a second, else INFO", () => {
    const slowDraw = setup();
    slowDraw.pageLog.report("clean", 1200);
    slowDraw.advance(200);
    expect(slowDraw.log.warn).toHaveBeenCalledTimes(1);

    const slowSettle = setup();
    slowSettle.setActive(1);
    slowSettle.pageLog.report("clean", 100);
    slowSettle.advance(1200);
    slowSettle.setActive(0);
    slowSettle.advance(200);
    expect(slowSettle.log.warn).toHaveBeenCalledTimes(1);

    const fast = setup();
    fast.pageLog.report("clean", 100);
    fast.advance(200);
    expect(fast.log.info).toHaveBeenCalledTimes(1);
    expect(fast.log.warn).not.toHaveBeenCalled();
  });

  it("cancels the old watcher when a new switch arrives and says so", () => {
    const t = setup();
    t.setActive(1);
    t.pageLog.report("clean", 100);
    t.advance(300);
    t.pageLog.report("library", 80);
    expect(t.log.info).toHaveBeenCalledTimes(1);
    expect(t.log.info.mock.calls[0]![1]).toContain("clean left before settling");
    t.setActive(0);
    t.advance(200);
    expect(t.log.info).toHaveBeenCalledTimes(2);
    expect(t.log.info.mock.calls[1]![1]).toMatch(/^library drawn 80 ms/);
  });

  it.each([
    ["Clean", 10],
    ["", 10],
    ["a".repeat(21), 10],
    ["clean/../x", 10],
    [42, 10],
    ["clean", Number.NaN],
    ["clean", -1],
    ["clean", 600_001],
    ["clean", "100"],
    ["clean", Infinity],
  ])("ignores %j / %j", (page, ms) => {
    const t = setup();
    expect(t.pageLog.report(page, ms)).toBe(false);
    t.advance(500);
    expect(t.log.info).not.toHaveBeenCalled();
    expect(t.log.warn).not.toHaveBeenCalled();
    expect(t.isWatching()).toBe(false);
  });

  it("counts the calls made while the page was drawing", () => {
    const t = setup();
    t.advance(1000);
    // Ended before the report arrived, but after the page started drawing.
    t.addCall({ method: "GET", route: "/api/v1/keys/population", ms: 900, status: 200 });
    t.advance(300);
    t.pageLog.report("keys", 1200);
    t.advance(200);
    expect(t.log.warn).toHaveBeenCalledWith("page", expect.stringContaining("1 calls, slowest GET /api/v1/keys/population 900 ms"));
  });
});

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SETTLE_MS, Settler, useSettled } from "./waveformSettle";

/**
 * Rows settle before they are asked for (WAVE-06): a row asks once it has been
 * shown for 100 ms, and rows shown together settle together, in one task.
 */

/** A settler whose timers and task boundaries the test runs by hand. */
function setup() {
  const timers: { run: () => void; ms: number }[] = [];
  const ends: (() => void)[] = [];
  const settler = new Settler({
    setTimeout: (run, ms) => timers.push({ run, ms }),
    endOfTask: (run) => ends.push(run),
  });
  return {
    settler,
    timers,
    endTask: () => ends.splice(0).forEach((run) => run()),
    fire: (index: number) => timers[index]!.run(),
  };
}

describe("Settler", () => {
  it("waits 100 ms by default", () => {
    expect(SETTLE_MS).toBe(100);
    const { settler, timers } = setup();
    settler.settle(() => undefined);
    expect(timers[0]!.ms).toBe(SETTLE_MS);
  });

  it("settles everything started in one task together, on one timer", () => {
    const { settler, timers, fire } = setup();
    const order: string[] = [];
    settler.settle(() => order.push("a"));
    settler.settle(() => order.push("b"));
    settler.settle(() => order.push("c"));

    expect(timers).toHaveLength(1);
    expect(order).toEqual([]);
    fire(0);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("starts a new group, with its own timer, in the next task", () => {
    const { settler, timers, endTask, fire } = setup();
    const settled: string[] = [];
    settler.settle(() => settled.push("first"));
    endTask();
    settler.settle(() => settled.push("second"));

    expect(timers).toHaveLength(2);
    fire(0);
    expect(settled).toEqual(["first"]);
    fire(1);
    expect(settled).toEqual(["first", "second"]);
  });

  it("never runs a cancelled callback", () => {
    const { settler, fire } = setup();
    const kept = vi.fn();
    const dropped = vi.fn();
    settler.settle(kept);
    const cancel = settler.settle(dropped);
    cancel();
    fire(0);

    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });

  it("runs each callback once", () => {
    const { settler, fire } = setup();
    const run = vi.fn();
    settler.settle(run);
    fire(0);
    fire(0);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("useSettled", () => {
  it("is false until its key has been shown for the delay, then true", () => {
    const { settler, fire } = setup();
    const { result } = renderHook(() => useSettled(7, settler));
    expect(result.current).toBe(false);

    act(() => fire(0));

    expect(result.current).toBe(true);
  });

  it("waits again for a new key, and never settles a key it left", () => {
    const { settler, endTask, fire } = setup();
    const { result, rerender } = renderHook(({ key }) => useSettled(key, settler), {
      initialProps: { key: 7 as number | null },
    });
    act(() => fire(0));
    expect(result.current).toBe(true);

    endTask();
    rerender({ key: 8 });
    expect(result.current).toBe(false);
    endTask();
    rerender({ key: 9 });
    act(() => fire(1));
    expect(result.current).toBe(false);
    act(() => fire(2));
    expect(result.current).toBe(true);
  });

  it("never settles null", () => {
    const { settler, timers } = setup();
    const { result } = renderHook(() => useSettled(null, settler));
    expect(timers).toHaveLength(0);
    expect(result.current).toBe(false);
  });
});

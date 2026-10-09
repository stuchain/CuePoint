import { describe, expect, it } from "vitest";

import { PaintQueue } from "./waveformPaintQueue";

/**
 * The paint queue (WAVE-06): a task paints until its budget is spent and the
 * rest wait for later tasks, in order, each a budget long. A clock, the later
 * task and the end of a task are all driven by hand here.
 */
function rig(budgetMs = 6) {
  let clock = 0;
  const later: (() => void)[] = [];
  const ends: (() => void)[] = [];
  const queue = new PaintQueue({
    budgetMs,
    now: () => clock,
    defer: (run) => later.push(run),
    endOfTask: (run) => ends.push(run),
  });
  const painted: string[] = [];
  /** A paint that takes `ms`. */
  const paint = (name: string, ms = 2) => () => {
    painted.push(name);
    clock += ms;
  };
  const endTask = () => ends.splice(0).forEach((run) => run());
  const nextTask = () => {
    endTask();
    later.shift()?.();
  };
  return { queue, painted, paint, endTask, nextTask, later, advance: (ms: number) => (clock += ms) };
}

describe("PaintQueue", () => {
  it("paints a lone canvas at once", () => {
    const { queue, painted, paint, later } = rig();
    queue.paint({}, paint("a"));
    expect(painted).toEqual(["a"]);
    expect(later).toHaveLength(0);
  });

  it("paints until the task's budget is spent, then the rest in later tasks, in order", () => {
    const { queue, painted, paint, nextTask } = rig(6);
    const keys = Array.from({ length: 8 }, () => ({}));
    keys.forEach((key, i) => queue.paint(key, paint(`c${i}`, 2)));
    // 0, 2 and 4 ms in: three paints, then the budget is spent.
    expect(painted).toEqual(["c0", "c1", "c2"]);
    expect(queue.size).toBe(5);
    nextTask();
    expect(painted).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"]);
    nextTask();
    expect(painted).toEqual(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
    expect(queue.size).toBe(0);
  });

  it("gives each task its own budget", () => {
    const { queue, painted, paint, endTask } = rig(6);
    queue.paint({}, paint("a", 10));
    endTask();
    queue.paint({}, paint("b", 1));
    expect(painted).toEqual(["a", "b"]);
  });

  it("keeps only a waiting canvas's latest paint", () => {
    const { queue, painted, paint, nextTask } = rig(6);
    const key = {};
    queue.paint({}, paint("first", 10));
    queue.paint(key, paint("old"));
    queue.paint(key, paint("new"));
    nextTask();
    expect(painted).toEqual(["first", "new"]);
  });

  it("does not paint a canvas cancelled while it waited", () => {
    const { queue, painted, paint, nextTask } = rig(6);
    queue.paint({}, paint("first", 10));
    const cancel = queue.paint({}, paint("gone"));
    cancel();
    nextTask();
    expect(painted).toEqual(["first"]);
    expect(queue.size).toBe(0);
  });

  it("puts a canvas behind those already waiting, even with time left", () => {
    const { queue, painted, paint, endTask, nextTask } = rig(6);
    queue.paint({}, paint("a", 10));
    queue.paint({}, paint("b", 1));
    endTask();
    queue.paint({}, paint("c", 1));
    expect(painted).toEqual(["a"]);
    nextTask();
    expect(painted).toEqual(["a", "b", "c"]);
  });
});

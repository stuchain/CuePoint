import { describe, expect, it } from "vitest";
import { FRAME_MS, createLoop, type LoopEnv } from "./loop";

function fakeEnv(over: Partial<LoopEnv> = {}) {
  let clock = 0;
  let next = 1;
  const queue = new Map<number, (t: number) => void>();
  const env: LoopEnv = {
    reducedMotion: false,
    saveData: false,
    raf: (cb) => {
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    caf: (id) => void queue.delete(id),
    ...over,
  };
  /** Run the next frame callback, `ms` after the last. */
  const tick = (ms: number) => {
    clock += ms;
    const [id, cb] = [...queue.entries()][0] ?? [];
    if (id === undefined || !cb) return false;
    queue.delete(id);
    cb(clock);
    return true;
  };
  return { env, tick, pending: () => queue.size };
}

describe("the loop", () => {
  it("runs at most 30 frames a second", () => {
    expect(FRAME_MS).toBeGreaterThanOrEqual(1000 / 30 - 0.01);
    const drawn: number[] = [];
    const { env, tick } = fakeEnv();
    const loop = createLoop((s) => drawn.push(s), env);
    loop.start();
    const first = drawn.length;
    // a 120 Hz display: callbacks every 1000/120 ms for one second
    for (let i = 0; i < 120; i += 1) tick(1000 / 120);
    expect(drawn.length - first).toBeLessThanOrEqual(31);
    expect(drawn.length - first).toBeGreaterThanOrEqual(28);
  });

  it("draws one still frame with reduced motion, and never schedules a frame", () => {
    const drawn: number[] = [];
    const { env, pending } = fakeEnv({ reducedMotion: true });
    const loop = createLoop((s) => drawn.push(s), env);
    loop.start();
    loop.setVisible(true);
    loop.setOnScreen(true);
    expect(drawn).toHaveLength(1);
    expect(pending()).toBe(0);
    expect(loop.running()).toBe(false);
  });

  it("draws one still frame with saveData", () => {
    const drawn: number[] = [];
    const { env, pending } = fakeEnv({ saveData: true });
    createLoop((s) => drawn.push(s), env).start();
    expect(drawn).toHaveLength(1);
    expect(pending()).toBe(0);
  });

  it("pauses when the tab is hidden and when the strip is off screen, and resumes", () => {
    const drawn: number[] = [];
    const { env, tick, pending } = fakeEnv();
    const loop = createLoop((s) => drawn.push(s), env);
    loop.start();
    expect(loop.running()).toBe(true);
    loop.setVisible(false);
    expect(loop.running()).toBe(false);
    expect(pending()).toBe(0);
    loop.setVisible(true);
    expect(loop.running()).toBe(true);
    loop.setOnScreen(false);
    expect(loop.running()).toBe(false);
    expect(pending()).toBe(0);
    const n = drawn.length;
    tick(100);
    expect(drawn).toHaveLength(n);
    loop.setOnScreen(true);
    expect(loop.running()).toBe(true);
  });

  it("keeps its place in the pattern across a pause (time of the loop, not the clock)", () => {
    const drawn: number[] = [];
    const { env, tick } = fakeEnv();
    const loop = createLoop((s) => drawn.push(s), env);
    loop.start();
    for (let i = 0; i < 10; i += 1) tick(34);
    const before = drawn[drawn.length - 1] as number;
    loop.setVisible(false);
    loop.setVisible(true);
    tick(34);
    const after = drawn[drawn.length - 1] as number;
    // no jump of a minute after a long pause: at most a frame or two forward
    expect(after - before).toBeLessThan(0.2);
  });

  it("stop() ends the loop", () => {
    const { env, pending } = fakeEnv();
    const loop = createLoop(() => undefined, env);
    loop.start();
    loop.stop();
    expect(pending()).toBe(0);
    expect(loop.running()).toBe(false);
  });

  it("stops and draws one still frame when reduced motion turns on while it runs, and runs again when it turns off", () => {
    const drawn: number[] = [];
    const { env, tick, pending } = fakeEnv();
    const loop = createLoop((s) => drawn.push(s), env);
    loop.start();
    for (let i = 0; i < 5; i += 1) tick(34);
    const before = drawn.length;
    loop.setReduced(true);
    expect(loop.running()).toBe(false);
    expect(pending()).toBe(0);
    expect(drawn).toHaveLength(before + 1);
    loop.setVisible(true);
    loop.setOnScreen(true);
    expect(loop.running()).toBe(false);
    loop.setReduced(false);
    expect(loop.running()).toBe(true);
  });
});

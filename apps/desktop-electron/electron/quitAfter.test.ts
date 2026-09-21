/**
 * A quit waits for its cleanup (EXPORT-07).
 *
 * The regression: an `async` `before-quit` listener is not awaited, so the app
 * could quit before the engine was stopped and leave it running.
 */
import { describe, expect, it, vi } from "vitest";

import { QUIT_CLEANUP_TIMEOUT_MS, quitAfter, type QuitEvent } from "./quitAfter";

function fakeApp() {
  let listener: ((event: QuitEvent) => void) | null = null;
  const app = {
    on: vi.fn((_name: "before-quit", next: (event: QuitEvent) => void) => {
      listener = next;
    }),
    quit: vi.fn(),
  };
  const beforeQuit = () => {
    const event = { preventDefault: vi.fn() };
    listener!(event);
    return event;
  };
  return { app, beforeQuit };
}

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (cause: unknown) => void = () => undefined;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("quitting after the cleanup", () => {
  it("holds the first quit until the cleanup has finished, then quits", async () => {
    const { app, beforeQuit } = fakeApp();
    const cleanup = deferred();
    quitAfter(app, () => cleanup.promise, { setTimer: () => undefined });

    const first = beforeQuit();
    expect(first.preventDefault).toHaveBeenCalledTimes(1);
    await settle();
    expect(app.quit).not.toHaveBeenCalled();

    cleanup.resolve();
    await settle();
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it("lets the second quit through, so the app actually closes", async () => {
    const { app, beforeQuit } = fakeApp();
    quitAfter(app, async () => undefined, { setTimer: () => undefined });

    beforeQuit();
    await settle();
    const second = beforeQuit();
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it("runs the cleanup once, however many times quit is asked for meanwhile", async () => {
    const { app, beforeQuit } = fakeApp();
    const cleanup = deferred();
    const run = vi.fn(() => cleanup.promise);
    quitAfter(app, run, { setTimer: () => undefined });

    beforeQuit();
    const again = beforeQuit();
    expect(again.preventDefault).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);

    cleanup.resolve();
    await settle();
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it("quits anyway when the cleanup fails", async () => {
    const { app, beforeQuit } = fakeApp();
    quitAfter(app, () => Promise.reject(new Error("player would not stop")), {
      setTimer: () => undefined,
    });
    beforeQuit();
    await settle();
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it("quits anyway when the cleanup throws before it is even a promise", async () => {
    const { app, beforeQuit } = fakeApp();
    quitAfter(
      app,
      () => {
        throw new Error("no engine");
      },
      { setTimer: () => undefined },
    );
    beforeQuit();
    await settle();
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it("quits anyway when the cleanup hangs, after the time limit", async () => {
    const { app, beforeQuit } = fakeApp();
    let fire: () => void = () => undefined;
    const setTimer = vi.fn((callback: () => void) => {
      fire = callback;
    });
    quitAfter(app, () => new Promise(() => undefined), { setTimer });

    beforeQuit();
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), QUIT_CLEANUP_TIMEOUT_MS);
    await settle();
    expect(app.quit).not.toHaveBeenCalled();

    fire();
    await settle();
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it("is what main.ts quits through, around the engine's stop", async () => {
    const { readFileSync } = await import("node:fs");
    const main = readFileSync(new URL("./main.ts", import.meta.url), "utf-8");
    expect(main).toContain("quitAfter(app,");
    expect(main).not.toMatch(/app\.on\(\s*"before-quit"/);
    const body = main.slice(main.indexOf("quitAfter(app,"));
    expect(body.indexOf("await engine.stop()")).toBeGreaterThan(-1);
  });
});

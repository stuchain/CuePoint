/**
 * Counts every `engine:*` call in the Electron main process, per channel, for the specs that hold a
 * page to the engine's call budget (`engineCallRate.spec.ts`, `followAndNext.spec.ts`).
 */
import type { ElectronApplication } from "@playwright/test";

/** Records the time of every `engine:*` invoke in the main process (`ipcMain._invokeHandlers`). */
export async function recordEngineCalls(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    type Handler = (...args: unknown[]) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers?: Map<string, Handler> })._invokeHandlers;
    if (!(handlers instanceof Map)) {
      throw new Error("ipcMain._invokeHandlers is not a Map in this Electron: update e2e/support/engineCalls.ts.");
    }
    const g = globalThis as unknown as { __engineCalls?: Record<string, number[]> };
    const calls: Record<string, number[]> = {};
    g.__engineCalls = calls;
    const wrap = (channel: string, handler: Handler): Handler => {
      const wrapped: Handler & { __timed?: boolean } = (...args) => {
        (calls[channel] ??= []).push(Date.now());
        return handler(...args);
      };
      wrapped.__timed = true;
      return wrapped;
    };
    const timed = (handler: Handler) => (handler as Handler & { __timed?: boolean }).__timed === true;
    const set = handlers.set.bind(handlers);
    for (const [channel, handler] of handlers.entries()) {
      if (channel.startsWith("engine:") && !timed(handler)) set(channel, wrap(channel, handler));
    }
    handlers.set = (channel, handler) =>
      set(channel, channel.startsWith("engine:") && !timed(handler) ? wrap(channel, handler) : handler);
  });
}

export async function engineCalls(app: ElectronApplication): Promise<Record<string, number[]>> {
  return app.evaluate(() => ({ ...((globalThis as unknown as { __engineCalls?: Record<string, number[]> }).__engineCalls) }));
}

/** The most calls in any one-second window, per channel, with the window's start. */
export function busiestSecond(calls: Record<string, number[]>): Array<{ channel: string; count: number; at: number }> {
  const out: Array<{ channel: string; count: number; at: number }> = [];
  for (const [channel, times] of Object.entries(calls)) {
    const sorted = [...times].sort((a, b) => a - b);
    let best = 0;
    let at = sorted[0] ?? 0;
    let start = 0;
    for (let end = 0; end < sorted.length; end += 1) {
      while (sorted[end] - sorted[start] >= 1_000) start += 1;
      if (end - start + 1 > best) {
        best = end - start + 1;
        at = sorted[start];
      }
    }
    out.push({ channel, count: best, at });
  }
  return out.sort((a, b) => b.count - a.count);
}

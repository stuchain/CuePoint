/**
 * A stand-in for `window.cuepoint.updates` (DIST-07) for the tests of the update screens:
 * every method is a spy, and `push` sends the listeners a new state the way main does.
 */
import { vi } from "vitest";

import type { UpdateState, UpdatesBridge, WhatsNew } from "../api/cuepointBridge.types";

export function updateState(overrides: Partial<UpdateState> = {}): UpdateState {
  return {
    status: "idle",
    currentVersion: "1.0.0-test.1",
    version: null,
    notes: null,
    progress: null,
    releaseUrl: null,
    manualReason: null,
    error: null,
    lastCheckedAt: null,
    ...overrides,
  };
}

export interface FakeUpdates {
  bridge: UpdatesBridge;
  push: (state: UpdateState) => void;
  listeners: Set<(state: UpdateState) => void>;
}

export function installUpdates(
  initial: UpdateState,
  options: { whatsNew?: WhatsNew | null; notes?: WhatsNew; extra?: Record<string, unknown> } = {},
): FakeUpdates {
  const listeners = new Set<(state: UpdateState) => void>();
  let current = initial;
  const bridge: UpdatesBridge = {
    getState: vi.fn(async () => current),
    check: vi.fn(async () => current),
    restart: vi.fn(async () => true),
    subscribe: vi.fn((listener: (state: UpdateState) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    getWhatsNew: vi.fn(async () => options.whatsNew ?? null),
    dismissWhatsNew: vi.fn(async () => undefined),
    getNotes: vi.fn(
      async () => options.notes ?? { version: initial.currentVersion, notes: null, releaseUrl: null },
    ),
    openReleasePage: vi.fn(async () => true),
    openLink: vi.fn(async () => true),
  };
  const host = window as unknown as { cuepoint?: Record<string, unknown> };
  host.cuepoint = { ...host.cuepoint, updates: bridge, ...options.extra };
  return {
    bridge,
    listeners,
    push: (state) => {
      current = state;
      for (const listener of [...listeners]) listener(state);
    },
  };
}

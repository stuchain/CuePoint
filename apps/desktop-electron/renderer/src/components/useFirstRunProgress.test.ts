import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { LibraryHealth } from "../api/cuepointBridge.types";
import { announceLibraryChange } from "../api/libraryChanges";
import { useFirstRunProgress } from "./useFirstRunProgress";

function health(trackCount: number, notMatched?: number): LibraryHealth {
  return {
    track_count: trackCount,
    counts:
      notMatched === undefined
        ? []
        : [{ id: "not_matched", label: "Not matched", count: notMatched, rules: { match: "all", rules: [] } }],
    detections: [],
    unavailable_roots: [],
  };
}

type Listener = (auth: { state: string }) => void;

function install(bridge: Record<string, unknown>) {
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
}

const auth = (state: string) => ({ state, masked: null, expires_at: null, secure_storage: true });

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("useFirstRunProgress", () => {
  it("is unread without a bridge", () => {
    const { result } = renderHook(() => useFirstRunProgress());
    expect(result.current).toEqual({ trackCount: null, matchedCount: null, signedIn: false });
  });

  it("reads the track count and the matched count (tracks minus not matched)", async () => {
    install({ getLibraryHealth: vi.fn().mockResolvedValue(health(300, 64)) });
    const { result } = renderHook(() => useFirstRunProgress());
    await waitFor(() => expect(result.current.trackCount).toBe(300));
    expect(result.current.matchedCount).toBe(236);
  });

  it("leaves matched unread when Health has no not-matched count", async () => {
    install({ getLibraryHealth: vi.fn().mockResolvedValue(health(5)) });
    const { result } = renderHook(() => useFirstRunProgress());
    await waitFor(() => expect(result.current.trackCount).toBe(5));
    expect(result.current.matchedCount).toBeNull();
  });

  it("reads again on a library change and when the window gets focus", async () => {
    const read = vi.fn().mockResolvedValue(health(10, 10));
    install({ getLibraryHealth: read });
    const { result } = renderHook(() => useFirstRunProgress());
    await waitFor(() => expect(result.current.matchedCount).toBe(0));

    read.mockResolvedValue(health(10, 6));
    act(() => announceLibraryChange());
    await waitFor(() => expect(result.current.matchedCount).toBe(4));

    read.mockResolvedValue(health(10, 2));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(result.current.matchedCount).toBe(8));
  });

  it("keeps the last answer when a re-read fails", async () => {
    const read = vi.fn().mockResolvedValue(health(10, 6));
    install({ getLibraryHealth: read });
    const { result } = renderHook(() => useFirstRunProgress());
    await waitFor(() => expect(result.current.matchedCount).toBe(4));

    read.mockRejectedValue(new Error("engine busy"));
    act(() => announceLibraryChange());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(result.current).toMatchObject({ trackCount: 10, matchedCount: 4 });
  });

  it.each([
    ["signed_in", true],
    ["pasted", true],
    ["env", true],
    ["signed_out", false],
    ["expired", false],
    ["unavailable", false],
  ])("reads sign-in state %s as signedIn %s", async (state, expected) => {
    install({
      getBeatportAuth: vi.fn().mockResolvedValue(auth(state)),
      onBeatportAuthChanged: vi.fn(() => vi.fn()),
    });
    const { result } = renderHook(() => useFirstRunProgress());
    await waitFor(() => expect(window.cuepoint!.getBeatportAuth).toHaveBeenCalled());
    await waitFor(() => expect(result.current.signedIn).toBe(expected));
  });

  it("follows main's announcements and unsubscribes on unmount", async () => {
    let listener: Listener | undefined;
    const unsubscribe = vi.fn();
    install({
      getBeatportAuth: vi.fn().mockResolvedValue(auth("signed_out")),
      onBeatportAuthChanged: vi.fn((next: Listener) => {
        listener = next;
        return unsubscribe;
      }),
    });
    const { result, unmount } = renderHook(() => useFirstRunProgress());
    await waitFor(() => expect(listener).toBeDefined());
    act(() => listener?.(auth("signed_in")));
    expect(result.current.signedIn).toBe(true);
    act(() => listener?.(auth("signed_out")));
    expect(result.current.signedIn).toBe(false);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("falls back to the saved-token status only when getBeatportAuth is absent", async () => {
    install({ getBeatportTokenStatus: vi.fn().mockResolvedValue({ configured: true, masked: "ab…yz" }) });
    const { result } = renderHook(() => useFirstRunProgress());
    await waitFor(() => expect(result.current.signedIn).toBe(true));

    const status = vi.fn().mockResolvedValue({ configured: true, masked: null });
    install({
      getBeatportAuth: vi.fn().mockResolvedValue(auth("signed_out")),
      onBeatportAuthChanged: vi.fn(() => vi.fn()),
      getBeatportTokenStatus: status,
    });
    const again = renderHook(() => useFirstRunProgress());
    await waitFor(() => expect(window.cuepoint!.getBeatportAuth).toHaveBeenCalled());
    expect(again.result.current.signedIn).toBe(false);
    expect(status).not.toHaveBeenCalled();
  });

  it("reads and subscribes to nothing while disabled, and starts when enabled", async () => {
    const read = vi.fn().mockResolvedValue(health(10, 4));
    const getAuth = vi.fn().mockResolvedValue(auth("signed_in"));
    const subscribe = vi.fn(() => vi.fn());
    install({ getLibraryHealth: read, getBeatportAuth: getAuth, onBeatportAuthChanged: subscribe });
    const { result, rerender } = renderHook(({ on }) => useFirstRunProgress(on), {
      initialProps: { on: false },
    });
    act(() => announceLibraryChange());
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(read).not.toHaveBeenCalled();
    expect(getAuth).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() => expect(result.current).toEqual({ trackCount: 10, matchedCount: 6, signedIn: true }));
  });

  it("ignores a first sign-in answer that arrives after an announcement", async () => {
    let listener: Listener | undefined;
    let answer: (value: unknown) => void = () => {};
    install({
      getBeatportAuth: vi.fn(() => new Promise((resolve) => (answer = resolve))),
      onBeatportAuthChanged: vi.fn((next: Listener) => {
        listener = next;
        return vi.fn();
      }),
    });
    const { result } = renderHook(() => useFirstRunProgress());
    await waitFor(() => expect(listener).toBeDefined());
    act(() => listener?.(auth("signed_in")));
    await act(async () => answer(auth("signed_out")));
    expect(result.current.signedIn).toBe(true);
  });
});

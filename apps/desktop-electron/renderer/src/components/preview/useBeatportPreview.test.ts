import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetBeatportPreviewsForTests, stopAllPreviews, useBeatportPreview } from "./useBeatportPreview";

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  listeners: Record<string, () => void> = {};
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  addEventListener(name: string, listener: () => void) {
    this.listeners[name] = listener;
  }
}

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, Fn | unknown>;

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
  bridge = {
    getCatalogPreview: vi.fn(async ({ beatportTrackId }: { beatportTrackId: number }) =>
      beatportTrackId === 404 ? null : `blob:catalog-${beatportTrackId}`,
    ),
    getCandidatePreview: vi.fn(async ({ candidateId }: { candidateId: number }) =>
      `blob:candidate-${candidateId}`,
    ),
    releaseCandidatePreview: vi.fn(),
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
});

afterEach(() => {
  resetBeatportPreviewsForTests();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "cuepoint");
});

const catalog = (id: number) => ({ kind: "catalog" as const, id });

describe("useBeatportPreview", () => {
  it("plays a catalog sample and stops it on a second press, letting go of the URL", async () => {
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    expect(result.current.state).toBe("idle");

    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    expect(bridge.getCatalogPreview).toHaveBeenCalledWith({ beatportTrackId: 1 });
    expect(FakeAudio.instances[0]!.src).toBe("blob:catalog-1");

    act(() => result.current.toggle());
    expect(result.current.state).toBe("idle");
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled();
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-1");
  });

  it("plays one at a time: starting another stops the first, across kinds", async () => {
    const a = renderHook(() => useBeatportPreview(catalog(1)));
    const b = renderHook(() => useBeatportPreview(catalog(2)));
    const c = renderHook(() => useBeatportPreview({ kind: "candidate", id: 9 }));

    act(() => a.result.current.toggle());
    await waitFor(() => expect(a.result.current.state).toBe("playing"));
    act(() => b.result.current.toggle());
    await waitFor(() => expect(b.result.current.state).toBe("playing"));
    expect(a.result.current.state).toBe("idle");
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled();
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-1");

    act(() => c.result.current.toggle());
    await waitFor(() => expect(c.result.current.state).toBe("playing"));
    expect(b.result.current.state).toBe("idle");
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-2");
  });

  it("stops when the player starts, and unsubscribes", async () => {
    let push: ((snapshot: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    bridge.player = {
      getState: vi.fn().mockResolvedValue({ playback: { playing: false, paused: true } }),
      pause: vi.fn(),
      subscribeState: vi.fn((listener: (snapshot: unknown) => void) => {
        push = listener;
        return unsubscribe;
      }),
    };
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));

    act(() => push?.({ playback: { playing: true, paused: true } }));
    expect(result.current.state).toBe("playing");
    act(() => push?.({ playback: { playing: true, paused: false } }));
    expect(result.current.state).toBe("idle");
    expect(unsubscribe).toHaveBeenCalled();
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-1");
  });

  it("pauses a playing player before it sounds", async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    bridge.player = {
      getState: vi.fn().mockResolvedValue({ playback: { playing: true, paused: false } }),
      pause,
    };
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("answers none when Beatport has no sample, and remembers it for catalog tracks", async () => {
    const { result } = renderHook(() => useBeatportPreview(catalog(404)));
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("none"));
    expect(FakeAudio.instances).toHaveLength(0);

    act(() => result.current.toggle());
    expect(bridge.getCatalogPreview).toHaveBeenCalledTimes(1);

    const again = renderHook(() => useBeatportPreview(catalog(404)));
    expect(again.result.current.state).toBe("none");
  });

  it("does not remember a candidate with no sample", async () => {
    (bridge.getCandidatePreview as Fn).mockResolvedValue(null);
    const first = renderHook(() => useBeatportPreview({ kind: "candidate", id: 3 }));
    act(() => first.result.current.toggle());
    await waitFor(() => expect(first.result.current.state).toBe("none"));
    first.unmount();

    const second = renderHook(() => useBeatportPreview({ kind: "candidate", id: 3 }));
    expect(second.result.current.state).toBe("idle");
  });

  it("stops on unmount and when the key changes", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ id }) => useBeatportPreview(catalog(id)),
      { initialProps: { id: 1 } },
    );
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));

    rerender({ id: 2 });
    expect(result.current.state).toBe("idle");
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled();

    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    unmount();
    expect(FakeAudio.instances[1]!.pause).toHaveBeenCalled();
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-2");
  });

  it("lets go of a URL that arrives after the press was cancelled", async () => {
    let resolve!: (url: string) => void;
    (bridge.getCatalogPreview as Fn).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    act(() => result.current.toggle());
    expect(result.current.state).toBe("loading");
    act(() => result.current.toggle());
    expect(result.current.state).toBe("idle");

    await act(async () => resolve("blob:late"));
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:late");
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it("reports that a build without the bridge cannot preview", () => {
    delete bridge.getCatalogPreview;
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    expect(result.current.canPreview).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.state).toBe("idle");
  });

  it("goes idle when the sample ends", async () => {
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    act(() => FakeAudio.instances[0]!.listeners.ended!());
    expect(result.current.state).toBe("idle");
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-1");
  });

  it("keeps sounding when a cell with stopOnUnmount false goes, and a remounted cell shows playing", async () => {
    const first = renderHook(() => useBeatportPreview(catalog(1), { stopOnUnmount: false }));
    act(() => first.result.current.toggle());
    await waitFor(() => expect(first.result.current.state).toBe("playing"));
    first.unmount();
    expect(FakeAudio.instances[0]!.pause).not.toHaveBeenCalled();

    const again = renderHook(() => useBeatportPreview(catalog(1), { stopOnUnmount: false }));
    expect(again.result.current.state).toBe("playing");
    act(() => stopAllPreviews());
    expect(again.result.current.state).toBe("idle");
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled();
  });

  it("lets go of a sample cancelled during the player.getState() wait", async () => {
    let answer!: (state: unknown) => void;
    bridge.player = {
      getState: vi.fn(() => new Promise((r) => (answer = r))),
      pause: vi.fn(),
    };
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    act(() => result.current.toggle());
    await waitFor(() => expect(bridge.player && (bridge.player as { getState: Fn }).getState).toHaveBeenCalled());
    act(() => result.current.toggle());
    expect(result.current.state).toBe("idle");

    await act(async () => answer({ playback: { playing: false, paused: true } }));
    expect(FakeAudio.instances).toHaveLength(0);
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-1");
  });

  it("resets, and does not remember none, when play() rejects", async () => {
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        constructor(src: string) {
          super(src);
          this.play = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
        }
      },
    );
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    act(() => result.current.toggle());
    await waitFor(() => expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-1"));
    expect(result.current.state).toBe("idle");
    act(() => result.current.toggle());
    await waitFor(() => expect(bridge.getCatalogPreview).toHaveBeenCalledTimes(2));
  });

  it("does not remember a bridge error as no sample", async () => {
    (bridge.getCatalogPreview as Fn).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    act(() => result.current.toggle());
    await waitFor(() => expect(bridge.getCatalogPreview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.state).toBe("idle"));
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));
  });

  it("forgets a no-sample answer after ten minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { result } = renderHook(() => useBeatportPreview(catalog(404)));
      act(() => result.current.toggle());
      await vi.waitFor(() => expect(result.current.state).toBe("none"));
      act(() => stopAllPreviews());
      expect(result.current.state).toBe("none");
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      const later = renderHook(() => useBeatportPreview(catalog(404)));
      expect(later.result.current.state).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("plays only the second of two quick presses when the first answer is late", async () => {
    let late!: (url: string) => void;
    (bridge.getCatalogPreview as Fn).mockImplementation(({ beatportTrackId }: { beatportTrackId: number }) =>
      beatportTrackId === 1 ? new Promise((r) => (late = r)) : Promise.resolve(`blob:catalog-${beatportTrackId}`),
    );
    const a = renderHook(() => useBeatportPreview(catalog(1)));
    const b = renderHook(() => useBeatportPreview(catalog(2)));
    act(() => a.result.current.toggle());
    act(() => b.result.current.toggle());
    await waitFor(() => expect(b.result.current.state).toBe("playing"));

    await act(async () => late("blob:catalog-1"));
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]!.src).toBe("blob:catalog-2");
    expect(a.result.current.state).toBe("idle");
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-1");
  });

  it("clears and releases the URL when the audio element errors", async () => {
    const { result } = renderHook(() => useBeatportPreview(catalog(1)));
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.state).toBe("playing"));
    act(() => FakeAudio.instances[0]!.listeners.error!());
    expect(result.current.state).toBe("idle");
    expect(bridge.releaseCandidatePreview).toHaveBeenCalledWith("blob:catalog-1");
  });
});

import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerLevels, PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import { MotionProvider } from "../../tokens/MotionContext";
import { MOTION_FOLLOW_SYSTEM_KEY, MOTION_STORAGE_KEY } from "../../tokens/motion";
import { EMPTY_AUDIO_STATE } from "../player/playerFormat";
import { resetPlayerStore } from "../player/playerStore";
import { PageActiveContext } from "../shell/pageActive";
import { forgetWaveforms } from "../waveform/waveformCache";
import { CrowdScene } from "./CrowdScene";
import { makeContextMock, type FillRecord } from "./crowd.testFixture";

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    trackId: null,
    filePath: "/music/strobe.flac",
    title: "Strobe",
    artist: "deadmau5",
    key: "8A",
    bpm: 128,
    durationSeconds: 600,
    status: "playing",
    ...overrides,
  };
}

function snapshot(current: QueueItem | null, playing = true): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: current?.filePath ?? null,
      playing: current !== null,
      paused: current !== null && !playing,
      positionSeconds: current ? 30 : null,
      durationSeconds: current ? 600 : null,
      volume: 80,
      muted: false,
    },
    queue: {
      length: current ? 1 : 0,
      currentId: current?.id ?? null,
      currentIndex: current ? 0 : -1,
      currentItem: current,
      shuffle: false,
      repeat: "off",
    },
    audio: EMPTY_AUDIO_STATE,
  };
}

interface Harness {
  levels: ((reading: PlayerLevels) => void) | null;
  unsubscribeLevels: ReturnType<typeof vi.fn>;
  subscribeLevels: ReturnType<typeof vi.fn>;
  frames: Map<number, FrameRequestCallback>;
  fills: FillRecord[];
}

let h: Harness;
let nextHandle = 1;
let clock = 0;
let push: (s: PlayerSnapshot) => void = () => undefined;

/** The app's motion: `MotionProvider` is what the real shell mounts. */
function scene(ui: ReactElement = <CrowdScene />): ReactElement {
  return <MotionProvider>{ui}</MotionProvider>;
}

function reducedMotion(reduced: boolean): void {
  window.matchMedia = vi.fn(() => ({
    matches: reduced,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function install(current: QueueItem | null, playing = true): void {
  const unsubscribeLevels = vi.fn();
  const subscribeLevels = vi.fn((onLevels: (reading: PlayerLevels) => void) => {
    h.levels = onLevels;
    return unsubscribeLevels;
  });
  h.unsubscribeLevels = unsubscribeLevels;
  h.subscribeLevels = subscribeLevels;
  const state = snapshot(current, playing);
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    player: {
      subscribeState: (cb: (s: PlayerSnapshot) => void) => {
        push = cb;
        cb(state);
        return () => undefined;
      },
      getState: () => Promise.resolve(state),
      subscribeLevels,
    },
  };
}

/** Run every frame callback that is waiting, `ms` later than the last. */
function runFrames(at: number): void {
  const waiting = [...h.frames.entries()];
  h.frames.clear();
  for (const [, callback] of waiting) callback(at);
}

beforeEach(() => {
  h = { levels: null, unsubscribeLevels: vi.fn(), subscribeLevels: vi.fn(), frames: new Map(), fills: [] };
  nextHandle = 1;
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const mock = makeContextMock();
  h.fills = mock.fills;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => mock.ctx) as never);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
    const handle = nextHandle++;
    h.frames.set(handle, callback);
    return handle;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle: number) => {
    h.frames.delete(handle);
  });
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) =>
          name === "--accent-primary"
            ? "#ff0000"
            : name === "--bg-app"
              ? "#101010"
              : name === "--accent-warning"
                ? "#eab308"
                : "",
      }) as CSSStyleDeclaration,
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (window as { matchMedia?: unknown }).matchMedia;
  resetPlayerStore();
  forgetWaveforms();
  for (const name of document.documentElement.getAttributeNames()) {
    if (name.startsWith("data-motion-")) document.documentElement.removeAttribute(name);
  }
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("CrowdScene", () => {
  it("is one image named for the track and the dancing", () => {
    install(item());
    render(scene());
    const canvas = screen.getByRole("img", { name: "Pixel crowd dancing to Strobe" });
    expect(canvas.tagName).toBe("CANVAS");
    expect((canvas as HTMLCanvasElement).width).toBe(232);
    expect((canvas as HTMLCanvasElement).height).toBe(130);
  });

  it("says so when the player is paused or has no track", () => {
    install(item(), false);
    render(scene());
    expect(screen.getByRole("img", { name: "Pixel crowd resting, Strobe is paused" })).toBeTruthy();
    cleanup();
    resetPlayerStore();
    install(null);
    render(scene());
    expect(screen.getByRole("img", { name: "Pixel crowd, waiting for a track" })).toBeTruthy();
  });

  it("is as big as the club it is given, at least 232 x 130, and has more dancers on a bigger floor", () => {
    install(item());
    const { rerender } = render(scene(<CrowdScene width={232} height={130} />));
    const canvas = screen.getByRole("img") as HTMLCanvasElement;
    expect(canvas.width).toBe(232);
    expect(canvas.height).toBe(130);
    const small = h.fills.length;
    h.fills.length = 0;
    rerender(scene(<CrowdScene width={464} height={260} />));
    expect(canvas.width).toBe(464);
    expect(canvas.height).toBe(260);
    // Four times the floor: well over twice the dancers, drawn at once.
    expect(h.fills.length).toBeGreaterThan(small + 36 * 8);
    rerender(scene(<CrowdScene width={100} height={50} />));
    expect(canvas.width).toBe(232);
    expect(canvas.height).toBe(130);
  });

  it("takes className on the canvas", () => {
    install(item());
    render(scene(<CrowdScene className="mine" />));
    expect(screen.getByRole("img").className).toContain("mine");
  });

  describe("motion", () => {
    it("draws one still frame, with no loop, outside a motion provider", () => {
      install(item());
      render(<CrowdScene />);
      expect(window.requestAnimationFrame).not.toHaveBeenCalled();
      expect(h.fills.length).toBeGreaterThan(100);
    });

    it("draws a frame at once when it mounts or its size changes, so a resize never shows blank", () => {
      install(item());
      const { rerender } = render(scene(<CrowdScene width={232} height={130} />));
      expect(h.fills.length).toBeGreaterThan(100);
      h.fills.length = 0;
      rerender(scene(<CrowdScene width={400} height={200} />));
      expect(h.fills.length).toBeGreaterThan(100);
      expect(screen.getByRole("img")).toHaveProperty("height", 200);
    });

    it("runs a loop when motion is on, and draws each frame", () => {
      install(item());
      render(scene());
      expect(h.frames.size).toBe(1);
      h.fills.length = 0;
      act(() => runFrames(1100));
      expect(h.fills.length).toBeGreaterThan(100);
      expect(h.frames.size).toBe(1);
    });

    it("stays still when the system asks for reduced motion", () => {
      reducedMotion(true);
      install(item());
      render(scene());
      expect(window.requestAnimationFrame).not.toHaveBeenCalled();
      expect(h.fills.length).toBeGreaterThan(100);
    });

    it("moves under reduced motion when Motion is set to On (not following the system)", () => {
      reducedMotion(true);
      localStorage.setItem(MOTION_FOLLOW_SYSTEM_KEY, "false");
      install(item());
      render(scene());
      expect(h.frames.size).toBe(1);
    });

    it("stays still when Changing state motion is off", () => {
      localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ state: false }));
      install(item());
      render(scene());
      expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it("does not run while its page is hidden", () => {
      install(item());
      render(
        scene(
          <PageActiveContext.Provider value={false}>
            <CrowdScene />
          </PageActiveContext.Provider>,
        ),
      );
      expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it("stops while the document is hidden and starts again when shown", () => {
      install(item());
      render(scene());
      expect(h.frames.size).toBe(1);
      act(() => {
        Object.defineProperty(document, "hidden", { value: true, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(h.frames.size).toBe(0);
      act(() => {
        Object.defineProperty(document, "hidden", { value: false, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(h.frames.size).toBe(1);
    });

    it("cancels its frame on unmount", () => {
      install(item());
      const { unmount } = render(scene());
      unmount();
      expect(h.frames.size).toBe(0);
    });

    it("draws a paused crowd once and stops asking for frames", () => {
      install(item(), false);
      render(scene());
      // Drawn at once, before paint, and nothing more is asked for.
      expect(h.fills.length).toBeGreaterThan(100);
      expect(h.frames.size).toBe(0);
    });

    it("keeps going on a pause while a clip note is still showing, then stops", () => {
      install(item());
      render(scene());
      act(() => {
        h.levels?.({ rmsDb: -3, peakDb: 0, position: 30 });
        runFrames(1100);
      });
      expect(screen.getByRole("status").textContent).toBe("Clipping");
      act(() => push(snapshot(item(), false)));
      clock = 1500;
      act(() => runFrames(1500));
      expect(h.frames.size).toBe(1);
      clock = 4000;
      act(() => runFrames(4000));
      expect(h.frames.size).toBe(0);
    });
  });

  describe("levels", () => {
    it("subscribes while mounted and unsubscribes on unmount", () => {
      install(item());
      const { unmount } = render(scene());
      expect(h.subscribeLevels).toHaveBeenCalledTimes(1);
      expect(h.unsubscribeLevels).not.toHaveBeenCalled();
      unmount();
      expect(h.unsubscribeLevels).toHaveBeenCalledTimes(1);
    });

    it("copes with a bridge that has no meter", () => {
      install(item());
      const player = (window as unknown as { cuepoint: { player: { subscribeLevels?: unknown } } }).cuepoint.player;
      delete player.subscribeLevels;
      expect(() => render(scene())).not.toThrow();
    });

    it("notes clipping: covers ears, shows the warning on the booth and tells assistive technology", () => {
      install(item());
      render(scene());
      expect(screen.getByRole("status").textContent).toBe("");
      const before = h.fills.length;
      act(() => {
        h.levels?.({ rmsDb: -3, peakDb: 0, position: 30 });
        runFrames(1100);
      });
      expect(h.fills.length).toBeGreaterThan(before);
      expect(h.fills.some((f) => f.colour === "#eab308")).toBe(true);
      expect(screen.getByRole("status").textContent).toBe("Clipping");
      expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
      expect(screen.getByRole("status").className).toContain("cp-visually-hidden");
      // Two seconds later the note goes.
      clock = 3500;
      act(() => runFrames(3500));
      expect(screen.getByRole("status").textContent).toBe("");
    });

    it("ignores a reading that is over a second old by the time a frame runs", () => {
      install(item());
      render(scene());
      act(() => h.levels?.({ rmsDb: -3, peakDb: 0, position: 30 }));
      clock = 3000;
      act(() => runFrames(3000));
      expect(screen.getByRole("status").textContent).toBe("");
      expect(h.fills.some((f) => f.colour === "#eab308")).toBe(false);
    });
  });

  it("takes its colours from the theme's tokens", () => {
    install(item());
    render(scene());
    expect(h.fills.some((f) => f.colour === "#ff0000")).toBe(true);
  });
});

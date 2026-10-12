import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PlayerSnapshot,
  QueueItem,
  WaveformDetail,
  WaveformDetailState,
  WaveformTrack,
} from "../../api/cuepointBridge.types";
import { PlayerSlot } from "../player/PlayerSlot";
import { ToastProvider } from "../Toast";
import { EMPTY_AUDIO_STATE } from "../player/playerFormat";
import { resetPlayerStore } from "../player/playerStore";
import { NO_BEAT_GRID_TITLE } from "./analysisWords";
import { forgetWaveforms } from "./waveformCache";
import { resetWaveformDetailForTests, saveWaveformDetail } from "./waveformDetailSetting";

/**
 * The zoomed strip above the player (T4): there when a library track plays and
 * the setting is on, the stretched overview while the detail is made, a click
 * that seeks, and no frame scheduled unless one can be seen and is wanted.
 */

const WIDTH = 600;
const HEIGHT = 56;
/** 600 CSS pixels at the default scale of 2 are 300 columns of 16 s: 53.33 ms each. */
const MS_PER_COLUMN = 16_000 / 300;

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    trackId: 1,
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

function snapshot(
  current: QueueItem | null = item(),
  playback: Partial<PlayerSnapshot["playback"]> = {},
): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: current?.filePath ?? null,
      playing: true,
      paused: false,
      positionSeconds: 30,
      durationSeconds: 600,
      volume: 80,
      muted: false,
      ...playback,
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

function overview(grid: boolean, ready = true): WaveformTrack {
  return {
    track_id: 1,
    state: ready ? "ready" : "waiting",
    reason: null,
    duration_ms: ready ? 600_000 : null,
    loudness: null,
    data: ready ? new Uint8Array(1_200 * 4).fill(160) : null,
    marks: {
      read: true,
      cues: [],
      grid: grid ? [{ start_ms: 0, bpm: 128, meter: "4/4", beat: 1 }] : [],
    },
  };
}

function detailAnswer(state: WaveformDetailState): WaveformDetail {
  const ready = state === "ready";
  return {
    track_id: 1,
    state,
    reason: null,
    rate_hz: ready ? 75 : null,
    duration_ms: ready ? 600_000 : null,
    columns: ready ? 75 * 600 : null,
    data: ready ? new Uint8Array(75 * 600 * 4).fill(150) : null,
  };
}

interface Setup {
  detail?: WaveformDetailState;
  grid?: boolean;
  initial?: PlayerSnapshot;
}

let drawImages: number;
let clears: number;
let fills: { colour: string; rect: number[] }[];

function install({ detail = "ready", grid = true, initial = snapshot() }: Setup = {}) {
  let push: ((state: PlayerSnapshot) => void) | null = null;
  const player = {
    getState: vi.fn().mockResolvedValue(initial),
    subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
      push = onState;
      onState(initial);
      return vi.fn();
    }),
    seek: vi.fn().mockResolvedValue(undefined),
  };
  const waveforms = {
    get: vi.fn(async ({ track_ids, width }: { track_ids: number[]; width?: number }) => ({
      value: { width: width ?? null, paused: false, waveforms: track_ids.map(() => overview(grid)), unknown: [] },
      refusal: null,
    })),
    request: vi.fn().mockResolvedValue({ value: { requested: [], job_id: "job" }, refusal: null }),
    analysis: vi.fn().mockResolvedValue({ value: null, refusal: { code: "x", message: "x" } }),
    detail: vi.fn(async () => ({ value: detailAnswer(detail), refusal: null })),
    requestDetail: vi.fn().mockResolvedValue({ value: { track_id: 1, state: "working" }, refusal: null }),
  };
  window.cuepoint = { player, waveforms } as unknown as typeof window.cuepoint;
  return { player, waveforms, push: (state: PlayerSnapshot) => act(() => push?.(state)) };
}

/** The slot reports player notices, so it needs the toast stack. */
function Slot() {
  return (
    <ToastProvider>
      <PlayerSlot />
    </ToastProvider>
  );
}

const strip = () => screen.getByTestId("waveform-detail-strip");

beforeEach(() => {
  resetPlayerStore();
  forgetWaveforms();
  resetWaveformDetailForTests();
  localStorage.clear();
  drawImages = 0;
  clears = 0;
  fills = [];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: WIDTH,
    height: HEIGHT,
    left: 0,
    top: 0,
  } as DOMRect);
  // Each canvas has its own context, and only the strip's own is counted: the
  // bar's waveform is painted beside it, in tasks of its own.
  const contexts = new WeakMap<HTMLCanvasElement, unknown>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const counted = this.classList.contains("cp-detail-strip__canvas");
    if (!contexts.has(this)) {
      contexts.set(this, {
        fillStyle: "",
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        clearRect: () => {
          if (!counted) return;
          clears += 1;
          fills = [];
        },
        fillRect(this: { fillStyle: string }, x: number, y: number, w: number, h: number) {
          if (counted) fills.push({ colour: String(this.fillStyle), rect: [x, y, w, h] });
        },
        drawImage: () => {
          if (counted) drawImages += 1;
        },
      });
    }
    return contexts.get(this) as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () => ({ getPropertyValue: (name: string) => (name === "--waveform-played" ? "#222222" : "#123456") }) as CSSStyleDeclaration,
  );
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  resetPlayerStore();
  forgetWaveforms();
  localStorage.clear();
  document.documentElement.removeAttribute("data-motion-scroll");
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("where the strip is", () => {
  it("sits between the queue and the bar while a library track plays", async () => {
    install();
    render(<Slot />);
    const bar = await screen.findByRole("slider", { name: "Seek" });
    const found = await screen.findByTestId("waveform-detail-strip");
    expect(found.nextElementSibling).toBe(bar.closest(".cp-player-bar"));
    expect(found.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is not there for a track that is not in the library", async () => {
    install({ initial: snapshot(item({ trackId: null })) });
    render(<Slot />);
    await screen.findByRole("slider", { name: "Seek" });
    expect(screen.queryByTestId("waveform-detail-strip")).toBeNull();
  });

  it("is not there with the setting off, and is there again when it is switched on", async () => {
    saveWaveformDetail(false);
    install();
    render(<Slot />);
    await screen.findByRole("slider", { name: "Seek" });
    expect(screen.queryByTestId("waveform-detail-strip")).toBeNull();
    act(() => saveWaveformDetail(true));
    expect(await screen.findByTestId("waveform-detail-strip")).toBeTruthy();
  });
});

describe("what it draws", () => {
  it("draws the ready detail, the played half dimmed and the playhead in the middle", async () => {
    const { waveforms } = install({ detail: "ready" });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    expect(strip().getAttribute("data-detail")).toBe("ready");
    await waitFor(() => expect(drawImages).toBeGreaterThan(0));
    // 300 columns of 2 pixels: the middle is at 300, a column wide.
    const rects = fills.slice(-2);
    expect(rects[0]).toEqual({ colour: "#222222", rect: [0, 0, 300, 56] });
    expect(rects[1]!.rect).toEqual([300, 0, 2, 56]);
    // Nothing coarse is read once the detail is there.
    expect(waveforms.requestDetail).not.toHaveBeenCalled();
  });

  it("draws the overview stretched while the detail is made, then the detail", async () => {
    let state: WaveformDetailState = "waiting";
    const { waveforms } = install();
    waveforms.detail.mockImplementation(async () => ({ value: detailAnswer(state), refusal: null }));
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("overview"));
    expect(waveforms.requestDetail).toHaveBeenCalledWith({ track_id: 1 });
    expect(drawImages).toBeGreaterThan(0);
    expect(waveforms.get).toHaveBeenCalledWith(expect.objectContaining({ track_ids: [1], width: 1200 }));

    state = "ready";
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"), { timeout: 3_000 });
  });

  it("says so over an empty strip when there is nothing to draw", async () => {
    const { waveforms } = install({ detail: "missing" });
    waveforms.get.mockImplementation(async ({ track_ids }) => ({
      value: {
        width: null,
        paused: false,
        waveforms: track_ids.map(() => ({ ...overview(true, false), state: "missing" as const })),
        unknown: [],
      },
      refusal: null,
    }));
    render(<Slot />);
    expect(await screen.findByText("File missing")).toBeTruthy();
    expect(strip().getAttribute("data-source")).toBe("none");
  });
});

describe("the beat grid", () => {
  it("says where grids come from over a track without one", async () => {
    install({ grid: false });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("title")).toBe(NO_BEAT_GRID_TITLE));
    expect(NO_BEAT_GRID_TITLE).toBe("No beat grid: grids come from Rekordbox");
    expect(strip().getAttribute("data-grid")).toBe("none");
  });

  it("has no such title over a track with Rekordbox's grid", async () => {
    install({ grid: true });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-grid")).toBe("rekordbox"));
    expect(strip().getAttribute("title")).not.toBe(NO_BEAT_GRID_TITLE);
  });

  it("reads the marks without a picture", async () => {
    const { waveforms } = install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-grid")).toBe("rekordbox"));
    expect(waveforms.get).toHaveBeenCalledWith({ track_ids: [1], data: false, marks: true });
  });
});

describe("a click", () => {
  it("seeks to the time under it, the middle being the playhead", async () => {
    const { player } = install({ initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    // Column 200 of 300 is 50 columns after the middle one (the 150th).
    fireEvent.click(strip(), { clientX: 400 });
    expect(player.seek).toHaveBeenCalledTimes(1);
    const seconds = player.seek.mock.calls[0]![0] as number;
    expect(seconds).toBeCloseTo((30_000 + 50 * MS_PER_COLUMN) / 1000, 3);
  });

  it("catches a seek that is rejected", async () => {
    const { player } = install({ initial: snapshot(item(), { playing: false, paused: true }) });
    const caught = vi.fn();
    player.seek.mockImplementation(() => {
      const rejected = Promise.reject(new Error("no player"));
      const original = rejected.catch.bind(rejected);
      rejected.catch = ((handler: never) => (caught(), original(handler))) as typeof rejected.catch;
      return rejected;
    });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    fireEvent.click(strip(), { clientX: 400 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(player.seek).toHaveBeenCalledTimes(1);
    // Caught here: a rejection nothing handles fails the whole run.
    expect(caught).toHaveBeenCalled();
  });

  it("seeks to the right time at a pixel ratio of 2 and a scale above 1", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { player } = install({ initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    // The default scale 1.5 at a ratio of 2 is a unit of 3 device pixels: 1200 / 3 = 400
    // columns of 40 ms. A click at 400 CSS pixels is device pixel 800, column 266; the
    // middle is column 200, so it is 66 columns (2.64 s) after the playhead.
    fireEvent.click(strip(), { clientX: 400 });
    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(player.seek.mock.calls[0]![0] as number).toBeCloseTo(30 + 66 * 0.04, 3);
    vi.unstubAllGlobals();
  });

  it("never seeks before the start", async () => {
    const { player } = install({ initial: snapshot(item(), { playing: false, paused: true, positionSeconds: 1 }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    fireEvent.click(strip(), { clientX: 0 });
    expect(player.seek).toHaveBeenCalledWith(0);
  });
});

describe("frames", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    document.documentElement.setAttribute("data-motion-scroll", "on");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules none while paused", async () => {
    install({ initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("runs one a frame while playing, and stops when the player pauses", async () => {
    const { push } = install();
    render(<Slot />);
    await waitFor(() => expect(window.requestAnimationFrame).toHaveBeenCalled());
    const before = clears;
    act(() => frames.shift()!(0));
    expect(clears).toBeGreaterThan(before);
    expect(frames.length).toBe(1);

    await push(snapshot(item(), { playing: false, paused: true }));
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    const scheduled = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(scheduled);
  });

  it("schedules none while the document is hidden", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("stops when the document is hidden, and starts again when it is shown", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    install();
    render(<Slot />);
    await waitFor(() => expect(window.requestAnimationFrame).toHaveBeenCalled());
    hidden.mockReturnValue(true);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    const scheduled = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    hidden.mockReturnValue(false);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(scheduled);
  });

  it("is not moved by the other motion switches", async () => {
    document.documentElement.removeAttribute("data-motion-scroll");
    document.documentElement.setAttribute("data-motion-state", "on");
    install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    document.documentElement.removeAttribute("data-motion-state");
  });

  it("starts when the scroll switch is turned on, and stops when it is turned off", async () => {
    document.documentElement.removeAttribute("data-motion-scroll");
    install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    document.documentElement.setAttribute("data-motion-scroll", "on");
    await waitFor(() => expect(window.requestAnimationFrame).toHaveBeenCalled());
    document.documentElement.removeAttribute("data-motion-scroll");
    await waitFor(() => expect(window.cancelAnimationFrame).toHaveBeenCalled());
  });

  it("cancels its frame when it unmounts", async () => {
    install();
    render(<Slot />);
    await waitFor(() => expect(window.requestAnimationFrame).toHaveBeenCalled());
    const cancelled = (window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    cleanup();
    expect((window.cancelAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(cancelled);
    const scheduled = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(scheduled);
  });

  it("does not redraw on a snapshot while the document is hidden", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const { push } = install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    hidden.mockReturnValue(true);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    const before = clears;
    await push(snapshot(item(), { positionSeconds: 31 }));
    expect(clears).toBe(before);
    hidden.mockReturnValue(false);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(clears).toBeGreaterThan(before);
  });

  it("under reduced motion schedules none, and draws again only on a snapshot", async () => {
    document.documentElement.removeAttribute("data-motion-scroll");
    const { push } = install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    const before = clears;
    await push(snapshot(item(), { positionSeconds: 30.25 }));
    expect(clears).toBeGreaterThan(before);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});

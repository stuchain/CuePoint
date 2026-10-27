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
import { NO_BEAT_GRID_TITLE, zoomHint } from "./analysisWords";
import { PAUSE_BLEND_MS } from "./playheadClock";
import { forgetWaveforms } from "./waveformCache";
import {
  resetWaveformDetailForTests,
  resetWaveformDetailSpanForTests,
  saveWaveformDetail,
} from "./waveformDetailSetting";

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
/** The opacity each tile of the strip was drawn at. */
let alphas: number[];
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
  resetWaveformDetailSpanForTests();
  localStorage.clear();
  drawImages = 0;
  alphas = [];
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
        drawImage(this: { globalAlpha: number }) {
          if (!counted) return;
          drawImages += 1;
          alphas.push(this.globalAlpha);
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
  document.documentElement.removeAttribute("data-motion-state");
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("where the strip is", () => {
  it("sits just above the bar while a library track plays", async () => {
    install();
    render(<Slot />);
    const bar = await screen.findByRole("slider", { name: "Seek" });
    const found = await screen.findByTestId("waveform-detail-strip");
    // The strip is in its Hint, which is the bar's sibling.
    expect(found.parentElement?.classList.contains("cp-hint")).toBe(true);
    expect(found.parentElement?.nextElementSibling).toBe(bar.closest(".cp-player-bar"));
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
    await waitFor(() => expect(strip().getAttribute("title")).toBe(zoomHint(16_000, true)));
    expect(NO_BEAT_GRID_TITLE).toBe("No beat grid: grids come from Rekordbox");
    expect(strip().getAttribute("data-grid")).toBe("none");
  });

  it("has no such title over a track with Rekordbox's grid", async () => {
    install({ grid: true });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-grid")).toBe("rekordbox"));
    expect(strip().getAttribute("title")).toBe("Click to seek · Scroll to zoom · 16 s");
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

describe("playing or paused (R4-11)", () => {
  it("follows the store: true while playing, false once paused, true again on play", async () => {
    const { push } = install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    expect(strip().getAttribute("data-playing")).toBe("true");
    await push(snapshot(item(), { playing: false, paused: true }));
    expect(strip().getAttribute("data-playing")).toBe("false");
    await push(snapshot());
    expect(strip().getAttribute("data-playing")).toBe("true");
  });
});

describe("the wheel", () => {
  /** A wheel event that can be cancelled, as the browser's is. */
  let clock = 0;
  beforeEach(() => {
    clock = 0;
    // Each event a gesture of its own unless a test says otherwise.
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  function wheel(deltaY: number, init: WheelEventInit & { gap?: number } = {}): WheelEvent {
    clock += init.gap ?? 1_000;
    const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true, ...init });
    act(() => {
      strip().dispatchEvent(event);
    });
    return event;
  }
  const span = () => strip().getAttribute("data-span-ms");

  it("starts at 16 s, and a notch up zooms in a stop and down zooms out, the page staying put", async () => {
    install({ initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    expect(span()).toBe("16000");
    expect(wheel(-100).defaultPrevented).toBe(true);
    expect(span()).toBe("12000");
    wheel(100);
    wheel(100);
    expect(span()).toBe("24000");
    expect(localStorage.getItem("cuepoint-waveform-detail-span")).toBe("24000");
  });

  it("stops at 4 s and 64 s, and treats a pinch as a wheel", async () => {
    install({ initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    for (let i = 0; i < 10; i += 1) wheel(-100);
    expect(span()).toBe("4000");
    for (let i = 0; i < 12; i += 1) wheel(100, { ctrlKey: true });
    expect(span()).toBe("64000");
  });

  it("builds trackpad pixels up and ignores sideways scrolling", async () => {
    install({ initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    // A small first delta is a whole stop; the rest of the gesture builds up (after the settle).
    wheel(40);
    expect(span()).toBe("24000");
    wheel(40, { gap: 150 });
    wheel(40, { gap: 20 });
    expect(span()).toBe("24000");
    wheel(40, { gap: 20 });
    expect(span()).toBe("32000");
    wheel(0, { deltaX: 500 });
    expect(span()).toBe("32000");
  });

  it("seeks at the new scale after zooming, the playhead staying in the middle", async () => {
    const { player } = install({ initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    wheel(-100);
    wheel(-100);
    expect(span()).toBe("8000");
    fireEvent.click(strip(), { clientX: 400 });
    // 8 s over 300 columns, 50 columns after the middle one.
    expect(player.seek.mock.calls[0]![0] as number).toBeCloseTo((30_000 + 50 * (8_000 / 300)) / 1000, 3);
  });

  it("keeps the tip above the strip, in words that follow the span, with no title of its own", async () => {
    install({ initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    expect(strip().getAttribute("title")).toBe("Click to seek · Scroll to zoom · 16 s");
    fireEvent.pointerEnter(strip().parentElement!);
    // Hovered, Hint takes the title off so the browser's tip never doubles the themed one.
    expect(strip().hasAttribute("title")).toBe(false);
    wheel(100);
    fireEvent.pointerLeave(strip().parentElement!);
    expect(strip().getAttribute("title")).toBe(zoomHint(24_000, false));
  });

  it("remembers the span for the next strip", async () => {
    localStorage.setItem("cuepoint-waveform-detail-span", "32000");
    install({ initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(span()).toBe("32000"));
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

  it("runs one a frame while playing, and stops when the player pauses on the drawn spot", async () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
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

  it("keeps drawing for the glide after a pause, then stops", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const { push } = install();
    render(<Slot />);
    await waitFor(() => expect(window.requestAnimationFrame).toHaveBeenCalled());
    const scheduled = () => (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    now.mockReturnValue(1_250);
    const beforePause = scheduled();
    // Drawn 30.25 s; the player stopped at 30.15 s.
    await push(snapshot(item(), { playing: false, paused: true, positionSeconds: 30.15 }));
    const afterPause = scheduled();
    expect(afterPause).toBeGreaterThan(beforePause);
    act(() => frames.pop()!(0));
    expect(scheduled()).toBeGreaterThan(afterPause);
    now.mockReturnValue(1_250 + PAUSE_BLEND_MS + 1);
    act(() => frames.pop()!(0));
    const settled = scheduled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scheduled()).toBe(settled);
  });

  // M376: reduced motion no longer holds the playhead between snapshots; the stop is reached by the short glide.
  it("under reduced motion still lands a click on the true stop", async () => {
    document.documentElement.removeAttribute("data-motion-scroll");
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const { push, player } = install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    now.mockReturnValue(1_200);
    await push(snapshot(item(), { playing: false, paused: true, positionSeconds: 30.1 }));
    now.mockReturnValue(1_250);
    fireEvent.click(strip(), { clientX: 300 });
    expect(player.seek.mock.calls[0]![0] as number).toBeCloseTo(30.1, 1);
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

  it("runs a frame while playing whatever the motion switches say (M376)", async () => {
    document.documentElement.removeAttribute("data-motion-scroll");
    document.documentElement.removeAttribute("data-motion-state");
    install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    await waitFor(() => expect(window.requestAnimationFrame).toHaveBeenCalled());
  });

  it("is not stopped by turning the scroll switch off, nor started by turning it on (M376)", async () => {
    document.documentElement.removeAttribute("data-motion-scroll");
    install();
    render(<Slot />);
    await waitFor(() => expect(window.requestAnimationFrame).toHaveBeenCalled());
    const scheduled = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    document.documentElement.setAttribute("data-motion-scroll", "on");
    document.documentElement.removeAttribute("data-motion-scroll");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.cancelAnimationFrame).not.toHaveBeenCalled();
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(scheduled);
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

  it("under reduced motion extrapolates between snapshots too, and draws on a snapshot (M376)", async () => {
    document.documentElement.removeAttribute("data-motion-scroll");
    const { push } = install();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    await waitFor(() => expect(window.requestAnimationFrame).toHaveBeenCalled());
    const before = clears;
    await push(snapshot(item(), { positionSeconds: 30.25 }));
    expect(clears).toBeGreaterThan(before);
  });
});

describe("the stand-in", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  function whileMade() {
    let state: WaveformDetailState = "waiting";
    const handles = install({ initial: snapshot(item(), { playing: false, paused: true }) });
    handles.waveforms.detail.mockImplementation(async () => ({ value: detailAnswer(state), refusal: null }));
    return { ...handles, finish: () => (state = "ready") };
  }

  it("is drawn whole, not faded, before the detail arrives", async () => {
    whileMade();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("overview"));
    await waitFor(() => expect(drawImages).toBeGreaterThan(0));
    // Drawn whole, not faded, and nothing fades before the detail arrives.
    expect(alphas.every((a) => a === 1)).toBe(true);
    expect(strip().getAttribute("data-fading")).toBeNull();
  });

  it("cross-fades to the detail over 150 ms when it arrives, then draws it alone", async () => {
    document.documentElement.setAttribute("data-motion-state", "on");
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const { finish } = whileMade();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("overview"));
    await waitFor(() => expect(drawImages).toBeGreaterThan(0));
    alphas = [];
    finish();
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"), { timeout: 3_000 });
    expect(strip().getAttribute("data-fading")).toBe("true");
    // Both are drawn at the start: the stand-in fully, the detail not at all yet.
    expect(alphas).toContain(1);
    expect(alphas).toContain(0);

    now.mockReturnValue(1_075);
    alphas = [];
    act(() => frames.splice(0).forEach((frame) => frame(0)));
    expect(alphas.some((a) => a > 0.4 && a < 0.6)).toBe(true);
    expect(strip().getAttribute("data-fading")).toBe("true");

    now.mockReturnValue(1_150);
    alphas = [];
    act(() => frames.splice(0).forEach((frame) => frame(0)));
    await waitFor(() => expect(strip().getAttribute("data-fading")).toBeNull());
    expect(alphas.length).toBeGreaterThan(0);
    expect(alphas.every((a) => a === 1)).toBe(true);
    // And no frame is left scheduled for a paused strip.
    expect(frames).toHaveLength(0);
  });

  it("switches at once when State changes motion is off, even with Scrolling on", async () => {
    document.documentElement.setAttribute("data-motion-scroll", "on");
    const { finish } = whileMade();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("overview"));
    await waitFor(() => expect(drawImages).toBeGreaterThan(0));
    alphas = [];
    finish();
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"), { timeout: 3_000 });
    expect(strip().getAttribute("data-fading")).toBeNull();
    expect(alphas.length).toBeGreaterThan(0);
    expect(alphas.every((a) => a === 1)).toBe(true);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("does not fade when the detail was there from the start", async () => {
    document.documentElement.setAttribute("data-motion-state", "on");
    install({ detail: "ready", initial: snapshot(item(), { playing: false, paused: true }) });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    await waitFor(() => expect(drawImages).toBeGreaterThan(0));
    expect(strip().getAttribute("data-fading")).toBeNull();
    expect(alphas.every((a) => a === 1)).toBe(true);
  });

  it("notes how long the stand-in was drawn when the detail replaces it, and not when it never was", async () => {
    const mark = vi.spyOn(performance, "mark");
    const { finish } = whileMade();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("overview"));
    expect(mark).not.toHaveBeenCalledWith(expect.stringContaining("standin"), expect.anything());
    finish();
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"), { timeout: 3_000 });
    // The mark is noted in an effect that React may run after the DOM shows the detail.
    await waitFor(() =>
      expect(mark).toHaveBeenCalledWith("cp-waveform:standin:replaced", { detail: { ms: expect.any(Number) } }),
    );
  });

  it("notes nothing when the detail is ready before anything is drawn", async () => {
    const mark = vi.spyOn(performance, "mark");
    install({ detail: "ready" });
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"));
    expect(mark).not.toHaveBeenCalledWith(expect.stringContaining("standin"), expect.anything());
  });

  it("fades with State changes on and Scrolling off", async () => {
    document.documentElement.setAttribute("data-motion-state", "on");
    const { finish } = whileMade();
    render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("overview"));
    await waitFor(() => expect(drawImages).toBeGreaterThan(0));
    finish();
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("detail"), { timeout: 3_000 });
    expect(strip().getAttribute("data-fading")).toBe("true");
  });

  it("notes the stand-in as left when the strip goes before the detail arrives", async () => {
    const mark = vi.spyOn(performance, "mark");
    whileMade();
    const view = render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-source")).toBe("overview"));
    view.unmount();
    expect(mark).toHaveBeenCalledWith("cp-waveform:standin:left", { detail: { ms: expect.any(Number) } });
  });

  it("times nothing when the detail will not come (the file is missing)", async () => {
    const mark = vi.spyOn(performance, "mark");
    const { waveforms } = install({ detail: "missing" });
    waveforms.get.mockImplementation(async ({ track_ids }) => ({
      value: { width: 1200, paused: false, waveforms: track_ids.map(() => overview(true)), unknown: [] },
      refusal: null,
    }));
    const view = render(<Slot />);
    await waitFor(() => expect(strip().getAttribute("data-detail")).toBe("missing"));
    view.unmount();
    expect(mark).not.toHaveBeenCalledWith(expect.stringContaining("standin"), expect.anything());
  });
});

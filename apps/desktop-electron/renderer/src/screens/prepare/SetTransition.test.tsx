import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SetEntry,
  TrackCue,
  WaveformLoudness,
  WaveformTrack,
  WaveformTrackState,
  WaveformsQuery,
} from "../../api/cuepointBridge.types";
import { ROW_HEIGHT_FALLBACK, readRowHeight } from "../../components/table/trackTableLayout";
import { forgetWaveforms } from "../../components/waveform/waveformCache";
import { SetTransition } from "./SetTransition";
import { END_OF_SET, NO_SELECTION_WORDS } from "./transitionStrip";

/**
 * The transition strip (WAVE-07, DEC-120): the selected entry's waveform beside
 * the next one's, each with its cues and its planned times shaded and in
 * words; the words between them; the last entry; nothing selected; a click
 * selecting a half's entry; and both tracks put first in the analysis while
 * they wait.
 */

/** Each half's box: 300 CSS pixels, 150 columns at the default scale of 2. */
const WIDTH = 300;
const COLUMNS = 150;

const PLAYED = "#222222";

const HOT_CUE: TrackCue = { kind: "cue", hot_cue: 0, start_ms: 3_000, end_ms: null, name: "Drop", color: "#ff0000" };

function entry(entryId: number, trackId: number, title: string, inSeconds: number | null, outSeconds: number | null): SetEntry {
  return {
    entry_id: entryId,
    track_id: trackId,
    position: entryId - 1,
    chapter_id: 1,
    in_seconds: inSeconds,
    out_seconds: outSeconds,
    note: null,
    planned_seconds: null,
    starts_at: null,
    length_seconds: null,
    track: { id: trackId, title } as SetEntry["track"],
  };
}

// Six-second tracks: Intro out at 0:04, Build in at 0:01 and out at 0:05, a
// repeat of Intro with no times, then Close in at 0:02.
const ENTRIES = [
  entry(1, 10, "Intro", null, 4),
  entry(2, 20, "Build", 1, 5),
  entry(3, 10, "Intro", null, null),
  entry(4, 40, "Close", 2, null),
];

function waveform(
  trackId: number,
  state: WaveformTrackState = "ready",
  overrides: Partial<WaveformTrack> = {},
): WaveformTrack {
  return {
    track_id: trackId,
    state,
    reason: null,
    duration_ms: state === "ready" ? 6_000 : null,
    loudness: state === "ready" ? { integrated_lufs: -8.4, peak_dbfs: -0.3, reason: null } : null,
    data: state === "ready" ? new Uint8Array(160 * 4).fill(160) : null,
    marks: { read: true, cues: [HOT_CUE], grid: [] },
    ...overrides,
  };
}

function install(answer: (id: number) => WaveformTrack = (id) => waveform(id)) {
  const waveforms = {
    get: vi.fn(async ({ track_ids, width }: WaveformsQuery) => ({
      value: { width: width ?? null, paused: false, waveforms: track_ids.map(answer), unknown: [] },
      refusal: null,
    })),
    request: vi.fn().mockResolvedValue({ value: { requested: [], job_id: "job" }, refusal: null }),
    analysis: vi.fn().mockResolvedValue({ value: null, refusal: { code: "x", message: "x" } }),
  };
  window.cuepoint = { waveforms } as unknown as typeof window.cuepoint;
  return waveforms;
}

/** What was filled on each canvas, by the half that holds it. */
let fills: Map<HTMLCanvasElement, { colour: string; rect: number[] }[]>;

function fillsOf(side: "from" | "to") {
  const canvas = screen.getByTestId(`transition-${side}`).querySelector("canvas")!;
  return fills.get(canvas) ?? [];
}

async function drawn(...sides: ("from" | "to")[]) {
  for (const side of sides) {
    await waitFor(() => expect(screen.getByTestId(`transition-${side}`).querySelector("canvas")).not.toBeNull());
    await waitFor(() => expect(fillsOf(side).length).toBeGreaterThan(0));
  }
}

const unit = () => 2 * (window.devicePixelRatio || 1);

/** A 2D context that records what is filled on `canvas`. */
function contextFor(canvas: HTMLCanvasElement) {
  const context = {
    fillStyle: "",
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect: () => {
      fills.set(canvas, []);
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      fills.get(canvas)!.push({ colour: String(context.fillStyle), rect: [x, y, w, h] });
    },
  };
  return context as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  forgetWaveforms();
  fills = new Map();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: WIDTH,
    height: 132,
    left: 0,
    top: 0,
  } as DOMRect);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return contextFor(this);
  } as never);
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => (name === "--waveform-played" ? PLAYED : "#123456"),
      }) as CSSStyleDeclaration,
  );
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  forgetWaveforms();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("the transition strip", () => {
  it("draws the selected entry beside the next, both with their cues, asked for in one batch", async () => {
    const waveforms = install();
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);
    await drawn("from", "to");

    // The pictures, and the two tracks' loudness without them (WAVE-08).
    expect(waveforms.get).toHaveBeenCalledTimes(2);
    expect(waveforms.get).toHaveBeenCalledWith({ track_ids: [10, 20], width: 160, marks: true });
    expect(waveforms.get).toHaveBeenCalledWith({ track_ids: [10, 20], marks: false, data: false });
    // The hot cue at 3 s of 6, in its own colour: column 75 of 150, in both.
    for (const side of ["from", "to"] as const) {
      const cue = fillsOf(side).find((fill) => fill.colour === "#ff0000")!;
      expect(cue.rect[0]).toBe((COLUMNS / 2) * unit());
    }
  });

  it("titles each half with its planned times, and says the transition between them", async () => {
    install();
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);
    const strip = screen.getByRole("region", { name: "Transition" });

    expect(within(strip).getByText("Intro")).toBeInTheDocument();
    expect(within(strip).getByText("In 0:00 · Out 0:04")).toBeInTheDocument();
    expect(within(strip).getByText("Build")).toBeInTheDocument();
    expect(within(strip).getByText("In 0:01 · Out 0:05")).toBeInTheDocument();
    expect(screen.getByTestId("transition-words")).toHaveTextContent("Out 0:04 → In 0:01");
    expect(screen.getByRole("button", { name: "Intro, In 0:00 · Out 0:04" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build, In 0:01 · Out 0:05" })).toBeInTheDocument();
    await drawn("from", "to");
  });

  it("shades each half before its planned in and after its planned out", async () => {
    install();
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);
    await drawn("from", "to");

    const shaded = (side: "from" | "to") =>
      fillsOf(side)
        .filter((fill) => fill.colour === PLAYED)
        .map((fill) => [fill.rect[0], fill.rect[2]]);
    // Intro: in at the start, nothing before it; out at 4 s, columns 100 to 150 shaded.
    expect(shaded("from")).toEqual([[100 * unit(), 50 * unit()]]);
    // Build: in at 1 s, columns 0 to 25; out at 5 s, columns 125 to 150.
    expect(shaded("to")).toEqual([
      [0, 25 * unit()],
      [125 * unit(), 25 * unit()],
    ]);
  });

  it("says untimed for an entry with no times, and shades nothing on it", async () => {
    install();
    render(<SetTransition entries={ENTRIES} selectedEntryId={2} onSelect={vi.fn()} />);
    await drawn("from", "to");

    expect(screen.getByTestId("transition-words")).toHaveTextContent("Out 0:05 → untimed");
    expect(within(screen.getByRole("region", { name: "Transition" })).getByText("Untimed")).toBeInTheDocument();
    expect(fillsOf("to").some((fill) => fill.colour === PLAYED)).toBe(false);
  });

  it("reads End of Set in the second half for the last entry, and asks for one track", async () => {
    const waveforms = install();
    render(<SetTransition entries={ENTRIES} selectedEntryId={4} onSelect={vi.fn()} />);
    await drawn("from");

    expect(screen.getByTestId("transition-to")).toHaveTextContent(END_OF_SET);
    expect(screen.getByTestId("transition-to").tagName).toBe("P");
    expect(screen.getByTestId("transition-words")).toHaveTextContent(/^Untimed$/);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(waveforms.get).toHaveBeenCalledWith({ track_ids: [40], width: 160, marks: true });
  });

  it("is one of the Set table's rows of titles and two of waveform", () => {
    install();
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);
    // jsdom has no stylesheet, so the table and the strip both read the fallback.
    expect(readRowHeight()).toBe(ROW_HEIGHT_FALLBACK);
    expect(screen.getByRole("region", { name: "Transition" }).style.gridTemplateRows).toBe(
      `${ROW_HEIGHT_FALLBACK}px ${ROW_HEIGHT_FALLBACK * 2}px`,
    );
  });

  it("says what to do with nothing selected, and asks for nothing", async () => {
    const waveforms = install();
    render(<SetTransition entries={ENTRIES} selectedEntryId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("region", { name: "Transition" })).toHaveTextContent(NO_SELECTION_WORDS);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(waveforms.get).not.toHaveBeenCalled();
  });

  it("selects a half's entry when it is clicked, a repeat included", async () => {
    install();
    const onSelect = vi.fn();
    render(<SetTransition entries={ENTRIES} selectedEntryId={2} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId("transition-to"));
    expect(onSelect).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByTestId("transition-from"));
    expect(onSelect).toHaveBeenLastCalledWith(2);
    await drawn("from", "to");
  });

  it("follows the selection: the next entry's half becomes the first", async () => {
    install();
    const { rerender } = render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);
    await drawn("from", "to");
    rerender(<SetTransition entries={ENTRIES} selectedEntryId={2} onSelect={vi.fn()} />);

    expect(screen.getByTestId("transition-from")).toHaveAttribute("data-entry", "2");
    expect(screen.getByTestId("transition-to")).toHaveAttribute("data-entry", "3");
    expect(screen.getByTestId("transition-words")).toHaveTextContent("Out 0:05 → untimed");
    await drawn("from", "to");
  });

  it("puts both tracks first in the analysis while they wait, and asks nothing for analysed ones", async () => {
    const waiting = install((id) => waveform(id, "waiting"));
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);
    await waitFor(() => expect(waiting.request).toHaveBeenCalledTimes(2));
    expect(waiting.request.mock.calls.map(([params]) => params.track_ids)).toEqual([[10], [20]]);
    cleanup();
    forgetWaveforms();

    const ready = install();
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);
    await drawn("from", "to");
    expect(ready.request).not.toHaveBeenCalled();
  });

  it("says in words why a half has no picture", async () => {
    install((id) => (id === 20 ? waveform(id, "missing") : waveform(id, "waiting")));
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("transition-to")).toHaveTextContent("File missing"));
    expect(screen.getByTestId("transition-from")).toHaveTextContent("Waveform not drawn yet");
    expect(screen.getByTestId("transition-to")).toHaveAttribute("title", "File missing");
    // The times are said whether or not there is a picture.
    expect(screen.getByTestId("transition-words")).toHaveTextContent("Out 0:04 → In 0:01");
  });
});

describe("the strip's loudness (WAVE-08)", () => {
  const measured = (lufs: number): WaveformLoudness => ({ integrated_lufs: lufs, peak_dbfs: -0.3, reason: null });

  it("ends each title with its track's loudness, and says how far apart the two sit", async () => {
    install((id) => waveform(id, "ready", { loudness: measured(id === 10 ? -10.5 : -8.4) }));
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("transition-words")).toHaveTextContent("+2.1 LU"));
    expect(screen.getByTestId("transition-words")).toHaveTextContent(/^Out 0:04 → In 0:01 · \+2\.1 LU$/);
    const titles = screen.getAllByTestId("transition-loudness").map((each) => each.textContent);
    expect(titles).toEqual([" · −10.5 LUFS", " · −8.4 LUFS"]);
    expect(screen.getByText("Intro").parentElement).toHaveAttribute(
      "title",
      "Intro, In 0:00 · Out 0:04 · −10.5 LUFS",
    );
    await drawn("from", "to");
  });

  it("says no difference unless both are measured, and no loudness for a track without a value", async () => {
    install((id) =>
      waveform(id, "ready", {
        loudness: id === 10 ? measured(-9) : { integrated_lufs: null, peak_dbfs: -40, reason: "too_quiet" },
      }),
    );
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByTestId("transition-loudness")).toHaveLength(1));
    expect(screen.getByTestId("transition-words")).toHaveTextContent(/^Out 0:04 → In 0:01$/);
    await drawn("from", "to");
  });

  it("says no difference for the last entry, which has no next", async () => {
    install();
    render(<SetTransition entries={ENTRIES} selectedEntryId={4} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByTestId("transition-loudness")).toHaveLength(1));
    expect(screen.getByTestId("transition-words")).toHaveTextContent(/^Untimed$/);
    await drawn("from");
  });

  it("puts a track whose loudness is still to be measured first in the analysis", async () => {
    const waveforms = install((id) => waveform(id, "ready", { loudness: id === 20 ? null : measured(-8) }));
    render(<SetTransition entries={ENTRIES} selectedEntryId={1} onSelect={vi.fn()} />);

    await waitFor(() => expect(waveforms.request).toHaveBeenCalledWith({ track_ids: [20] }));
    expect(waveforms.request).toHaveBeenCalledTimes(1);
    await drawn("from", "to");
  });
});

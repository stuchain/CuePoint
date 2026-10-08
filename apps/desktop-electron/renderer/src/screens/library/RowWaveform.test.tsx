import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryTrackRow, WaveformTrack, WaveformTrackState } from "../../api/cuepointBridge.types";
import { DECODER_MISSING_WORDS } from "../../components/waveform/analysisWords";
import { forgetWaveforms } from "../../components/waveform/waveformCache";
import { SETTLE_MS } from "../../components/waveform/waveformSettle";
import { RowWaveform } from "./libraryCells";
import { DEFAULT_VISIBLE_COLUMNS, LIBRARY_COLUMNS } from "./libraryColumns";

/**
 * The Library's "Waveform" column (WAVE-06): declared hidden, unsortable and
 * without text; each row asks at the cell's columns rounded up to 16, only once
 * it has been on screen for 100 ms, and never puts a track first in the
 * analysis. A cell without a picture shows one muted word.
 */

function row(id: number | null): LibraryTrackRow {
  return { id, title: `Track ${id}`, artist: "Artist", file_path: `/music/${id}.flac` } as LibraryTrackRow;
}

function waveform(trackId: number, state: WaveformTrackState = "ready", reason: string | null = null): WaveformTrack {
  return {
    track_id: trackId,
    state,
    reason,
    duration_ms: state === "ready" ? 6_000 : null,
    loudness: state === "ready" ? { integrated_lufs: -8.4, peak_dbfs: -0.3, reason: null } : null,
    data: state === "ready" ? new Uint8Array(64 * 4).fill(100) : null,
    marks: null,
  };
}

let cellWidth = 120;

function install(answer: (id: number) => WaveformTrack = (id) => waveform(id), paused = false) {
  const waveforms = {
    get: vi.fn(async ({ track_ids, width }: { track_ids: number[]; width: number }) => ({
      value: { width, paused, waveforms: track_ids.map(answer), unknown: [] },
      refusal: null,
    })),
    request: vi.fn().mockResolvedValue({ value: { requested: [], job_id: "job" }, refusal: null }),
    analysis: vi.fn().mockResolvedValue({
      value: { state: "running", analysed: 0, failed: 0 },
      refusal: null,
    }),
  };
  window.cuepoint = { waveforms } as unknown as typeof window.cuepoint;
  return waveforms;
}

function Rows({ ids }: { ids: (number | null)[] }) {
  return (
    <div>
      {ids.map((id, index) => (
        <div key={id ?? `none-${index}`} data-testid={`row-${id}`}>
          <RowWaveform row={row(id)} />
        </div>
      ))}
    </div>
  );
}

/** Let `ms` pass, and every answer that was due arrive. */
async function pass(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {
    vi.advanceTimersByTime(0);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  forgetWaveforms();
  cellWidth = 120;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: cellWidth, height: 30, left: 0, top: 0 }) as DOMRect,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  forgetWaveforms();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("the column's declaration", () => {
  const column = LIBRARY_COLUMNS.find((each) => each.id === "waveform")!;

  it("is \"Waveform\", hidden by default, not sortable, 48 and 120 CSS pixels", () => {
    expect(column).toMatchObject({
      header: "Waveform",
      hiddenByDefault: true,
      minWidthPx: 48,
      defaultWidthPx: 120,
    });
    expect(column.sortKey).toBeUndefined();
    expect(DEFAULT_VISIBLE_COLUMNS).not.toContain("waveform");
  });

  it("has no text to copy or export", () => {
    expect(column.text?.(row(1))).toBe("");
  });
});

describe("a row's waveform", () => {
  it("asks at the cell's columns rounded up to a multiple of 16, every row in one batch", async () => {
    const waveforms = install();
    render(<Rows ids={[1, 2, 3]} />);
    await pass(SETTLE_MS);

    // 120 CSS pixels at the default scale of 2: 60 columns, asked for as 64.
    expect(waveforms.get).toHaveBeenCalledTimes(1);
    expect(waveforms.get).toHaveBeenCalledWith({ track_ids: [1, 2, 3], width: 64, marks: false });
    expect(document.querySelectorAll("canvas")).toHaveLength(3);
  });

  it("asks once per 16 columns as the column is dragged wider", async () => {
    // jsdom has no ResizeObserver: this one reports what the test says, and,
    // as a real one does, every box it starts watching.
    const observed = new Set<Element>();
    let report: ((targets: Element[]) => void) | null = null;
    class FakeResizeObserver {
      constructor(callback: (entries: { target: Element }[]) => void) {
        report = (targets) => callback(targets.map((target) => ({ target })));
      }
      observe(element: Element) {
        observed.add(element);
      }
      unobserve(element: Element) {
        observed.delete(element);
      }
      disconnect() {
        observed.clear();
      }
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    try {
      const waveforms = install();
      render(<Rows ids={[1]} />);
      await act(async () => report?.([...observed]));
      await pass(SETTLE_MS);
      const widths = () => waveforms.get.mock.calls.map(([params]) => params.width);
      expect(widths()).toEqual([64]);

      // 121 to 128 CSS pixels are 61 to 64 columns: still 64. 129 is 65: 80,
      // which holds up to 160.
      for (const width of [121, 124, 128, 129, 150, 160]) {
        cellWidth = width;
        await act(async () => report?.([...observed]));
        await pass(0);
      }

      expect(widths()).toEqual([64, 80]);
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it("asks nothing for a row that leaves before 100 ms", async () => {
    const waveforms = install();
    const { rerender } = render(<Rows ids={[1, 2]} />);
    await pass(SETTLE_MS - 1);
    expect(waveforms.get).not.toHaveBeenCalled();

    // Row 1 scrolls away; row 2 stays and settles.
    rerender(<Rows ids={[2]} />);
    await pass(1);

    expect(waveforms.get).toHaveBeenCalledTimes(1);
    expect(waveforms.get).toHaveBeenCalledWith(expect.objectContaining({ track_ids: [2] }));
  });

  it("asks nothing for rows scrolled past quickly", async () => {
    const waveforms = install();
    const { rerender } = render(<Rows ids={[1, 2, 3]} />);
    let last: number[] = [];
    for (let first = 4; first < 400; first += 3) {
      await pass(16);
      last = [first, first + 1, first + 2];
      rerender(<Rows ids={last} />);
    }
    expect(waveforms.get).not.toHaveBeenCalled();

    await pass(SETTLE_MS);

    // Only the rows the scroll stopped on.
    expect(waveforms.get).toHaveBeenCalledTimes(1);
    expect(waveforms.get.mock.calls[0]![0].track_ids).toEqual(last);
  });

  it("draws a picture already held at once, without waiting to settle", async () => {
    const waveforms = install();
    const first = render(<Rows ids={[1]} />);
    await pass(SETTLE_MS);
    expect(document.querySelectorAll("canvas")).toHaveLength(1);
    first.unmount();

    render(<Rows ids={[1]} />);

    expect(document.querySelectorAll("canvas")).toHaveLength(1);
    await pass(SETTLE_MS);
    expect(waveforms.get).toHaveBeenCalledTimes(1);
  });

  it("never puts a track first in the analysis, however long it waits", async () => {
    const waveforms = install((id) => waveform(id, "waiting"));
    render(<Rows ids={[1, 2, 3]} />);
    await pass(SETTLE_MS);
    await pass(10_000);

    expect(waveforms.get).toHaveBeenCalled();
    expect(waveforms.request).not.toHaveBeenCalled();
  });

  it("asks nothing for a row with no track id", async () => {
    const waveforms = install();
    render(<Rows ids={[null]} />);
    await pass(SETTLE_MS);

    expect(waveforms.get).not.toHaveBeenCalled();
  });

  it.each<[WaveformTrackState, string | null, boolean, string, string]>([
    ["waiting", null, false, "Waiting", "Waveform not drawn yet"],
    ["waiting", null, true, "Paused", "Analysis paused"],
    ["failed", "undecodable", false, "Unreadable", "This file's audio could not be read."],
    ["missing", "not_found", false, "Missing", "File missing"],
    ["unchecked", null, false, "Unchecked", "Not checked yet"],
    ["unavailable", "decoder_missing", false, "Unavailable", DECODER_MISSING_WORDS],
  ])("shows a %s track as one muted word, the sentence in its title", async (state, reason, paused, word, sentence) => {
    install((id) => waveform(id, state, reason), paused);
    render(<Rows ids={[1]} />);
    await pass(SETTLE_MS);

    const shown = screen.getByText(word);
    expect(shown).toHaveClass("library-cell__waveform-word");
    expect(shown.parentElement).toHaveAttribute("title", sentence);
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("shows nothing while it waits to settle and while it loads", async () => {
    const waveforms = install();
    waveforms.get.mockReturnValue(new Promise(() => undefined));
    render(<Rows ids={[1]} />);

    const cell = screen.getByTestId("row-1").firstElementChild!;
    expect(cell.textContent).toBe("");
    await pass(SETTLE_MS);
    expect(cell.textContent).toBe("");
    expect(cell).not.toHaveAttribute("title");
  });
});

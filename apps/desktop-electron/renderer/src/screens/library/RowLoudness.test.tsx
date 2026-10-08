import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LibraryTrackRow,
  WaveformLoudness,
  WaveformTrack,
  WaveformTrackState,
  WaveformsQuery,
} from "../../api/cuepointBridge.types";
import { LOUDNESS_PENDING_WORDS, LOUDNESS_SILENT_WORDS } from "../../components/waveform/loudnessWords";
import { forgetWaveforms, waveformCache } from "../../components/waveform/waveformCache";
import { SETTLE_MS } from "../../components/waveform/waveformSettle";
import { RowLoudness } from "./libraryCells";
import { LOUDNESS_QUERY, gatherLoudnessText } from "./libraryLoudness";
import { DEFAULT_VISIBLE_COLUMNS, LIBRARY_COLUMNS } from "./libraryColumns";
import { gatherTracksAsText } from "./trackClipboard";

/**
 * The Library's "Loudness" column (WAVE-08): declared hidden and unsortable;
 * each row reads its number without a picture, only once it has been on
 * screen for 100 ms, never puts a track first in the analysis, and copies as
 * "−8.4 LUFS" for every row a copy holds, shown or not.
 */

const MEASURED: WaveformLoudness = { integrated_lufs: -8.4, peak_dbfs: -0.3, reason: null };

function row(id: number | null): LibraryTrackRow {
  return { id, title: `Track ${id}`, artist: "Artist", file_path: `/music/${id}.flac` } as LibraryTrackRow;
}

function waveform(
  trackId: number,
  state: WaveformTrackState = "ready",
  loudness: WaveformLoudness | null = state === "ready" ? MEASURED : null,
): WaveformTrack {
  return {
    track_id: trackId,
    state,
    reason: null,
    duration_ms: state === "ready" ? 6_000 : null,
    loudness,
    data: null,
    marks: null,
  };
}

function install(answer: (id: number) => WaveformTrack = (id) => waveform(id)) {
  const waveforms = {
    get: vi.fn(async (params: WaveformsQuery) => ({
      value: {
        width: params.width ?? null,
        paused: false,
        waveforms: params.track_ids.map(answer),
        unknown: [],
      },
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
          <RowLoudness row={row(id)} />
        </div>
      ))}
    </div>
  );
}

const cell = (id: number) => screen.getByTestId(`row-${id}`).firstElementChild as HTMLElement;

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
});

afterEach(async () => {
  cleanup();
  if (vi.isFakeTimers()) {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
  }
  forgetWaveforms();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("the column's declaration", () => {
  const column = LIBRARY_COLUMNS.find((each) => each.id === "loudness")!;

  it('is "Loudness", hidden by default, not sortable, right-aligned, 48 and 72 CSS pixels', () => {
    expect(column).toMatchObject({
      header: "Loudness",
      hiddenByDefault: true,
      minWidthPx: 48,
      defaultWidthPx: 72,
      align: "right",
    });
    expect(column.sortKey).toBeUndefined();
    expect(DEFAULT_VISIBLE_COLUMNS).not.toContain("loudness");
  });

  it("gathers its text for a copy rather than reading the row", () => {
    expect(column.gatherText).toBe(gatherLoudnessText);
  });
});

describe("a row's loudness", () => {
  it("reads every row's number in one batch without a picture, once settled", async () => {
    const waveforms = install();
    render(<Rows ids={[1, 2, 3]} />);
    await pass(SETTLE_MS - 1);
    expect(waveforms.get).not.toHaveBeenCalled();

    await pass(1);

    expect(waveforms.get).toHaveBeenCalledTimes(1);
    expect(waveforms.get).toHaveBeenCalledWith({ track_ids: [1, 2, 3], marks: false, data: false });
    expect(cell(1)).toHaveTextContent("−8.4");
    expect(cell(1)).toHaveAttribute("title", "Loudness −8.4 LUFS · Peak −0.3 dBFS");
    expect(cell(1)).not.toHaveClass("library-cell__loudness--word");
  });

  it("says a reason in one muted word, the sentence in its title", async () => {
    install((id) => waveform(id, "ready", { integrated_lufs: null, peak_dbfs: null, reason: "silent" }));
    render(<Rows ids={[1]} />);
    await pass(SETTLE_MS);

    expect(cell(1)).toHaveTextContent("Silent");
    expect(cell(1)).toHaveClass("library-cell__loudness--word");
    expect(cell(1)).toHaveAttribute("title", LOUDNESS_SILENT_WORDS);
  });

  it("is empty while its loudness or its waveform waits, its title saying why", async () => {
    install((id) => (id === 1 ? waveform(1, "ready", null) : waveform(id, "waiting")));
    render(<Rows ids={[1, 2]} />);
    await pass(SETTLE_MS);

    expect(cell(1)).toHaveTextContent("");
    expect(cell(1)).toHaveAttribute("title", LOUDNESS_PENDING_WORDS);
    expect(cell(2)).toHaveAttribute("title", "Waveform not drawn yet");
  });

  it("never puts a track first in the analysis", async () => {
    const waveforms = install((id) => waveform(id, "ready", null));
    render(<Rows ids={[1, 2]} />);
    await pass(SETTLE_MS * 3);

    expect(waveforms.request).not.toHaveBeenCalled();
  });

  it("is read through the shared cache, under its own query", async () => {
    install();
    render(<Rows ids={[5]} />);
    await pass(SETTLE_MS);

    expect(waveformCache.read(5, LOUDNESS_QUERY)).toMatchObject({ kind: "track" });
    expect(LOUDNESS_QUERY).toEqual({ width: null, marks: false, loudness: true });
  });
});

describe("a copy", () => {
  it("reads every row's loudness, shown or not, and copies it with its unit", async () => {
    vi.useRealTimers();
    const waveforms = install((id) =>
      id === 2
        ? waveform(2, "ready", { integrated_lufs: null, peak_dbfs: -40, reason: "too_quiet" })
        : id === 3
          ? waveform(3, "waiting")
          : waveform(id),
    );
    const columns = LIBRARY_COLUMNS.filter((each) => ["title", "loudness"].includes(each.id));
    const rows = Array.from({ length: 250 }, (_, index) => row(index + 1));

    const text = await gatherTracksAsText(columns, rows);

    const lines = text.split("\n");
    expect(lines[0]).toBe("Title\tLoudness");
    expect(lines[1]).toBe("Track 1\t−8.4 LUFS");
    expect(lines[2]).toBe("Track 2\tToo quiet or too short to measure");
    expect(lines[3]).toBe("Track 3\t");
    expect(lines).toHaveLength(251);
    expect(waveforms.get).toHaveBeenCalledTimes(2);
    expect(waveforms.get.mock.calls[0][0]).toMatchObject({ data: false });
  });

  it("leaves a row the engine could not answer empty rather than wrong", async () => {
    vi.useRealTimers();
    const waveforms = install();
    waveforms.get.mockRejectedValueOnce(new Error("engine gone"));

    const read = await gatherLoudnessText([row(1), row(null)]);

    expect(read(row(1))).toBe("");
    expect(read(row(null))).toBe("");
  });
});

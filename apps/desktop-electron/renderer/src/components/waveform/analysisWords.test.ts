import { describe, expect, it } from "vitest";

import type { WaveformAnalysisStatus } from "../../api/cuepointBridge.types";
import {
  ACTION_LABELS,
  DECODER_MISSING_WORDS,
  analysisAction,
  analysisWords,
  deleteDataWords,
  deletedWords,
  sizeWords,
  waveformStateWords,
} from "./analysisWords";

/**
 * The waveform analysis in words (WAVE-03): one line saying what it is doing
 * and how far it has got, and the one action beside it. Never an error: a
 * build without a decoder says why, once.
 */
function status(overrides: Partial<WaveformAnalysisStatus> = {}): WaveformAnalysisStatus {
  const base: WaveformAnalysisStatus = {
    state: "idle",
    paused: false,
    job_id: null,
    present: 50000,
    analysed: 50000,
    failed: 0,
    remaining: 0,
    rate_per_hour: null,
    eta_seconds: null,
    reason: null,
    store_bytes: 0,
  };
  const merged = { ...base, ...overrides };
  return { ...merged, remaining: merged.present - merged.analysed - merged.failed };
}

describe("analysisWords", () => {
  it("counts a running analysis against the library, with the time left", () => {
    expect(
      analysisWords(
        status({ state: "running", analysed: 1200, failed: 34, eta_seconds: 6 * 3600 }),
      ),
    ).toBe("Analysing · 1,234 of 50,000 · about 6 hours left");
  });

  it("leaves the time out until there is a rate", () => {
    expect(analysisWords(status({ state: "running", analysed: 1234 }))).toBe(
      "Analysing · 1,234 of 50,000",
    );
  });

  it("says how much a paused analysis has to go", () => {
    expect(analysisWords(status({ state: "paused", paused: true, analysed: 1234 }))).toBe(
      "Paused · 48,766 to go",
    );
  });

  it("says a paused analysis with nothing to go is complete", () => {
    expect(analysisWords(status({ state: "paused", paused: true }))).toBe(
      "Paused · all 50,000 analysed",
    );
  });

  it("says a finished analysis is complete, and what could not be read", () => {
    expect(analysisWords(status({ analysed: 49997, failed: 3 }))).toBe(
      "All 50,000 analysed · 3 could not be read",
    );
    expect(analysisWords(status())).toBe("All 50,000 analysed");
  });

  it("says what is waiting while nothing runs", () => {
    expect(analysisWords(status({ analysed: 40000, failed: 10 }))).toBe(
      "40,010 of 50,000 analysed · 9,990 waiting",
    );
  });

  it("says there is nothing yet before any file is checked", () => {
    expect(analysisWords(status({ present: 0, analysed: 0 }))).toBe(
      "No checked files to analyse yet",
    );
  });

  it("names the missing decoder in words, never as an error", () => {
    expect(
      analysisWords(status({ state: "unavailable", reason: "decoder_missing", analysed: 0 })),
    ).toBe(DECODER_MISSING_WORDS);
    expect(DECODER_MISSING_WORDS).not.toMatch(/error|fail/i);
  });
});

describe("analysisAction", () => {
  it.each([
    ["running", "pause", "Pause"],
    ["paused", "resume", "Resume"],
    ["idle", "start", "Analyse waveforms"],
  ] as const)("offers %s → %s", (state, action, label) => {
    const offered = analysisAction(status({ state }));
    expect(offered).toBe(action);
    expect(ACTION_LABELS[offered!]).toBe(label);
  });

  it("offers nothing without a decoder", () => {
    expect(analysisAction(status({ state: "unavailable", reason: "decoder_missing" }))).toBeNull();
  });
});

describe("a track's waveform in words (WAVE-05)", () => {
  it.each([
    ["ready", null, false, ""],
    ["waiting", null, false, "Waiting for analysis"],
    ["waiting", null, true, "Analysis paused"],
    ["failed", "undecodable", false, "This file could not be read (undecodable)"],
    ["missing", "missing", false, "File missing"],
    ["missing", "no_path", false, "No file for this track"],
    ["missing", "unreadable", false, "File could not be opened"],
    ["missing", "root_unavailable", false, "The drive or folder holding this file is not available"],
    ["unchecked", null, false, "Not checked yet"],
    ["unavailable", null, false, DECODER_MISSING_WORDS],
  ] as const)("%s (%s, paused %s) reads %j", (state, reason, paused, words) => {
    expect(waveformStateWords({ state, reason }, paused)).toBe(words);
  });

  it("says a ready track is ready only while it is not paused-waiting", () => {
    expect(waveformStateWords({ state: "ready", reason: null }, true)).toBe("");
  });
});

describe("sizes on disk", () => {
  it.each([
    [0, "0 bytes"],
    [1_023, "1,023 bytes"],
    [1_024, "1.0 KB"],
    [1_048_576, "1.0 MB"],
    [252_000_000, "240.3 MB"],
    [3 * 1024 ** 3, "3.0 GB"],
  ])("%i bytes reads %s", (bytes, words) => {
    expect(sizeWords(bytes)).toBe(words);
  });
});

describe("what Delete waveform data asks first", () => {
  it("states the size on disk, and that the library is analysed again", () => {
    const lines = deleteDataWords(status({ store_bytes: 252_000_000 }));
    expect(lines[0]).toContain("240.3 MB on disk");
    expect(lines[0]).toContain("Cue points and beat grids come from Rekordbox and are not affected");
    expect(lines[1]).toBe("The whole library will be analysed again.");
  });

  it("says how long that takes when the analysis has a rate", () => {
    const lines = deleteDataWords(
      status({ state: "running", present: 50_000, rate_per_hour: 8_000, store_bytes: 1 }),
    );
    expect(lines[1]).toBe(
      "The whole library will be analysed again, which takes about 6 hours at the current rate.",
    );
  });

  it("says it waits for Resume while paused", () => {
    expect(deleteDataWords(status({ state: "paused", paused: true }))[1]).toBe(
      "The whole library will be analysed again when the analysis is resumed.",
    );
  });

  it("says nothing can be made again without a decoder", () => {
    expect(deleteDataWords(status({ state: "unavailable", reason: "decoder_missing" }))[1]).toContain(
      "cannot be made again",
    );
  });

  it("still asks before the size is known", () => {
    expect(deleteDataWords(null)[0]).toContain("an unknown amount on disk");
  });

  it("says what it did", () => {
    expect(deletedWords(1_234, 252_000_000)).toBe("Deleted 1,234 waveforms, freeing 240.3 MB.");
    expect(deletedWords(1, 2_048)).toBe("Deleted 1 waveform, freeing 2.0 KB.");
    expect(deletedWords(0, 0)).toBe("There was no waveform data to delete.");
  });
});

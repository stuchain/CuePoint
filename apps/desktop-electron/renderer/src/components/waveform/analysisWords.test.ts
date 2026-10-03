import { describe, expect, it } from "vitest";

import type { WaveformAnalysisStatus } from "../../api/cuepointBridge.types";
import {
  ACTION_LABELS,
  DECODER_MISSING_WORDS,
  analysisAction,
  analysisWords,
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

import { describe, expect, it } from "vitest";

import type { WaveformLoudness, WaveformTrack } from "../../api/cuepointBridge.types";
import fixture from "./waveforms.fixture.json";
import {
  LOUDNESS_NOT_MEASURED_WORDS,
  LOUDNESS_PENDING_WORDS,
  LOUDNESS_SILENT_WORDS,
  LOUDNESS_TOO_QUIET_WORDS,
  formatLufs,
  formatPeak,
  loudnessCell,
  loudnessCopyText,
  loudnessDifference,
  loudnessUnitsTitle,
  loudnessLine,
  loudnessShort,
  signedTenths,
} from "./loudnessWords";
import type { WaveformEntry } from "./waveformCache";

const value = (lufs: number, peak = -0.3): WaveformLoudness => ({
  integrated_lufs: lufs,
  peak_dbfs: peak,
  reason: null,
});
const TOO_QUIET: WaveformLoudness = { integrated_lufs: null, peak_dbfs: -4.3, reason: "too_quiet" };
const SILENT: WaveformLoudness = { integrated_lufs: null, peak_dbfs: null, reason: "silent" };
const NOT_MEASURED: WaveformLoudness = { integrated_lufs: null, peak_dbfs: null, reason: "not_measured" };

function track(loudness: WaveformLoudness | null, state: WaveformTrack["state"] = "ready"): WaveformTrack {
  return {
    track_id: 1,
    state,
    reason: null,
    duration_ms: state === "ready" ? 1_000 : null,
    loudness,
    data: null,
    marks: null,
  };
}

const entry = (t: WaveformTrack): WaveformEntry => ({ kind: "track", track: t, paused: false });

describe("the numbers", () => {
  it.each([
    [-8.4, "−8.4"],
    [-8.44, "−8.4"],
    [-8.45, "−8.4"],
    [0, "0.0"],
    [-0.04, "0.0"],
    [0.04, "0.0"],
    [-23, "−23.0"],
    [1.25, "1.3"],
  ])("%s reads as %s, with a true minus sign and never −0.0", (input, expected) => {
    expect(signedTenths(input)).toBe(expected);
  });

  it("says LUFS and the peak's dBFS", () => {
    expect(formatLufs(-8.4)).toBe("−8.4 LUFS");
    expect(formatPeak(-0.3)).toBe("Peak −0.3 dBFS");
    expect(formatPeak(0)).toBe("Peak 0.0 dBFS");
  });
});

describe("the difference between two tracks", () => {
  it.each([
    [-10.5, -8.4, "+2.1 LU"],
    [-8.4, -10.5, "−2.1 LU"],
    [-8.4, -8.4, "0.0 LU"],
    // Computed from the tenths shown, so it agrees with them.
    [-8.35, -8.25, "+0.1 LU"],
  ])("%s then %s is %s", (from, to, expected) => {
    expect(loudnessDifference(value(from), value(to))).toBe(expected);
  });

  it("is said only when both have a value", () => {
    expect(loudnessDifference(value(-8), null)).toBeNull();
    expect(loudnessDifference(undefined, value(-8))).toBeNull();
    expect(loudnessDifference(value(-8), TOO_QUIET)).toBeNull();
    expect(loudnessDifference(SILENT, value(-8))).toBeNull();
  });
});

describe("the Inspector's line", () => {
  it("names the loudness and the peak", () => {
    expect(loudnessLine(track(value(-8.4, -0.3)))).toBe("Loudness −8.4 LUFS · Peak −0.3 dBFS");
  });

  it("says when it is still to be measured", () => {
    expect(loudnessLine(track(null))).toBe(LOUDNESS_PENDING_WORDS);
    expect(LOUDNESS_PENDING_WORDS).toBe("Loudness is measured with the next analysis");
  });

  it.each([
    [TOO_QUIET, `${LOUDNESS_TOO_QUIET_WORDS} · Peak −4.3 dBFS`],
    [{ ...TOO_QUIET, peak_dbfs: null }, LOUDNESS_TOO_QUIET_WORDS],
    [SILENT, LOUDNESS_SILENT_WORDS],
    [NOT_MEASURED, LOUDNESS_NOT_MEASURED_WORDS],
  ])("says why there is no value (%j)", (loudness, expected) => {
    expect(loudnessLine(track(loudness))).toBe(expected);
  });

  it("says nothing for a track with no waveform, whose box says why", () => {
    expect(loudnessLine(track(null, "waiting"))).toBeNull();
    expect(loudnessLine(track(null, "failed"))).toBeNull();
    expect(loudnessLine(null)).toBeNull();
  });
});

describe("a Library cell and its copy", () => {
  it("shows the number alone, the line in its title, and copies it with its unit", () => {
    const shown = entry(track(value(-8.4, -0.3)));
    expect(loudnessCell(shown)).toEqual({
      text: "−8.4",
      value: true,
      title: "Loudness −8.4 LUFS · Peak −0.3 dBFS",
    });
    expect(loudnessCopyText(shown)).toBe("−8.4 LUFS");
  });

  it.each([
    [TOO_QUIET, "Quiet", LOUDNESS_TOO_QUIET_WORDS],
    [SILENT, "Silent", LOUDNESS_SILENT_WORDS],
    [NOT_MEASURED, "", LOUDNESS_NOT_MEASURED_WORDS],
  ])("shows one word for a reason (%j)", (loudness, word, copied) => {
    const shown = entry(track(loudness));
    expect(loudnessCell(shown).text).toBe(word);
    expect(loudnessCell(shown).value).toBe(false);
    expect(loudnessCopyText(shown)).toBe(copied);
  });

  it("is empty while it waits, its title saying why", () => {
    expect(loudnessCell(entry(track(null)))).toEqual({
      text: "",
      value: false,
      title: LOUDNESS_PENDING_WORDS,
    });
    expect(loudnessCopyText(entry(track(null)))).toBe("");
  });

  it("is empty for a track with no waveform, and for an answer not in", () => {
    expect(loudnessCell(entry(track(null, "missing"))).text).toBe("");
    expect(loudnessCell({ kind: "loading" })).toEqual({ text: "", value: false, title: null });
    expect(loudnessCopyText({ kind: "error", message: "x" })).toBe("");
  });
});

describe("the strip's short form", () => {
  it("is the value, or nothing", () => {
    expect(loudnessShort(track(value(-8.4)))).toBe("−8.4 LUFS");
    expect(loudnessShort(track(TOO_QUIET))).toBeNull();
    expect(loudnessShort(track(null))).toBeNull();
  });
});

describe("against the engine's own answers", () => {
  it("reads each loudness the engine sends", () => {
    const tracks = fixture.batch_loudness.waveforms as unknown as WaveformTrack[];
    expect(tracks.map((t) => loudnessLine(t))).toEqual([
      "Loudness −7.9 LUFS · Peak −0.2 dBFS",
      `${LOUDNESS_TOO_QUIET_WORDS} · Peak −31.0 dBFS`,
      LOUDNESS_SILENT_WORDS,
      LOUDNESS_PENDING_WORDS,
      null,
    ]);
  });
});

describe("loudnessUnitsTitle (PRP-8)", () => {
  it("explains LUFS and what a difference in LU means", () => {
    expect(loudnessUnitsTitle("+2.1 LU")).toBe("Loudness (LUFS). +2.1 LU means the next track is 2.1 dB louder.");
    expect(loudnessUnitsTitle("−0.6 LU")).toBe("Loudness (LUFS). −0.6 LU means the next track is 0.6 dB quieter.");
    expect(loudnessUnitsTitle("0.0 LU")).toBe("Loudness (LUFS). 0.0 LU means the two tracks are equally loud.");
  });

  it("explains LUFS alone with no difference to read", () => {
    expect(loudnessUnitsTitle(null)).toBe(
      "Loudness (LUFS): how loud the whole track measures. A difference in LU is how much louder or quieter the next track is.",
    );
  });
});

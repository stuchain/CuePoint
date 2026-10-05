import { describe, expect, it } from "vitest";

import { BANDS, layoutWaveform } from "./waveformLayout";
import { LOOP_ALPHA, PAINT_TOKENS, paintLayout, resolvePaint } from "./waveformPaint";

/**
 * Filling a layout onto a canvas (WAVE-05): nothing decided here that the
 * layout has not, every token read from the theme, loops translucent.
 */

const TOKENS: Record<string, string> = {
  "--waveform-low": "#0000ff",
  "--waveform-mid": "#ffa500",
  "--waveform-high": "#ffffff",
  "--waveform-mono": "#a78bfa",
  "--waveform-played": "rgba(0, 0, 0, 0.6)",
  "--waveform-grid": "rgba(255, 255, 255, 0.16)",
  "--waveform-memory-cue": "#cccccc",
  "--fg-primary": "#fafafa",
};

const style = { getPropertyValue: (name: string) => ` ${TOKENS[name] ?? ""} ` };

interface Fill {
  colour: string;
  alpha: number;
  rect: [number, number, number, number];
}

function recorder() {
  const fills: Fill[] = [];
  const context = {
    fillStyle: "" as string | CanvasGradient | CanvasPattern,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    cleared: null as null | number[],
    clearRect(x: number, y: number, w: number, h: number) {
      this.cleared = [x, y, w, h];
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ colour: String(this.fillStyle), alpha: this.globalAlpha, rect: [x, y, w, h] });
    },
  };
  return { context, fills };
}

describe("painting a layout", () => {
  it("reads each named paint from its token, and uses a cue's colour as it is", () => {
    expect(resolvePaint("low", style)).toBe("#0000ff");
    expect(resolvePaint("playhead", style)).toBe("#fafafa");
    expect(resolvePaint("#ff8c00", style)).toBe("#ff8c00");
    expect(resolvePaint("grid", { getPropertyValue: () => "" })).toBe("transparent");
    expect(Object.keys(PAINT_TOKENS).sort()).toEqual(
      ["grid", "high", "low", "memory-cue", "mid", "mono", "played", "playhead"].sort(),
    );
  });

  it("fills every rectangle of the layout, in its order, with smoothing off", () => {
    const layout = layoutWaveform({
      data: new Uint8Array(10 * BANDS).fill(200),
      durationMs: 10_000,
      cssWidth: 10,
      cssHeight: 20,
      scale: 1,
      devicePixelRatio: 1,
      mode: "bands",
      cues: [
        { kind: "loop", hot_cue: null, start_ms: 2_000, end_ms: 4_000, name: null, color: "#ff8c00" },
      ],
      playheadMs: 5_000,
    });
    const { context, fills } = recorder();

    paintLayout(context, layout, style);

    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.cleared).toEqual([0, 0, 10, 20]);
    const expected = [
      ...layout.bands,
      ...layout.loops,
      ...layout.played,
      ...layout.cues.flatMap((c) => c.rects),
      layout.playhead!,
    ];
    expect(fills.map((f) => f.rect)).toEqual(expected.map((r) => [r.x, r.y, r.width, r.height]));
    expect(fills.filter((f) => f.colour === "#ff8c00" && f.alpha === LOOP_ALPHA)).toHaveLength(1);
    expect(fills.filter((f) => f.alpha !== 1)).toHaveLength(1);
    expect(fills.at(-1)).toMatchObject({ colour: "#fafafa", alpha: 1 });
    expect(context.globalAlpha).toBe(1);
  });

  it("draws one colour in the mono token", () => {
    const layout = layoutWaveform({
      data: new Uint8Array(4 * BANDS).fill(100),
      durationMs: 1_000,
      cssWidth: 4,
      cssHeight: 10,
      scale: 1,
      devicePixelRatio: 1,
      mode: "single",
    });
    const { context, fills } = recorder();

    paintLayout(context, layout, style);

    expect(new Set(fills.map((f) => f.colour))).toEqual(new Set(["#a78bfa"]));
  });
});

import { describe, expect, it } from "vitest";

import { barsLayout, type BarsLayout, type PixelBucket } from "./pixelBarsGeometry";

const SCALES = [1, 1.5, 2, 3] as const;

const NAMED: PixelBucket[] = [
  { label: "Techno", count: 400 },
  { label: "House", count: 100 },
  { label: "Ambient", count: 0 },
  { label: "Drum and bass", count: 1 },
];

const ORDERED: PixelBucket[] = Array.from({ length: 30 }, (_, at) => ({
  label: String(100 + at),
  count: at % 7 === 0 ? 0 : (at * 37) % 211,
}));

/** Every number a layout puts on the page, rect edges and text positions alike. */
function numbers(layout: BarsLayout): number[] {
  const all: number[] = [layout.width, layout.height, layout.axis.x, layout.axis.y, layout.axis.width, layout.axis.height];
  for (const bar of layout.bars) {
    all.push(bar.hit.x, bar.hit.y, bar.hit.width, bar.hit.height, bar.count.x, bar.count.y);
    if (bar.label) all.push(bar.label.x, bar.label.y);
    if (bar.rect) all.push(bar.rect.x, bar.rect.y, bar.rect.width, bar.rect.height);
    if (bar.outline) all.push(bar.outline.x, bar.outline.y, bar.outline.width, bar.outline.height);
  }
  return all;
}

describe("barsLayout: whole pixels", () => {
  for (const scale of SCALES) {
    for (const orientation of ["horizontal", "vertical"] as const) {
      it(`puts every edge on a whole pixel at ${scale}x, ${orientation}`, () => {
        const buckets = orientation === "horizontal" ? NAMED : ORDERED;
        const layout = barsLayout({ buckets, orientation, width: 437, height: 211, scale });
        const bad = numbers(layout).filter((n) => !Number.isInteger(n));
        expect(bad).toEqual([]);
      });
    }
  }

  it("keeps the bars apart so their outlines never touch", () => {
    for (const scale of SCALES) {
      const layout = barsLayout({ buckets: ORDERED, orientation: "vertical", width: 300, height: 200, scale });
      const drawn = layout.bars.filter((b) => b.outline);
      for (let at = 1; at < drawn.length; at++) {
        const before = drawn[at - 1]!.outline!;
        expect(drawn[at]!.outline!.x).toBeGreaterThan(before.x + before.width);
      }
    }
  });
});

describe("barsLayout: a zero bucket", () => {
  it("draws no rect and no outline, in either orientation", () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      const layout = barsLayout({ buckets: NAMED, orientation, width: 400, height: 200, scale: 1.5 });
      const zero = layout.bars.find((b) => b.bucket.label === "Ambient")!;
      expect(zero.rect).toBeNull();
      expect(zero.outline).toBeNull();
      expect(zero.count.text).toBe("0");
    }
  });

  it("still draws a bucket of one as at least one pixel", () => {
    for (const scale of SCALES) {
      const layout = barsLayout({
        buckets: [{ label: "big", count: 100000 }, { label: "one", count: 1 }],
        orientation: "vertical",
        width: 200,
        height: 200,
        scale,
      });
      expect(layout.bars[1]!.rect!.height).toBeGreaterThanOrEqual(1);
    }
  });

  it("draws nothing at all when every bucket is empty", () => {
    const layout = barsLayout({
      buckets: [{ label: "a", count: 0 }, { label: "b", count: 0 }],
      orientation: "vertical",
      width: 200,
      height: 200,
      scale: 1,
    });
    expect(layout.bars.every((b) => b.rect === null)).toBe(true);
  });
});

describe("barsLayout: the tallest bar fills", () => {
  it("fills the plot's height when vertical, and no bar is taller", () => {
    for (const scale of SCALES) {
      const layout = barsLayout({ buckets: ORDERED, orientation: "vertical", width: 300, height: 200, scale });
      const heights = layout.bars.map((b) => b.rect?.height ?? 0);
      expect(Math.max(...heights)).toBe(layout.plot.length);
      const tallest = layout.bars[heights.indexOf(Math.max(...heights))]!;
      expect(tallest.bucket.count).toBe(Math.max(...ORDERED.map((b) => b.count)));
      expect(tallest.rect!.y + tallest.rect!.height).toBe(layout.axis.y);
    }
  });

  it("fills the plot's width when horizontal", () => {
    for (const scale of SCALES) {
      const layout = barsLayout({ buckets: NAMED, orientation: "horizontal", width: 400, height: 0, scale });
      const widths = layout.bars.map((b) => b.rect?.width ?? 0);
      expect(Math.max(...widths)).toBe(layout.plot.length);
      expect(layout.bars[0]!.rect!.width).toBe(layout.plot.length);
      expect(layout.bars[0]!.rect!.x + layout.bars[0]!.rect!.width).toBeLessThanOrEqual(layout.width);
    }
  });

  it("keeps lengths in proportion, to the nearest pixel", () => {
    const layout = barsLayout({ buckets: NAMED, orientation: "horizontal", width: 400, height: 0, scale: 2 });
    const [techno, house] = layout.bars;
    expect(house!.rect!.width).toBe(Math.round(techno!.rect!.width / 4));
  });
});

describe("barsLayout: size and text", () => {
  it("grows past the container when an ordered run is long, and stays inside it when short", () => {
    const long = barsLayout({ buckets: ORDERED, orientation: "vertical", width: 200, height: 200, scale: 1.5 });
    expect(long.width).toBeGreaterThan(200);
    const short = barsLayout({ buckets: ORDERED.slice(0, 3), orientation: "vertical", width: 600, height: 200, scale: 1.5 });
    expect(short.width).toBeLessThanOrEqual(600);
  });

  it("stacks named buckets as rows in the given order", () => {
    const layout = barsLayout({ buckets: NAMED, orientation: "horizontal", width: 400, height: 0, scale: 1.5 });
    const tops = layout.bars.map((b) => b.hit.y);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    expect(new Set(tops).size).toBe(NAMED.length);
    expect(layout.height).toBeGreaterThanOrEqual(tops.at(-1)! + layout.bars.at(-1)!.hit.height);
  });

  it("writes every count and thins the labels of a crowded axis", () => {
    const layout = barsLayout({ buckets: ORDERED, orientation: "vertical", width: 200, height: 200, scale: 1 });
    expect(layout.bars.map((b) => b.count.text)).toEqual(ORDERED.map((b) => b.count.toLocaleString()));
    const shown = layout.bars.filter((b) => b.label).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(ORDERED.length);
  });

  it("keeps every thinned label inside the chart, ending the last ones at their bar", () => {
    const months = Array.from({ length: 28 }, (_, at) => ({
      label: `${2024 + Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`,
      count: at + 1,
    }));
    for (const scale of SCALES) {
      const layout = barsLayout({ buckets: months, orientation: "vertical", width: 560, height: 200, scale });
      const charW = Math.round(6 * scale);
      const edges = layout.bars.flatMap((b) => {
        if (!b.label) return [];
        const w = [...b.label.text].length * charW;
        const left = b.label.anchor === "start" ? b.label.x : b.label.anchor === "end" ? b.label.x - w : b.label.x - w / 2;
        return [{ left, right: left + w }];
      });
      expect(edges.length).toBeGreaterThan(1);
      expect(edges.filter((e) => e.right > layout.width || e.left < 0)).toEqual([]);
    }
  });

  it("shortens a long name on the chart", () => {
    const layout = barsLayout({
      buckets: [{ label: "A very long genre name indeed, truly", count: 3 }],
      orientation: "horizontal",
      width: 400,
      height: 0,
      scale: 1.5,
    });
    expect(layout.bars[0]!.label!.text.endsWith("…")).toBe(true);
    expect(layout.bars[0]!.bucket.label).toBe("A very long genre name indeed, truly");
  });

  it("gives an empty chart a size and no bars", () => {
    const layout = barsLayout({ buckets: [], orientation: "vertical", width: 100, height: 100, scale: 1 });
    expect(layout.bars).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import { formatCount } from "./formatCount";
import { barsLayout, rebin, type BarsLayout, type PixelBucket } from "./pixelBarsGeometry";

const SCALES = [1, 1.25, 1.5, 2, 3] as const;

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
    all.push(bar.hit.x, bar.hit.y, bar.hit.width, bar.hit.height);
    if (bar.count) all.push(bar.count.x, bar.count.y);
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
      expect(zero.count).toBeNull();
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

  it("writes every count but the empty ones, and thins the labels of a crowded axis", () => {
    const layout = barsLayout({ buckets: ORDERED, orientation: "vertical", width: 200, height: 200, scale: 1 });
    expect(layout.bars.map((b) => b.count?.text ?? null)).toEqual(
      ORDERED.map((b) => (b.count > 0 ? formatCount(b.count) : null)),
    );
    const shown = layout.bars.filter((b) => b.label).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(ORDERED.length);
  });

  it("writes a count only where it fits its own bar's column, so neighbours never run together (item 4)", () => {
    // Fitted to a narrow width the columns are thinner than "35", and 35 beside 35 read as "3535".
    const buckets = Array.from({ length: 40 }, (_, at) => ({ label: String(100 + at), count: at % 3 === 0 ? 1204 : 35 }));
    for (const scale of SCALES) {
      const layout = barsLayout({ buckets, orientation: "vertical", width: 520, height: 200, scale, fit: "width" });
      const charW = Math.round(6 * scale);
      const pitch = layout.bars[1]!.hit.x - layout.bars[0]!.hit.x;
      const written = layout.bars.filter((b) => b.count);
      for (const bar of written) expect([...bar.count!.text].length * charW).toBeLessThan(pitch);
      const ends = written.map((b) => {
        const w = [...b.count!.text].length * charW;
        return { left: b.count!.x - w / 2, right: b.count!.x + w / 2 };
      });
      for (let at = 1; at < ends.length; at += 1) expect(ends[at]!.left).toBeGreaterThanOrEqual(ends[at - 1]!.right);
    }
    // Wide enough, every count is written.
    const wide = barsLayout({ buckets, orientation: "vertical", width: 4000, height: 200, scale: 1, fit: "width" });
    expect(wide.bars.every((b) => b.count)).toBe(true);
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

describe("barsLayout: a gap bucket", () => {
  const RUN: PixelBucket[] = [
    { label: "139", count: 5 },
    { label: "⋯", count: 0 },
    { label: "170", count: 9 },
  ];
  const isGap = (b: PixelBucket) => b.label === "⋯";

  it("is a narrow break with no bar and no count, and its mark is on the axis", () => {
    const layout = barsLayout({ buckets: RUN, orientation: "vertical", width: 400, height: 200, scale: 1, isGap });
    const [before, gap, after] = layout.bars;
    expect(gap!.gap).toBe(true);
    expect(gap!.rect).toBeNull();
    expect(gap!.outline).toBeNull();
    expect(gap!.count).toBeNull();
    expect(gap!.label?.text).toBe("⋯");
    expect(gap!.hit.width).toBeLessThan(before!.hit.width);
    expect(after!.hit.x).toBe(gap!.hit.x + gap!.hit.width);
    expect(before!.gap).toBe(false);
  });

  it("stays on whole pixels at every scale", () => {
    for (const scale of [1, 1.5, 2, 3]) {
      const layout = barsLayout({ buckets: RUN, orientation: "vertical", width: 400, height: 200, scale, isGap });
      expect(numbers(layout).every(Number.isInteger)).toBe(true);
    }
  });

  it("draws no bar and no count in rows either", () => {
    const layout = barsLayout({ buckets: RUN, orientation: "horizontal", width: 400, height: 200, scale: 1, isGap });
    expect(layout.bars[1]!.rect).toBeNull();
    expect(layout.bars[1]!.count).toBeNull();
  });

  it("never draws two labels over each other when a gap sits among thinned names", () => {
    const years = [...Array.from({ length: 13 }, (_, at) => 1990 + at), null, 2015, 2016];
    const buckets: PixelBucket[] = years.map((y) => ({ label: y === null ? "⋯" : String(y), count: 5 }));
    for (const scale of SCALES) {
      const layout = barsLayout({ buckets, orientation: "vertical", width: 100, height: 200, scale, isGap });
      const spans = layout.bars
        .flatMap((b) => (b.label ? [b.label] : []))
        .map((l) => {
          const w = [...l.text].length * Math.max(1, Math.round(6 * scale));
          const start = l.anchor === "middle" ? l.x - w / 2 : l.anchor === "end" ? l.x - w : l.x;
          return [start, start + w] as const;
        });
      expect(spans.length).toBeGreaterThan(1);
      for (let at = 1; at < spans.length; at += 1) {
        expect(spans[at]![0]).toBeGreaterThanOrEqual(spans[at - 1]![1]);
      }
    }
  });
});

describe("barsLayout: fit to the width (C247)", () => {
  const wide = { buckets: ORDERED, orientation: "vertical" as const, width: 2400, height: 160, scale: 1 };

  it("stretches the bars to fill a wide container instead of stopping at the widest pitch", () => {
    const scroll = barsLayout(wide);
    const fit = barsLayout({ ...wide, fit: "width" });
    // M214: both plots now reach the container's edge, so the bars, not the plot, are compared.
    expect(fit.bars[0]!.hit.width).toBeGreaterThan(scroll.bars[0]!.hit.width);
    expect(scroll.width).toBe(2400);
    expect(fit.width).toBeLessThanOrEqual(2400);
    expect(fit.width).toBeGreaterThan(2400 - ORDERED.length);
  });

  it("squeezes the bars into a narrow container instead of scrolling", () => {
    const narrow = barsLayout({ ...wide, width: 240, fit: "width" });
    expect(narrow.width).toBeLessThanOrEqual(240);
    expect(narrow.bars.every((bar) => bar.hit.width >= 1)).toBe(true);
  });

  it("keeps every edge on a whole pixel at each scale", () => {
    for (const scale of SCALES) {
      const layout = barsLayout({ ...wide, scale, width: 733, fit: "width" });
      expect(numbers(layout).filter((n) => !Number.isInteger(n))).toEqual([]);
    }
  });

  it("is the default behaviour when fit is left out", () => {
    expect(barsLayout({ ...wide, fit: "scroll" })).toEqual(barsLayout(wide));
  });
});

describe("rebin (C247)", () => {
  const run: PixelBucket[] = [
    { label: "100", count: 1 },
    { label: "101", count: 2 },
    { label: "102", count: 3 },
    { label: "103", count: 4 },
    { label: "104", count: 5 },
  ];

  it("keeps the run when it is already within the bin count", () => {
    expect(rebin(run, 5)).toEqual(run);
    expect(rebin(run, 9)).toEqual(run);
  });

  it("sums neighbours into at most the bin count, labelled first to last", () => {
    const merged = rebin(run, 2);
    expect(merged).toHaveLength(2);
    expect(merged.map((b) => b.count)).toEqual([3, 12]);
    expect(merged[0]!.label).toBe("100\u2013101");
    expect(merged[1]!.label).toBe("102\u2013104");
  });

  it("keeps the total", () => {
    for (const bins of [1, 2, 3, 4]) {
      expect(rebin(run, bins).reduce((sum, b) => sum + b.count, 0)).toBe(15);
    }
  });

  it("is a single bar for one bin, and the run itself for a bin count under one", () => {
    expect(rebin(run, 1)).toEqual([{ label: "100\u2013104", count: 15 }]);
    expect(rebin(run, 0)).toEqual(run);
  });
});

describe("counts on every bar or none, and the plot to the edge (D22 A, M214)", () => {
  it("writes no count at all when one would not fit its column", () => {
    const buckets = [
      { label: "120", count: 3 },
      { label: "124", count: 12345 },
      { label: "128", count: 7 },
    ];
    const layout = barsLayout({ buckets, orientation: "vertical", width: 60, height: 120, scale: 1, fit: "width" });
    expect(layout.bars.every((bar) => bar.count === null)).toBe(true);
  });

  it("writes every count when they all fit", () => {
    const buckets = [
      { label: "120", count: 3 },
      { label: "124", count: 12 },
      { label: "128", count: 7 },
    ];
    const layout = barsLayout({ buckets, orientation: "vertical", width: 600, height: 120, scale: 1 });
    expect(layout.bars.every((bar) => bar.count !== null)).toBe(true);
    // A short run keeps its bars' width, and its baseline reaches the container's edge.
    expect(layout.width).toBe(600);
    expect(layout.axis.width).toBe(600);
  });
});

import { describe, expect, it } from "vitest";

import type { FilterRuleSet, StatisticsBucket } from "../../api/cuepointBridge.types";
import { FIT_BINS, fillBins, groupTempo, MAX_EMPTY_RUN } from "./spreadBins";

const rules: FilterRuleSet = { match: "all", rules: [{ field: "bpm", operator: "is", value: 1 }] };
const bin = (n: number, count = 1): StatisticsBucket => ({
  label: `${n} BPM`,
  value: n,
  count,
  rules,
});
const values = (buckets: { value: unknown; gap?: boolean }[]) =>
  buckets.map((b) => (b.gap ? "gap" : b.value));

describe("fillBins", () => {
  it("fills the integers between buckets as empty bins with no rules", () => {
    const out = fillBins([bin(120), bin(123)], 1, (n) => `${n} BPM`);
    expect(values(out)).toEqual([120, 121, 122, 123]);
    expect(out[1]).toEqual({ label: "121 BPM", value: 121, count: 0, rules: null });
    expect(out[2]).toEqual({ label: "122 BPM", value: 122, count: 0, rules: null });
    expect(out[3]!.rules).toBe(rules);
  });

  it("labels a filled bin with the number unless told how", () => {
    expect(fillBins([bin(2018), bin(2020)])[1]!.label).toBe("2019");
  });

  it("keeps a run of exactly 8 empty bins as zero bins", () => {
    const out = fillBins([bin(100), bin(109)]);
    expect(out).toHaveLength(10);
    expect(out.some((b) => b.gap)).toBe(false);
    expect(MAX_EMPTY_RUN).toBe(8);
  });

  it("collapses a run of 9 empty bins into one gap bucket", () => {
    const out = fillBins([bin(100), bin(110)]);
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual({ gap: true, label: "⋯", value: null, count: 0, rules: null });
  });

  it("puts one break between 139 and 170 and keeps the neighbours", () => {
    const out = fillBins([bin(136), bin(139), bin(170), bin(172)]);
    expect(values(out)).toEqual([136, 137, 138, 139, "gap", 170, 171, 172]);
  });

  it("steps by `step`", () => {
    expect(values(fillBins([bin(0), bin(6)], 3))).toEqual([0, 3, 6]);
  });

  it("returns one bucket unchanged, and nothing for nothing", () => {
    const one = [bin(124)];
    expect(fillBins(one)).toEqual(one);
    expect(fillBins([])).toEqual([]);
  });

  it("sorts buckets that arrive out of order", () => {
    expect(values(fillBins([bin(122), bin(120)]))).toEqual([120, 121, 122]);
  });

  it("leaves buckets alone that are not numbers", () => {
    const named: StatisticsBucket[] = [
      { label: "2026-08", value: "2026-08", count: 1, rules: null },
      { label: "2026-10", value: "2026-10", count: 1, rules: null },
    ];
    expect(fillBins(named)).toEqual(named);
  });

  it("folds a huge stretch into one gap without building every missing value", () => {
    const started = Date.now();
    const out = fillBins([bin(1990), bin(20190101)]);
    expect(out).toHaveLength(3);
    expect(out[1]!.gap).toBe(true);
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe("groupTempo (2-BPM bins)", () => {
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => bin(from + i, 1));
  // The engine's own rule for one BPM: n - 0.5 up to n + 0.5.
  const real = (n: number, count: number): StatisticsBucket => ({
    label: `${n} BPM`,
    value: n,
    count,
    rules: {
      match: "all",
      rules: [
        { field: "bpm", operator: "gte", value: n - 0.5 },
        { field: "bpm", operator: "lt", value: n + 0.5 },
      ],
    },
  });

  it("pairs neighbours on even starts and sums their counts", () => {
    const out = groupTempo([real(122, 4), real(123, 6), real(124, 1)]);
    expect(out.map((b) => [b.value, b.count])).toEqual([
      ["122–123", 10],
      ["124–125", 1],
    ]);
    expect(out[0]!.label).toBe("122–123 BPM");
  });

  it("opens the tracks of both numbers: the range rule runs from the first number to the last", () => {
    const [first] = groupTempo([real(122, 4), real(123, 6)]);
    expect(first!.rules).toEqual({
      match: "all",
      rules: [
        { field: "bpm", operator: "gte", value: 121.5 },
        { field: "bpm", operator: "lt", value: 123.5 },
      ],
    });
  });

  it("keeps the scope's own rules in front of the bpm pair", () => {
    const base = real(122, 1);
    const scoped: StatisticsBucket = {
      ...base,
      rules: { match: "all", rules: [{ field: "playlist", operator: "is", value: 4 }, ...base.rules!.rules] },
    };
    const [first] = groupTempo([scoped, real(123, 1)]);
    expect(first!.rules!.rules[0]).toEqual({ field: "playlist", operator: "is", value: 4 });
    expect(first!.rules!.rules).toHaveLength(3);
  });

  it("leaves a break alone and has no rules for a bin it cannot describe", () => {
    const gap = { gap: true, label: "⋯", value: null, count: 0, rules: null };
    const out = groupTempo([bin(122), gap, bin(170)]);
    expect(out[1]).toBe(gap);
    expect(out[0]!.rules).toBeNull();
  });

  it("never changes the total", () => {
    const input = range(100, 140);
    const out = groupTempo(input);
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(input.length);
    expect(out).toHaveLength(21);
  });

  it("names the limit past which a run is grouped", () => {
    expect(FIT_BINS).toBeGreaterThan(20);
  });
});

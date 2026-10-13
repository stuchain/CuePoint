import { describe, expect, it } from "vitest";

import type { FilterRuleSet, StatisticsBucket } from "../../api/cuepointBridge.types";
import { fillBins, MAX_EMPTY_RUN } from "./spreadBins";

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

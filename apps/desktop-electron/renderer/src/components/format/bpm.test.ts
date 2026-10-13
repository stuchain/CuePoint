import { describe, expect, it } from "vitest";

import { formatBpm, formatBpmRange } from "./bpm";

describe("formatBpm", () => {
  it("writes a whole tempo without a decimal", () => {
    expect(formatBpm(128)).toBe("128");
    expect(formatBpm(124.0)).toBe("124");
  });

  it("keeps one decimal when it is not zero", () => {
    expect(formatBpm(127.5)).toBe("127.5");
    expect(formatBpm(122.53)).toBe("122.5");
  });

  it("rounds to one decimal, then drops a zero it leaves", () => {
    expect(formatBpm(127.98)).toBe("128");
    expect(formatBpm(127.04)).toBe("127");
    expect(formatBpm(127.26)).toBe("127.3");
  });

  it("rounds a half the way a person does, not by its binary value", () => {
    expect(formatBpm(127.35)).toBe("127.4");
    expect(formatBpm(127.05)).toBe("127.1");
    expect(formatBpm(127.95)).toBe("128");
    expect(formatBpm(128.05)).toBe("128.1");
    expect(formatBpm(127.98)).toBe("128");
  });

  it("is empty for a tempo that is not known", () => {
    for (const bpm of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 0, -120]) {
      expect(formatBpm(bpm)).toBe("");
    }
  });
});

describe("formatBpmRange", () => {
  it("writes both ends, one end, or nothing", () => {
    expect(formatBpmRange(120, 128)).toBe("120–128");
    expect(formatBpmRange(120, null)).toBe("from 120");
    expect(formatBpmRange(null, 128)).toBe("to 128");
    expect(formatBpmRange(null, null)).toBe("");
    expect(formatBpmRange(undefined, undefined)).toBe("");
  });

  it("uses the one BPM format for each end", () => {
    expect(formatBpmRange(119.96, 128.04)).toBe("120–128");
  });

  it("is one value when both ends read the same", () => {
    expect(formatBpmRange(127.98, 128.02)).toBe("128");
    expect(formatBpmRange(124, 124)).toBe("124");
  });

  it("treats an unknown end as missing", () => {
    expect(formatBpmRange(0, 128)).toBe("to 128");
    expect(formatBpmRange(120, Number.NaN)).toBe("from 120");
  });
});

import { describe, expect, it } from "vitest";

import { waveformEnergyAt } from "./crowdFallback";

/** Four bytes a column: full, low, mid, high. */
function columns(full: number[]): Uint8Array {
  const data = new Uint8Array(full.length * 4);
  full.forEach((value, i) => {
    data[i * 4] = value;
    data[i * 4 + 1] = 1;
    data[i * 4 + 2] = 2;
    data[i * 4 + 3] = 3;
  });
  return data;
}

describe("waveformEnergyAt", () => {
  const data = columns([0, 51, 102, 255]);

  it("picks the column the position falls in, from the full band", () => {
    expect(waveformEnergyAt(data, 0, 100)).toBe(0);
    expect(waveformEnergyAt(data, 30, 100)).toBeCloseTo(51 / 255, 5);
    expect(waveformEnergyAt(data, 55, 100)).toBeCloseTo(102 / 255, 5);
    expect(waveformEnergyAt(data, 99, 100)).toBe(1);
  });

  it("clamps a position past either end", () => {
    expect(waveformEnergyAt(data, 500, 100)).toBe(1);
    expect(waveformEnergyAt(data, -5, 100)).toBe(0);
  });

  it("is null without data, a position or a duration", () => {
    expect(waveformEnergyAt(null, 1, 100)).toBeNull();
    expect(waveformEnergyAt(data, null, 100)).toBeNull();
    expect(waveformEnergyAt(data, 1, null)).toBeNull();
    expect(waveformEnergyAt(data, 1, 0)).toBeNull();
    expect(waveformEnergyAt(new Uint8Array(0), 1, 100)).toBeNull();
  });
});

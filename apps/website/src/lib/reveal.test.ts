import { describe, expect, it } from "vitest";
import { holdsBack } from "./reveal";

describe("reveal", () => {
  it("never holds back what is on the first screen", () => {
    expect(holdsBack(0, 900, false)).toBe(false);
    expect(holdsBack(899, 900, false)).toBe(false);
    expect(holdsBack(-400, 900, false)).toBe(false);
  });
  it("holds back a block that starts below the first screen", () => {
    expect(holdsBack(900, 900, false)).toBe(true);
    expect(holdsBack(2400, 900, false)).toBe(true);
  });
  it("holds back nothing with reduced motion", () => {
    expect(holdsBack(2400, 900, true)).toBe(false);
  });
});

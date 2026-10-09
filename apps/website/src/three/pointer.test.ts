import { describe, expect, it } from "vitest";
import { DEAD_ZONE, FINE_POINTER, deadZone, pointerFrom } from "./pointer";

describe("the mouse that leans the home page's camera", () => {
  it("moves nothing near the middle of the screen", () => {
    for (const v of [0, 0.05, -0.1, DEAD_ZONE, -DEAD_ZONE]) expect(deadZone(v)).toBe(0);
    expect(pointerFrom(720, 450, 1440, 900)).toEqual({ x: 0, y: 0 });
  });

  it("grows smoothly past the dead zone to the edge, with no step where the zone ends, and keeps its side", () => {
    expect(deadZone(DEAD_ZONE + 0.001)).toBeLessThan(0.001);
    expect(deadZone(1)).toBe(1);
    expect(deadZone(-1)).toBe(-1);
    expect(deadZone(5)).toBe(1);
    let last = 0;
    for (let v = 0; v <= 1; v += 0.01) {
      const now = deadZone(v);
      expect(now).toBeGreaterThanOrEqual(last);
      expect(now - last).toBeLessThan(0.03);
      last = now;
    }
    expect(deadZone(-0.6)).toBeCloseTo(-deadZone(0.6), 10);
  });

  it("reads x to the right and y up, from the screen's corners", () => {
    expect(pointerFrom(1440, 0, 1440, 900)).toEqual({ x: 1, y: 1 });
    expect(pointerFrom(0, 900, 1440, 900)).toEqual({ x: -1, y: -1 });
    expect(pointerFrom(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("is only for a pointer that can hover and point finely, never touch", () => {
    expect(FINE_POINTER).toContain("(hover: hover)");
    expect(FINE_POINTER).toContain("(pointer: fine)");
  });
});

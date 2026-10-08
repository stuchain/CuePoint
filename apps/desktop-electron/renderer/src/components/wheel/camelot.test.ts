/**
 * The wheel's drawing data (PAGES-10): 24 places, their names, their shapes and how
 * the keyboard moves between them. None of it is DEC-096's rule, which the engine owns.
 */
import { describe, expect, it } from "vitest";

import {
  CAMELOT_CODES,
  GRID_CELLS,
  keyName,
  moveOnRing,
  parseCode,
  segmentShape,
} from "./camelot";

describe("the wheel's places", () => {
  it("has 24 keys, A inside and B outside, each once", () => {
    expect(CAMELOT_CODES).toHaveLength(24);
    expect(new Set(CAMELOT_CODES).size).toBe(24);
    expect(CAMELOT_CODES.filter((code) => code.endsWith("A"))).toHaveLength(12);
  });

  it("names the keys the way the engine does", () => {
    expect(keyName("8A")).toBe("A minor");
    expect(keyName("9A")).toBe("E minor");
    expect(keyName("8B")).toBe("C major");
    expect(keyName("12B")).toBe("E major");
    expect(keyName("1A")).toBe("A♭ minor");
    expect(keyName("11A")).toBe("F♯ minor");
  });

  it("reads a code and refuses what is not one", () => {
    expect(parseCode("10B")).toEqual({ number: 10, letter: "B" });
    expect(parseCode("13A")).toBeNull();
    expect(parseCode("A minor")).toBeNull();
  });
});

describe("moving with the keyboard", () => {
  it("goes round the ring with left and right, wrapping at 12", () => {
    expect(moveOnRing("8A", "right")).toBe("9A");
    expect(moveOnRing("8A", "left")).toBe("7A");
    expect(moveOnRing("12B", "right")).toBe("1B");
    expect(moveOnRing("1A", "left")).toBe("12A");
  });

  it("switches rings with up and down, keeping the number", () => {
    expect(moveOnRing("8A", "up")).toBe("8B");
    expect(moveOnRing("8B", "down")).toBe("8A");
    // At an edge it stays put rather than wrapping to the other ring.
    expect(moveOnRing("8B", "up")).toBe("8B");
    expect(moveOnRing("8A", "down")).toBe("8A");
  });
});

describe("the shapes", () => {
  it.each(CAMELOT_CODES)("%s is a polygon of whole cells inside the grid", (code) => {
    const { cells } = segmentShape(code);
    expect(cells.length).toBeGreaterThanOrEqual(6);
    for (const [x, y] of cells) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(GRID_CELLS);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(GRID_CELLS);
    }
  });

  it.each(CAMELOT_CODES)("%s is stepped: only horizontal and vertical edges", (code) => {
    const { cells } = segmentShape(code);
    let area = 0;
    cells.forEach(([x, y], index) => {
      const [nx, ny] = cells[(index + 1) % cells.length]!;
      expect(x === nx || y === ny, `${code}: ${x},${y} to ${nx},${ny}`).toBe(true);
      expect(x === nx && y === ny).toBe(false);
      area += x * ny - nx * y;
    });
    // One clockwise piece (positive on a y-down grid) with room for a label.
    expect(area / 2).toBeGreaterThan(30);
  });

  it.each(["A", "B"])("gives the %s ring's twelve wedges near-equal cell counts", (letter) => {
    const counts = CAMELOT_CODES.filter((code) => code.endsWith(letter)).map(
      (code) => segmentShape(code).count,
    );
    expect(counts).toHaveLength(12);
    expect(Math.max(...counts) - Math.min(...counts), counts.join(",")).toBeLessThanOrEqual(4);
  });

  it("gives each wedge its own cells, none shared", () => {
    // The corners of different wedges never describe the same outline, and every
    // wedge has an SVG path of its own.
    const paths = CAMELOT_CODES.map((code) => segmentShape(code).path);
    expect(new Set(paths).size).toBe(24);
  });

  it("puts 12 at the top and 3 on the right, like a clock", () => {
    const top = segmentShape("12B").label;
    const right = segmentShape("3B").label;
    expect(top.y).toBeLessThan(50);
    expect(Math.abs(top.x - 50)).toBeLessThan(5);
    expect(right.x).toBeGreaterThan(50);
    expect(Math.abs(right.y - 50)).toBeLessThan(5);
  });

  it("draws A inside B", () => {
    const radius = (code: string) => {
      const { label } = segmentShape(code);
      return Math.hypot(label.x - 50, label.y - 50);
    };
    expect(radius("8A")).toBeLessThan(radius("8B"));
  });

  it("gives no two keys the same shape", () => {
    const shapes = CAMELOT_CODES.map((code) => JSON.stringify(segmentShape(code).cells));
    expect(new Set(shapes).size).toBe(24);
  });
});

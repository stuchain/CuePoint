/**
 * The wheel's drawing data (PAGES-10): 24 places, their names, their shapes and how
 * the keyboard moves between them. None of it is DEC-096's rule, which the engine owns.
 */
import { describe, expect, it } from "vitest";

import {
  CAMELOT_CODES,
  COUNT_LEVEL_MIX,
  GRID_CELLS,
  LABEL_AT,
  RING_RADII,
  WEDGE_GAP,
  ARC_STEP_DEGREES,
  compactCount,
  countLevel,
  countedName,
  edgeInset,
  inSector,
  keyName,
  moveOnRing,
  parseCode,
  sectorOf,
  sectorPoint,
  segmentShape,
  tracksWord,
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

/** Whether a point is inside a polygon, by counting crossings of a ray to the right. */
/**
 * The tenth-of-a-cell grid points around a wedge: its click polygon's box, one cell wider on
 * each side for the arcs' bulge between points. A point in two wedges is in the first, so
 * looking only here finds every overlap the whole grid would, at a sixth of the points.
 */
function gridAround(points: readonly (readonly [number, number])[]): [number, number][] {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const from = (low: number) => Math.max(0, Math.floor((low - 1) * 10));
  const to = (high: number) => Math.min(GRID_CELLS * 10, Math.ceil((high + 1) * 10));
  const grid: [number, number][] = [];
  for (let i = from(Math.min(...xs)); i <= to(Math.max(...xs)); i++) {
    for (let j = from(Math.min(...ys)); j <= to(Math.max(...ys)); j++) grid.push([i / 10, j / 10]);
  }
  return grid;
}

function inPolygon(polygon: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false;
  polygon.forEach(([ax, ay], index) => {
    const [bx, by] = polygon[(index + 1) % polygon.length]!;
    if (ay > y !== by > y && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) inside = !inside;
  });
  return inside;
}

describe("the shapes", () => {
  const ringOf = (code: string) => code.slice(-1) as "A" | "B";

  it("gives each wedge its own path, none shared", () => {
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
    const shapes = CAMELOT_CODES.map((code) => JSON.stringify(segmentShape(code).points));
    expect(new Set(shapes).size).toBe(24);
  });

  it.each(CAMELOT_CODES)("%s's path is two arcs and two lines", (code) => {
    const { path, sector } = segmentShape(code);
    expect(path).toMatch(/^M[^A]+A[^A]+L[^A]+A[^A]+Z$/);
    // The first arc is the outer one, the second the inner one.
    const radii = [...path.matchAll(/A([\d.]+) /g)].map((match) => Number(match[1]));
    expect(radii).toEqual([sector.outer, sector.inner]);
  });

  it.each(CAMELOT_CODES)("%s's click polygon stays inside the drawing", (code) => {
    const { sector, points } = segmentShape(code);
    expect(points.length).toBeGreaterThanOrEqual(2 * (30 / ARC_STEP_DEGREES));
    for (const [x, y] of points) {
      expect(inSector(sector, x, y, 1e-6), `${code}: ${x},${y}`).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(GRID_CELLS);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(GRID_CELLS);
    }
    // Each edge's midpoint too: a chord of an arc sags a hair inside it, within 0.005.
    points.forEach(([x, y], index) => {
      const [nx, ny] = points[(index + 1) % points.length]!;
      expect(inSector(sector, (x + nx) / 2, (y + ny) / 2, 0.005), `${code}: edge ${index}`).toBe(true);
    });
  });

  it.each(CAMELOT_CODES)("%s's polygon string matches its points", (code) => {
    const { points, polygon } = segmentShape(code);
    const read = [...polygon.matchAll(/(-?[\d.]+)% (-?[\d.]+)%/g)].map(
      (match) => [(Number(match[1]) / 100) * GRID_CELLS, (Number(match[2]) / 100) * GRID_CELLS],
    );
    expect(read).toHaveLength(points.length);
    read.forEach(([x, y], index) => {
      expect(Math.abs(x! - points[index]![0])).toBeLessThan(1e-3);
      expect(Math.abs(y! - points[index]![1])).toBeLessThan(1e-3);
    });
  });

  it.each(CAMELOT_CODES)("%s's polygon area matches the sector", (code) => {
    const { sector, area } = segmentShape(code);
    const { inner, outer, gap } = sector;
    const ideal = (30 / 360) * Math.PI * (outer ** 2 - inner ** 2) - gap * (outer - inner);
    expect(Math.abs(area - ideal) / ideal).toBeLessThan(0.01);
  });

  it.each(["A", "B"])("gives the %s ring's twelve wedges the same area", (letter) => {
    const areas = CAMELOT_CODES.filter((code) => ringOf(code) === letter).map(
      (code) => segmentShape(code).area,
    );
    expect(areas).toHaveLength(12);
    expect(Math.max(...areas) - Math.min(...areas)).toBeLessThan(1e-6);
  });

  it.each(["A", "B"])("never overlaps neighbours on the %s ring, and keeps the gap", (letter) => {
    const sectors = Array.from({ length: 12 }, (_, index) =>
      sectorOf({ number: index + 1, letter: letter as "A" | "B" }),
    );
    for (let index = 0; index < 12; index++) {
      const one = sectors[index]!;
      const next = sectors[(index + 1) % 12]!;
      const onePoints = segmentShape(`${index + 1}${letter}`).points;
      const nextPoints = segmentShape(`${((index + 1) % 12) + 1}${letter}`).points;
      const grid = gridAround(onePoints);
      const overlaps: string[] = [];
      for (const [x, y] of grid) {
        if (inSector(one, x, y) && inSector(next, x, y)) overlaps.push(`${x},${y}`);
      }
      expect(overlaps, `wedge ${index + 1}`).toEqual([]);
      // The click areas (the polygons) must not overlap either.
      const shared: string[] = [];
      for (const [x, y] of grid) {
        if (inPolygon(onePoints, x, y) && inPolygon(nextPoints, x, y)) shared.push(`${x},${y}`);
      }
      expect(shared, `click areas ${index + 1}`).toEqual([]);
      // On the radial line between the two, in the middle of the ring, neither claims the point.
      const middle = (one.inner + one.outer) / 2;
      const [x, y] = sectorPoint(middle, one.end);
      expect(inSector(one, x, y)).toBe(false);
      expect(inSector(next, x, y)).toBe(false);
    }
  });

  it.each(CAMELOT_CODES)("%s's label point is in its own sector and no other", (code) => {
    const { label } = segmentShape(code);
    const x = (label.x / 100) * GRID_CELLS;
    const y = (label.y / 100) * GRID_CELLS;
    const holders = CAMELOT_CODES.filter((other) => {
      const place = parseCode(other)!;
      return inSector(sectorOf(place), x, y);
    });
    expect(holders).toEqual([code]);
  });

  it.each(CAMELOT_CODES)("%s keeps the gap straight: its edge ends sit WEDGE_GAP / 2 from the radial line", (code) => {
    const { sector, points, path } = segmentShape(code);
    // Distance from the radial line at `degrees` to a point, in units.
    const away = (degrees: number, [x, y]: readonly [number, number]) => {
      const radians = (degrees * Math.PI) / 180;
      const dx = x - GRID_CELLS / 2;
      const dy = GRID_CELLS / 2 - y;
      return Math.abs(dx * Math.cos(radians) - dy * Math.sin(radians));
    };
    const last = points.length - 1;
    // The outline runs outer arc (start to end), then inner arc (end to start).
    const half = points.length / 2;
    const ends: [number, [number, number]][] = [
      [sector.start, points[0]!],
      [sector.end, points[half - 1]!],
      [sector.end, points[half]!],
      [sector.start, points[last]!],
    ];
    const halfGap = WEDGE_GAP / 2;
    for (const [degrees, point] of ends) expect(Math.abs(away(degrees, point) - halfGap)).toBeLessThan(1e-3);
    // The path's M and L corners are the same four points.
    const corners = [...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(
      (match) => [Number(match[1]), Number(match[2])] as [number, number],
    );
    expect(corners).toHaveLength(2);
    expect(Math.abs(away(sector.start, corners[0]!) - halfGap)).toBeLessThan(1e-3);
    expect(Math.abs(away(sector.end, corners[1]!) - halfGap)).toBeLessThan(1e-3);
    expect(edgeInset(sector.inner, WEDGE_GAP)).toBeGreaterThan(edgeInset(sector.outer, WEDGE_GAP));
  });

  it("has the decided radii, gap and label places (C21)", () => {
    expect(RING_RADII.A).toEqual([6.6, 16]);
    expect(RING_RADII.B).toEqual([16.6, 23.8]);
    expect(WEDGE_GAP).toBe(0.6);
    expect(LABEL_AT).toEqual({ A: 0.62, B: 0.5 });
  });

  it("puts an A label at 62% of its ring and a B label at 50%", () => {
    const fraction = (code: string) => {
      const { sector, label } = segmentShape(code);
      const radius = Math.hypot(((label.x - 50) / 100) * GRID_CELLS, ((label.y - 50) / 100) * GRID_CELLS);
      return (radius - sector.inner) / (sector.outer - sector.inner);
    };
    for (const code of CAMELOT_CODES) {
      expect(fraction(code)).toBeCloseTo(code.endsWith("A") ? 0.62 : 0.5, 2);
    }
  });
});

describe("the counts mode's levels (PAGES-16)", () => {
  it("gives a key with no tracks no level, and any key with tracks at least the first", () => {
    expect(countLevel(0, 50)).toBe(0);
    expect(countLevel(1, 50_000)).toBe(1);
  });

  it("is darker for more, up to the last level at the biggest count", () => {
    expect(countLevel(50, 50)).toBe(COUNT_LEVEL_MIX.length - 1);
    const levels = [1, 10, 20, 30, 40, 50].map((count) => countLevel(count, 50));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBeGreaterThan(2);
  });

  it("gives no level when nothing is counted", () => {
    expect(countLevel(0, 0)).toBe(0);
  });

  it("starts unmixed and rises", () => {
    expect(COUNT_LEVEL_MIX[0]).toBe(0);
    expect([...COUNT_LEVEL_MIX]).toEqual([...COUNT_LEVEL_MIX].sort((a, b) => a - b));
  });
});

describe("the words for counts (PAGES-16)", () => {
  it("writes a count short enough for a wedge", () => {
    expect(compactCount(0)).toBe("0");
    expect(compactCount(999)).toBe("999");
    expect(compactCount(1000)).toBe("1k");
    expect(compactCount(1234)).toBe("1.2k");
    expect(compactCount(12_500)).toBe("12k");
  });

  it("says track or tracks", () => {
    expect(tracksWord(1)).toBe("1 track");
    expect(tracksWord(2)).toBe("2 tracks");
    expect(tracksWord(1234)).toBe("1,234 tracks");
  });

  it("names a key with its count, whether it is chosen and how it mixes", () => {
    expect(countedName("8A", 3, false)).toBe("8A, A minor, 3 tracks");
    expect(countedName("8A", 0, true)).toBe("8A, A minor, no tracks, chosen");
    expect(countedName("9A", 1, false, "adjacent")).toBe("9A, E minor, 1 track, mixes");
    expect(countedName("8A", 1, false, "same")).toBe("8A, A minor, 1 track, the key to mix with");
  });
});

/**
 * The Camelot wheel's places: 24 keys, their names, their pixel shapes and the
 * keyboard's moves between them (PAGES-10).
 *
 * This is drawing data. Which keys mix with a track's key is DEC-096's rule and
 * lives in the engine (`GET /api/v1/library/keys/compatible`); nothing here says
 * that 9A mixes with 8A. PAGES-16's Keys page draws on the same places.
 */

/** The wheel is drawn on a square of this many cells; a cell is a whole CSS pixel count. */
export const GRID_CELLS = 48;

const CENTER = GRID_CELLS / 2;
/** The A ring (minor keys) inside, the B ring (major keys) outside, in cells from the center. */
const RING_RADII = { A: [7, 15.5], B: [16.5, 23.5] } as const;
/** A segment's full span is 30 degrees; half of it. */
const HALF_SPAN = 15;
/** Cells whose centers lie this near (in cells) to the line between two keys stay empty: the gap. */
const GAP = 0.5;

export type Ring = "A" | "B";

export interface CamelotPlace {
  number: number;
  letter: Ring;
}

/** "1A" to "12B", A ring first. */
export const CAMELOT_CODES: readonly string[] = (["A", "B"] as const).flatMap((letter) =>
  Array.from({ length: 12 }, (_, index) => `${index + 1}${letter}`),
);

/** A code read as a place on the wheel, or null when it is not one. */
export function parseCode(code: string): CamelotPlace | null {
  const match = /^(\d{1,2})([AB])$/.exec(code);
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 && number <= 12 ? { number, letter: match[2] as Ring } : null;
}

const MINOR_NAMES = [
  "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯",
];
const MAJOR_NAMES = [
  "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E",
];

/** A key as a person says it, "A minor": the engine's `key_name`, for the 24 places. */
export function keyName(code: string): string {
  const place = parseCode(code);
  if (!place) return code;
  return place.letter === "A"
    ? `${MINOR_NAMES[place.number - 1]} minor`
    : `${MAJOR_NAMES[place.number - 1]} major`;
}

export type WheelMove = "left" | "right" | "up" | "down";

/**
 * Where an arrow key goes: round the ring with left and right (wrapping at 12),
 * to the other ring with up (B, outside) and down (A, inside) at the same number.
 */
export function moveOnRing(code: string, move: WheelMove): string {
  const place = parseCode(code);
  if (!place) return code;
  if (move === "up") return `${place.number}B`;
  if (move === "down") return `${place.number}A`;
  const step = move === "right" ? 1 : -1;
  return `${((place.number - 1 + step + 12) % 12) + 1}${place.letter}`;
}

export interface SegmentShape {
  /** The outline's corners in whole cells, clockwise; every edge is horizontal or vertical. */
  cells: [number, number][];
  /** The same outline as a CSS `polygon()` in percentages of the square. */
  polygon: string;
  /** The same outline as an SVG path in cell units, for the drawing. */
  path: string;
  /** How many cells the wedge covers. */
  count: number;
  /** Where its label sits, in percent of the square. */
  label: { x: number; y: number };
}

type Cell = readonly [number, number];
const keyOf = (x: number, y: number) => `${x},${y}`;

/** The cells of the grid whose centers lie in the wedge: this is what makes it stepped. */
function wedgeCells(place: CamelotPlace): Set<string> {
  const [inner, outer] = RING_RADII[place.letter];
  const middle = place.number * 30;
  const cells = new Set<string>();
  for (let y = 0; y < GRID_CELLS; y++) {
    for (let x = 0; x < GRID_CELLS; x++) {
      const dx = x + 0.5 - CENTER;
      const dy = y + 0.5 - CENTER;
      const radius = Math.hypot(dx, dy);
      if (radius < inner || radius >= outer) continue;
      const degrees = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      const away = Math.abs(((degrees - middle + 540) % 360) - 180);
      if (away > HALF_SPAN) continue;
      // The line between this key and its neighbor stays empty, so the panel shows through.
      if (radius * Math.sin(((HALF_SPAN - away) * Math.PI) / 180) < GAP) continue;
      cells.add(keyOf(x, y));
    }
  }
  return cells;
}

/**
 * The corners of the outline round a set of cells, clockwise, with only horizontal
 * and vertical edges between them. At a corner where two cells meet diagonally the
 * path turns right, so the wedge stays one piece.
 */
function outline(cells: ReadonlySet<string>): Cell[] {
  const has = (x: number, y: number) => cells.has(keyOf(x, y));
  const out = new Map<string, Cell[]>();
  const add = (from: Cell, to: Cell) => {
    const k = keyOf(from[0], from[1]);
    out.set(k, [...(out.get(k) ?? []), to]);
  };
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    if (!has(x, y - 1)) add([x, y], [x + 1, y]);
    if (!has(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
    if (!has(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
    if (!has(x - 1, y)) add([x, y + 1], [x, y]);
  }
  const first = [...out.keys()].sort((a, b) => {
    const [ax, ay] = a.split(",").map(Number) as [number, number];
    const [bx, by] = b.split(",").map(Number) as [number, number];
    return ay - by || ax - bx;
  })[0];
  if (first === undefined) return [];
  const start = first.split(",").map(Number) as [number, number];
  const path: Cell[] = [start];
  let at: Cell = start;
  let heading: Cell = [1, 0];
  for (let guard = 0; guard < 10_000; guard++) {
    const options = out.get(keyOf(at[0], at[1])) ?? [];
    if (options.length === 0) break;
    // Turn right when there is a choice: (dx, dy) becomes (-dy, dx) on a y-down grid.
    const right: Cell = [-heading[1], heading[0]];
    const next =
      options.find((to) => to[0] - at[0] === right[0] && to[1] - at[1] === right[1]) ?? options[0]!;
    heading = [next[0] - at[0], next[1] - at[1]];
    at = next;
    if (at[0] === start[0] && at[1] === start[1]) break;
    path.push(at);
  }
  // Keep corners only: a point on a straight run is not one.
  return path.filter((cell, index) => {
    const before = path[(index + path.length - 1) % path.length]!;
    const after = path[(index + 1) % path.length]!;
    return (cell[0] - before[0]) * (after[1] - cell[1]) !== (cell[1] - before[1]) * (after[0] - cell[0]);
  });
}

const percent = (cells: number) => Number(((cells / GRID_CELLS) * 100).toFixed(3));
const toPolygon = (corners: readonly Cell[]) =>
  `polygon(${corners.map(([x, y]) => `${percent(x)}% ${percent(y)}%`).join(", ")})`;

/**
 * One key's shape: a stepped wedge of its ring, 12 at the top and 3 on the right
 * like a clock. It is made of whole cells, so every edge is horizontal or vertical
 * and the staircase is pixel art rather than a smooth curve.
 */
export function segmentShape(code: string): SegmentShape {
  const place = parseCode(code);
  if (!place) throw new Error(`${code} is not a place on the Camelot wheel`);
  const whole = wedgeCells(place);
  const corners = outline(whole);
  const [inner, outer] = RING_RADII[place.letter];
  const radians = (place.number * 30 * Math.PI) / 180;
  const radius = (inner + outer) / 2;
  return {
    cells: corners as [number, number][],
    polygon: toPolygon(corners),
    path: `M${corners.map(([x, y]) => `${x} ${y}`).join(" L")} Z`,
    count: whole.size,
    label: {
      x: percent(CENTER + radius * Math.sin(radians)),
      y: percent(CENTER - radius * Math.cos(radians)),
    },
  };
}

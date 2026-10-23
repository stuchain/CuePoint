/**
 * The Camelot wheel's places: 24 keys, their names, their smooth sector shapes (C2) and the
 * keyboard's moves between them (PAGES-10).
 *
 * This is drawing data. Which keys mix with a track's key is DEC-096's rule and
 * lives in the engine (`GET /api/v1/library/keys/compatible`); nothing here says
 * that 9A mixes with 8A. PAGES-16's Keys page draws on the same places.
 */

import { countNoun } from "../../format/counts";
import type { KeyNotation } from "./keyNotationSetting";

/** The wheel is drawn on a square of this many units; a unit is a whole CSS pixel count. */
export const GRID_CELLS = 48;

const CENTER = GRID_CELLS / 2;
/** Each ring's inner and outer radius, in units from the center: A (minor keys) inside, B outside. */
export const RING_RADII: Readonly<Record<Ring, readonly [inner: number, outer: number]>> = {
  A: [6.6, 16],
  B: [16.6, 23.8],
};
/** Where a ring's label sits across the ring: 0 at the inner arc, 1 at the outer (C21). */
export const LABEL_AT: Readonly<Record<Ring, number>> = { A: 0.62, B: 0.5 };
/** The straight gap between two neighbouring wedges, in units (as wide everywhere). */
export const WEDGE_GAP = 0.6;
/** An arc is drawn as one SVG arc, and cut for clicks as chords this many degrees apart. */
export const ARC_STEP_DEGREES = 2;

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

/** A key as a musician writes it, "A♭m" or "B": a minor key gets an "m", a major key is plain. */
export function musicalName(code: string): string {
  const place = parseCode(code);
  if (!place) return code;
  return place.letter === "A" ? `${MINOR_NAMES[place.number - 1]}m` : MAJOR_NAMES[place.number - 1]!;
}

/** What a chip or label writes for a key (K1 to K3): the code, the musical name, or both. Display only. */
export function keyLabel(code: string, notation: KeyNotation): string {
  if (notation === "musical") return musicalName(code);
  if (notation === "both") return parseCode(code) ? `${code} · ${musicalName(code)}` : code;
  return code;
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

/** A wedge's geometry: where it sits and how wide, before any drawing. */
export interface SectorGeometry {
  /** The radii of its inner and outer arcs, in units. */
  inner: number;
  outer: number;
  /** Its edges, in degrees clockwise from 12 o'clock (`end - start` is 30). */
  start: number;
  end: number;
  /** The width of the straight gap kept between it and each neighbour, in units. */
  gap: number;
}

export interface SegmentShape {
  sector: SectorGeometry;
  /** The click polygon in units, clockwise: both arcs sampled, both ends included. */
  points: [number, number][];
  /** The same polygon as a CSS `polygon()` in percentages of the square. */
  polygon: string;
  /** The wedge as an SVG path in units: two `A` arcs and two lines, for the drawing. */
  path: string;
  /** The area of `points`, in square units. */
  area: number;
  /** Where its label sits, in percent of the square. */
  label: { x: number; y: number };
}

const radiansOf = (degrees: number) => (degrees * Math.PI) / 180;
const round3 = (value: number) => Number(value.toFixed(3));

/** The wedge of a place: 30 degrees centred on its number times 30, so 12 is at the top. */
export function sectorOf(place: CamelotPlace): SectorGeometry {
  const [inner, outer] = RING_RADII[place.letter];
  return { inner, outer, start: place.number * 30 - 15, end: place.number * 30 + 15, gap: WEDGE_GAP };
}

/** The point at a radius and an angle (degrees clockwise from 12 o'clock), in units. */
export function sectorPoint(radius: number, degrees: number): [number, number] {
  const radians = radiansOf(degrees);
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)];
}

/**
 * How many degrees an edge moves in at a radius, so that the gap between two neighbours is a
 * straight band `gap` wide: each edge sits gap/2 from the radial line, and asin(gap / 2r) is
 * the angle at which that is true at radius r.
 */
export function edgeInset(radius: number, gap: number): number {
  return (Math.asin(gap / (2 * radius)) * 180) / Math.PI;
}

/** A coordinate as the path and the polygon write it: three decimals, so they stay stable. */
const text = (value: number) => String(round3(value));
const at = ([x, y]: readonly [number, number]) => `${text(x)} ${text(y)}`;

/**
 * The wedge as an SVG path: the outer arc clockwise, a straight edge in, the inner arc back,
 * and a straight edge out. The edges are inset by `edgeInset` at each radius.
 */
export function sectorPath(s: SectorGeometry): string {
  const outerInset = edgeInset(s.outer, s.gap);
  const innerInset = edgeInset(s.inner, s.gap);
  return (
    `M${at(sectorPoint(s.outer, s.start + outerInset))} ` +
    `A${text(s.outer)} ${text(s.outer)} 0 0 1 ${at(sectorPoint(s.outer, s.end - outerInset))} ` +
    `L${at(sectorPoint(s.inner, s.end - innerInset))} ` +
    `A${text(s.inner)} ${text(s.inner)} 0 0 0 ${at(sectorPoint(s.inner, s.start + innerInset))} Z`
  );
}

/** `count` points along an arc from one angle to the other, both ends included. */
function arcPoints(radius: number, from: number, to: number, count: number): [number, number][] {
  return Array.from({ length: count + 1 }, (_, index) =>
    sectorPoint(radius, from + ((to - from) * index) / count),
  );
}

/**
 * The click polygon: the outer arc's points clockwise, then the inner arc's counter-clockwise.
 * Each arc takes as many steps as a full 30 degrees needs at `stepDegrees`, so every wedge has
 * the same number of points and no chord is longer than the step. The points are exact, not
 * rounded: only the strings round, so a point never drifts outside `inSector`.
 */
export function sectorOutline(
  s: SectorGeometry,
  stepDegrees: number = ARC_STEP_DEGREES,
): [number, number][] {
  const steps = Math.ceil((s.end - s.start) / stepDegrees);
  const outerInset = edgeInset(s.outer, s.gap);
  const innerInset = edgeInset(s.inner, s.gap);
  return [
    ...arcPoints(s.outer, s.start + outerInset, s.end - outerInset, steps),
    ...arcPoints(s.inner, s.end - innerInset, s.start + innerInset, steps),
  ];
}

/**
 * Whether a point (in units) is inside the wedge: between its two radii, and at least half the
 * gap from each edge's radial line. `epsilon` (default 0) loosens every bound a little, for
 * points that sit exactly on the boundary.
 */
export function inSector(s: SectorGeometry, x: number, y: number, epsilon = 0): boolean {
  const dx = x - CENTER;
  const dy = CENTER - y;
  const radius = Math.hypot(dx, dy);
  if (radius < s.inner - epsilon || radius > s.outer + epsilon) return false;
  const middle = (s.start + s.end) / 2;
  const away = (((Math.atan2(dx, dy) * 180) / Math.PI - middle + 540) % 360) - 180;
  const span = (s.end - s.start) / 2;
  const half = s.gap / 2 - epsilon;
  return (
    radius * Math.sin(radiansOf(span + away)) >= half &&
    radius * Math.sin(radiansOf(span - away)) >= half
  );
}

const percent = (units: number) => Number(((units / GRID_CELLS) * 100).toFixed(3));
const toPolygon = (points: readonly (readonly [number, number])[]) =>
  `polygon(${points.map(([x, y]) => `${percent(x)}% ${percent(y)}%`).join(", ")})`;

/** The area of a polygon by the shoelace sum; positive when it runs clockwise on a y-down grid. */
function areaOf(points: readonly (readonly [number, number])[]): number {
  let sum = 0;
  points.forEach(([x, y], index) => {
    const [nx, ny] = points[(index + 1) % points.length]!;
    sum += x * ny - nx * y;
  });
  return sum / 2;
}

/**
 * One key's shape: a smooth annular sector of its ring, 12 at the top and 3 on the right
 * like a clock, with an even straight gap to each neighbour.
 */
export function segmentShape(code: string): SegmentShape {
  const place = parseCode(code);
  if (!place) throw new Error(`${code} is not a place on the Camelot wheel`);
  const sector = sectorOf(place);
  const points = sectorOutline(sector);
  const radians = radiansOf(place.number * 30);
  const radius = sector.inner + (sector.outer - sector.inner) * LABEL_AT[place.letter];
  return {
    sector,
    points,
    polygon: toPolygon(points),
    path: sectorPath(sector),
    area: areaOf(points),
    label: {
      x: percent(CENTER + radius * Math.sin(radians)),
      y: percent(CENTER - radius * Math.cos(radians)),
    },
  };
}

/**
 * How much of the accent each counts level mixes into the panel's fill (PAGES-16): a key with
 * no tracks is unmixed, and the most-held key is the last. The stylesheet writes the same
 * numbers (`wheelContrast.test.ts` checks it does) and they stop at 40% because the label
 * on top, in the theme's text color, has to stay at 4.5:1 on the mix in every theme.
 */
export const COUNT_LEVEL_MIX = [0, 12, 22, 31, 40] as const;

/**
 * The same levels with Settings › Color keys on (round 9): how much of the key's own colour each
 * level mixes into the panel's fill. The first four stay light enough for the text colour at 4.5:1
 * in every theme; the last is nearly the full colour and its label turns to the dark outline colour,
 * which reads at 4.5:1 on it. wheelContrast.test.ts holds both.
 */
export const COUNT_COLOUR_MIX = [8, 14, 20, 25, 88] as const;

/**
 * The level a count draws at, from 0 (nothing) to the last: darker for more, relative to
 * the biggest count on the wheel. Any key with a track is at least level 1, so it never
 * reads as empty.
 */
export function countLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const last = COUNT_LEVEL_MIX.length - 1;
  return Math.min(last, Math.max(1, Math.ceil((count / max) * last)));
}

/** A count short enough for a wedge: 999, 1.2k, 12k. The list beside it writes the whole number. */
export function compactCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) {
    const tenths = Math.floor(count / 100) / 10;
    return `${Number.isInteger(tenths) ? tenths.toFixed(0) : tenths.toFixed(1)}k`;
  }
  return `${Math.floor(count / 1000)}k`;
}

/** "1 track", "1,234 tracks". */
export function tracksWord(count: number): string {
  return countNoun(count, "track");
}

/**
 * A key's name for assistive technology, with its count in words and whether it is chosen or
 * mixes with the key asked about. The wheel's segment and the list's row say the same thing.
 */
export function countedName(
  code: string,
  count: number,
  chosen: boolean,
  relation?: "same" | "adjacent" | "relative",
): string {
  const held = count > 0 ? tracksWord(count) : "no tracks";
  const mix = relation === "same" ? ", the key to mix with" : relation ? ", mixes" : "";
  return `${code}, ${keyName(code)}, ${held}${chosen ? ", chosen" : ""}${mix}`;
}

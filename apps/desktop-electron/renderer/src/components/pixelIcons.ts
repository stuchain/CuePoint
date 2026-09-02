/**
 * Pixel icon artwork.
 *
 * Each icon is drawn on a 12x12 grid, one character per pixel: `#` is on,
 * anything else is off. The artwork is the source of truth and is meant to be
 * edited here — you can see the icon in the diff, which is the whole point of
 * keeping it as text instead of a binary sprite sheet.
 *
 * Grids are rendered to SVG rectangles rather than a bitmap so that a single
 * drawing serves every theme: the pixels inherit `currentColor`, and the five
 * themes disagree about `--fg-primary` (from `#e0fbfc` to `#ffffff`) and about
 * accents far more strongly. A PNG would need one copy per icon per theme.
 *
 * Keep new icons legible at 1x, where a grid cell is 2 CSS pixels: avoid
 * single-pixel detail that disappears, and prefer symmetry, which reads as
 * deliberate at small sizes.
 */

export const PIXEL_GRID_SIZE = 12;

const ON = "#";

/** Play: a 45-degree triangle, the one shape every transport control shares. */
const play = [
  "............",
  "...#........",
  "...##.......",
  "...###......",
  "...####.....",
  "...#####....",
  "...#####....",
  "...####.....",
  "...###......",
  "...##.......",
  "...#........",
  "............",
];

const pause = [
  "............",
  "...##..##...",
  "...##..##...",
  "...##..##...",
  "...##..##...",
  "...##..##...",
  "...##..##...",
  "...##..##...",
  "...##..##...",
  "...##..##...",
  "...##..##...",
  "............",
];

const next = [
  "............",
  "............",
  "..#.....##..",
  "..##....##..",
  "..###...##..",
  "..####..##..",
  "..####..##..",
  "..###...##..",
  "..##....##..",
  "..#.....##..",
  "............",
  "............",
];

const previous = [
  "............",
  "............",
  "..##.....#..",
  "..##....##..",
  "..##...###..",
  "..##..####..",
  "..##..####..",
  "..##...###..",
  "..##....##..",
  "..##.....#..",
  "............",
  "............",
];

/** Home: roof over a doorway. */
const home = [
  "............",
  ".....##.....",
  "....####....",
  "...######...",
  "..########..",
  ".##########.",
  "..#......#..",
  "..#.##...#..",
  "..#.##...#..",
  "..#.##...#..",
  "..########..",
  "............",
];

/**
 * Library: records standing in a crate.
 *
 * An earlier draft drew books on a shelf, which at this size was three
 * vertical bars on a baseline — very nearly the activity icon. The crate
 * silhouette keeps the two apart, and suits a record library better.
 */
const library = [
  "............",
  "..##.##.##..",
  "..##.##.##..",
  "..##.##.##..",
  ".##########.",
  ".#........#.",
  ".#........#.",
  ".#........#.",
  ".#........#.",
  ".#........#.",
  ".##########.",
  "............",
];

/** Activity: rising bars on a baseline — a log of things that happened. */
const activity = [
  "............",
  "..........##",
  "..........##",
  "....##....##",
  "....##....##",
  "....##.##.##",
  ".##.##.##.##",
  ".##.##.##.##",
  ".##.##.##.##",
  ".##.##.##.##",
  "############",
  "............",
];

/**
 * Settings: a four-toothed gear with a square bore.
 *
 * The first attempt used a thick square body with tall side teeth and read as
 * a dumbbell rather than a gear. A rounded body with short nubs at the four
 * compass points, and a bore small enough to stay open, reads correctly.
 */
const settings = [
  ".....##.....",
  ".....##.....",
  "...######...",
  "..########..",
  "..########..",
  "#####..#####",
  "#####..#####",
  "..########..",
  "..########..",
  "...######...",
  ".....##.....",
  ".....##.....",
];

/** Export: an arrow coming down into a tray. */
const exportIcon = [
  "............",
  ".....##.....",
  ".....##.....",
  ".....##.....",
  ".....##.....",
  "..########..",
  "...######...",
  "....####....",
  ".....##.....",
  ".#........#.",
  ".##########.",
  "............",
];

/** Filter: a funnel. */
const filter = [
  "............",
  ".##########.",
  "..########..",
  "...######...",
  "....####....",
  ".....##.....",
  ".....##.....",
  ".....##.....",
  ".....##.....",
  ".....##.....",
  "............",
  "............",
];

/**
 * The icon set for v1.
 *
 * DEC-010 chose a small set: the toolbar icons, the transport shapes and the
 * navigation icons. The concept icons — clean, discover, prepare — were left as
 * Unicode glyphs "until there is a screen to draw them against"; SHELL-02's
 * sidebar became that screen, and SHELL-09 drew them.
 */
/**
 * Collections: two stacked panels, offset so the layering reads at a glance.
 * Deliberately unlike `library` (a shelf) — one is where tracks live, the
 * other is how they are grouped.
 */
const collections = [
  "............",
  "...########.",
  "...#......#.",
  "...#......#.",
  ".########.#.",
  ".#......#.#.",
  ".#......#.#.",
  ".#......###.",
  ".#......#...",
  ".########...",
  "............",
  "............",
];

/** Clean: a check. The step's whole job is metadata that has been verified. */
const clean = [
  "............",
  "............",
  "..........##",
  ".........##.",
  "........##..",
  ".##....##...",
  ".##...##....",
  "..##.##.....",
  "...####.....",
  "....##......",
  "............",
  "............",
];

/**
 * Discover: a magnifier.
 *
 * Two earlier attempts read as a letter Q, because the handle hung from the
 * bottom of the ring like a tail. It attaches at the lower-right corner and
 * runs on a clear 45-degree diagonal now, which is the difference between a
 * magnifier and a Q.
 */
const discover = [
  "............",
  "...####.....",
  "..##..##....",
  "..##..##....",
  "..##..##....",
  "...####.....",
  ".....###....",
  "......###...",
  ".......###..",
  "........###.",
  ".........##.",
  "............",
];

/**
 * Prepare: a flag planted in a set.
 *
 * The first attempt drew a cue marker over a timeline and read as mud at every
 * size — too many parts in 12x12. A flag is one shape, survives 1x, and says
 * "being built" rather than "being played".
 */
const prepare = [
  "............",
  "..##........",
  "..#########.",
  "..#########.",
  "..#########.",
  "..#########.",
  "..##........",
  "..##........",
  "..##........",
  "..##........",
  "..##........",
  "............",
];

/**
 * inKey: a quarter note. An eighth note's flag turned into a blob at 1x, and a
 * note is recognizable without one.
 */
const match = [
  "............",
  ".......##...",
  ".......##...",
  ".......##...",
  ".......##...",
  ".......##...",
  ".......##...",
  ".......##...",
  "..#######...",
  ".#########..",
  ".#########..",
  "..#######...",
];

/**
 * inCrate: records standing in a crate. The first attempt was a plain box with
 * a slot, which read as a minus sign; the dividers are what make it a crate.
 */
const incrate = [
  "............",
  "............",
  "############",
  "#..........#",
  "#.##.##.##.#",
  "#.##.##.##.#",
  "#.##.##.##.#",
  "#.##.##.##.#",
  "#..........#",
  "############",
  "............",
  "............",
];

export const PIXEL_ICONS = {
  play,
  pause,
  next,
  previous,
  home,
  library,
  activity,
  settings,
  export: exportIcon,
  filter,
  // SHELL-09: the concept icons FOUNDATION-14 deferred "until there is a
  // screen to draw them against". The sidebar is that screen.
  collections,
  clean,
  discover,
  prepare,
  match,
  incrate,
} as const satisfies Record<string, readonly string[]>;

export type PixelIconName = keyof typeof PIXEL_ICONS;

export const PIXEL_ICON_NAMES = Object.keys(PIXEL_ICONS) as PixelIconName[];

/** A horizontal run of lit pixels, collapsed into one rectangle. */
export interface PixelRun {
  x: number;
  y: number;
  width: number;
}

/**
 * Collapse a grid into horizontal runs.
 *
 * A rectangle per lit pixel would be up to 144 DOM nodes per icon; merging
 * runs typically cuts that by an order of magnitude, which matters once icons
 * appear in list rows.
 */
export function toPixelRuns(grid: readonly string[]): PixelRun[] {
  const runs: PixelRun[] = [];

  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== ON) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x] === ON) {
        x += 1;
      }
      runs.push({ x: start, y, width: x - start });
    }
  });

  return runs;
}

const runCache = new Map<PixelIconName, PixelRun[]>();

/** Runs for a named icon. The artwork is static, so this is computed once. */
export function pixelRunsFor(name: PixelIconName): PixelRun[] {
  let runs = runCache.get(name);
  if (!runs) {
    runs = toPixelRuns(PIXEL_ICONS[name]);
    runCache.set(name, runs);
  }
  return runs;
}

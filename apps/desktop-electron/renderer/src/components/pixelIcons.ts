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
 * The icon set built for v1, per DEC-010: the three icons the toolbar already
 * shows, the four transport shapes, and three navigation icons. Concept icons
 * whose meaning is still being designed (clean, discover, prepare) stay as
 * Unicode glyphs until there is a screen to draw them against.
 */
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

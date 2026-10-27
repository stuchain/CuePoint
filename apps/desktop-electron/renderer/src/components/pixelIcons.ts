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
/**
 * Volume: a speaker cone with two waves (PLAYER-06).
 *
 * The waves are what separate it from `volume-muted` at a glance; the cone
 * alone reads as "speaker", not as "sound is on".
 */
const volume = [
  "............",
  "........#...",
  ".....#...#..",
  "...###.#..#.",
  "..####.#..#.",
  "..####.#.#..",
  "..####.#.#..",
  "..####.#..#.",
  "...###.#..#.",
  ".....#...#..",
  "........#...",
  "............",
];

/** Muted: the same cone, crossed out. */
const volumeMuted = [
  "............",
  "............",
  ".....#......",
  "...###..#.#.",
  "..####...#..",
  "..####....#.",
  "..####...#..",
  "..####..#.#.",
  "...###......",
  ".....#......",
  "............",
  "............",
];

/** Queue: stacked lines, the list the player is working through (PLAYER-08); rows 2-9 (M31). */
const queue = [
  "............",
  "............",
  "..##.######.",
  "..##.######.",
  "............",
  "..##.######.",
  "..##.######.",
  "............",
  "..##.######.",
  "..##.######.",
  "............",
  "............",
];

/** Waveform: vertical bars of varying height, the zoomed strip on the player bar (C30). */
const waveform = [
  "............",
  ".......##...",
  "...##..##...",
  "...##..##.##",
  "##.##..##.##",
  "##.##..##.##",
  "##.##..##.##",
  "##.##..##.##",
  "...##..##.##",
  "...##..##...",
  ".......##...",
  "............",
];

/** Shuffle: two paths crossing, with tips on the right (PLAYER-07). */
const shuffle = [
  "............",
  "..##.....##.",
  "...##...###.",
  "....##.##.#.",
  ".....###....",
  "......#.....",
  ".....###....",
  "....##.##.#.",
  "...##...###.",
  "..##.....##.",
  "............",
  "............",
];

/**
 * Repeat: a loop with an arrow, rows 1-10 so it sits level with shuffle and waveform (M31).
 *
 * Repeat has three states and DEC-052 asks for three *visually distinct* ones
 * rather than two and a badge, so `repeat-one` is its own drawing rather than
 * this glyph with a dot added. The icon test refuses duplicate artwork, which
 * is that rule made mechanical.
 */
const repeat = [
  "............",
  ".......#....",
  ".......##...",
  "..########..",
  "..#....###..",
  "..#....#.#..",
  "..#......#..",
  "..#......#..",
  "..#......#..",
  "..#......#..",
  "..########..",
  "............",
];

/** Repeat one: the same loop around a numeral 1. */
const repeatOne = [
  "............",
  ".......#....",
  ".......##...",
  "..########..",
  "..#....###..",
  "..#..#.#.#..",
  "..#.##...#..",
  "..#..#...#..",
  "..#.###..#..",
  "..#......#..",
  "..########..",
  "............",
];

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

/** Activity: a clock face, what happened and when (M32); the bar chart is Statistics. */
const activity = [
  "............",
  "...######...",
  "..##....##..",
  ".##......##.",
  ".#...#....#.",
  ".#...#....#.",
  ".#...###..#.",
  ".#........#.",
  ".##......##.",
  "..##....##..",
  "...######...",
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
 * Discover: a gem (C229). A diamond with a spark inside, "something to find". It is not a magnifier
 * on purpose: the sidebar's Search button wears `search`, and in the rail the two would read as one.
 */
const discover = [
  "............",
  ".....##.....",
  "....####....",
  "...##..##...",
  "..##....##..",
  ".##..##..##.",
  ".##..##..##.",
  "..##....##..",
  "...##..##...",
  "....####....",
  ".....##.....",
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
 * Statistics: three bars of rising height on a baseline (STATS-04).
 */
const statistics = [
  "............",
  "............",
  "........##..",
  "........##..",
  "....##..##..",
  "....##..##..",
  "....##..##..",
  "##..##..##..",
  "##..##..##..",
  "##..##..##..",
  "############",
  "............",
];

/**
 * Matching: a quarter note. An eighth note's flag turned into a blob at 1x, and
 * a note is recognizable without one. Drawn for inKey's sidebar entry, which
 * retired into Clean (DEC-071); kept in the set as the matching glyph.
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
 * Folder: the classic tab-and-body shape (LIBUI-07).
 *
 * Drawn now for the same reason SHELL-09 drew the concept icons — there is a
 * screen to draw it against. The playlist pane needs to tell a folder from a
 * playlist at a glance, at 1x, where a grid cell is two CSS pixels.
 */
const folder = [
  "............",
  "............",
  ".####.......",
  ".#..#.......",
  ".##########.",
  ".#........#.",
  ".#........#.",
  ".#........#.",
  ".#........#.",
  ".##########.",
  "............",
  "............",
];

/** Playlist: lines with a marker, the shape a set list has on every deck. */
const playlist = [
  "............",
  "............",
  ".##.######..",
  ".##.######..",
  "............",
  ".##.######..",
  ".##.######..",
  "............",
  ".##.######..",
  ".##.######..",
  "............",
  "............",
];

/**
 * Smart collection: the filter funnel with a spark beside it (ORG-09).
 *
 * Deliberately the same funnel `filter` draws, because that is what a Smart
 * Collection *is* — DEC-043's rule set, saved. The spark is what says it was
 * saved rather than typed, and it is what tells the row apart from a plain
 * Collection at a glance, at 1x, where a grid cell is two CSS pixels.
 */
const smart = [
  "............",
  "............",
  ".########...",
  "..######....",
  "...####..##.",
  "....##..####",
  "....##...##.",
  "....##......",
  "....##......",
  "...####.....",
  "............",
  "............",
];

/**
 * Tag: the luggage-tag shape — a body cut to a point, with the hole the
 * string goes through (ORG-09, ORG-10).
 *
 * The hole is what makes it a tag rather than an arrow at this size, so it is
 * two cells of nothing inside a body that is otherwise solid.
 */
const tag = [
  "............",
  "............",
  "..#########.",
  ".##.......#.",
  "##..##....#.",
  "#...##....#.",
  "##........#.",
  ".##.......#.",
  "..#########.",
  "............",
  "............",
  "............",
];


/** Close: a diagonal cross, for dismissing and removing (BAR-8). */
const close = [
  "............",
  "............",
  "..##....##..",
  "...##..##...",
  "....####....",
  ".....##.....",
  ".....##.....",
  "....####....",
  "...##..##...",
  "..##....##..",
  "............",
  "............",
];


/**
 * The brand (HDR-6): a cue point, the marker a DJ drops on a track — a pin whose head is
 * a filled circle over a short stem, standing on a baseline.
 */
const logo = [
  "............",
  "....####....",
  "...######...",
  "..########..",
  "..########..",
  "..########..",
  "...######...",
  "....####....",
  ".....##.....",
  ".....##.....",
  "..########..",
  "............",
];

/** A magnifier, for the sidebar's Search button (K8): a ring and its handle running down to the right. */
const search = [
  "............",
  "..#####.....",
  ".##...##....",
  ".#.....#....",
  ".#.....#....",
  ".#.....#....",
  ".##...##....",
  "..#####.....",
  "......###...",
  ".......###..",
  "........###.",
  "............",
];

/** A key, for the Keys page (PAGES-16): a ring head and a toothed shaft. */
const keys = [
  "............",
  "..####......",
  ".#....#.....",
  ".#....#.....",
  ".#....#.....",
  "..####......",
  "....##......",
  "....##......",
  "....#####...",
  "....##......",
  "....#####...",
  "............",
];


/**
 * The one chevron (M44, D3): two cells thick, six rows, centred. Right is drawn; left is its mirror
 * and down its transpose, so the three always agree. The sidebar toggle, the "Open in Library"
 * link, the trail, selects and tree twisties all draw this one.
 */
const chevronRight = [
  "............",
  "............",
  "............",
  "....##......",
  ".....##.....",
  "......##....",
  "......##....",
  ".....##.....",
  "....##......",
  "............",
  "............",
  "............",
];
const chevronLeft = chevronRight.map((row) => [...row].reverse().join(""));
const chevronDown = chevronRight[0]!.split("").map((_, c) => chevronRight.map((row) => row[c]).join(""));

/** Plus: a bar across a bar, for "New" and "Add" (M24). */
const plus = [
  "............",
  "............",
  "............",
  ".....##.....",
  ".....##.....",
  "..########..",
  "..########..",
  ".....##.....",
  ".....##.....",
  "............",
  "............",
  "............",
];

/** Calendar: a month page with its two rings, for a date field's button (M39). */
const calendar = [
  "............",
  "..##....##..",
  ".##########.",
  ".##########.",
  ".#........#.",
  ".#.##.##..#.",
  ".#.##.##..#.",
  ".#........#.",
  ".#.##.##..#.",
  ".#.##.##..#.",
  ".##########.",
  "............",
];

const arrowUp = [
  "............",
  ".....##.....",
  "....####....",
  "...######...",
  "..########..",
  ".....##.....",
  ".....##.....",
  ".....##.....",
  ".....##.....",
  ".....##.....",
  ".....##.....",
  "............",
];

const arrowDown = [...arrowUp].reverse();

const edit = [
  "............",
  "........##..",
  ".......####.",
  "......####..",
  ".....####...",
  "....####....",
  "...####.....",
  "..####......",
  ".####.......",
  ".###........",
  ".##.........",
  "............",
];

// K21: the table header's Columns… button, three columns side by side.
const columns = [
  "............",
  "............",
  ".###.##.###.",
  ".#.#.##.#.#.",
  ".#.#.##.#.#.",
  ".#.#.##.#.#.",
  ".#.#.##.#.#.",
  ".#.#.##.#.#.",
  ".#.#.##.#.#.",
  ".###.##.###.",
  "............",
  "............",
];

// Icons with one meaning each (area 48): × only closes, so removing, moving and "after" get their own.
const remove = [
  "............",
  "....####....",
  "..########..",
  "............",
  "..########..",
  "..#.#..#.#..",
  "..#.#..#.#..",
  "..#.#..#.#..",
  "..#.#..#.#..",
  "..########..",
  "............",
  "............",
];

const move = [
  "............",
  ".....##.....",
  "....####....",
  ".....##.....",
  ".#...##...#.",
  "##.######.##",
  "##.######.##",
  ".#...##...#.",
  ".....##.....",
  "....####....",
  ".....##.....",
  "............",
];

// Repeat-after: an arrow running into a bar, "carry on after this one".
const repeatAfter = [
  "............",
  "............",
  ".........##.",
  ".....#...##.",
  "......#..##.",
  ".#######.##.",
  "......#..##.",
  ".....#...##.",
  ".........##.",
  "............",
  "............",
  "............",
];

// The Details toggle: a window with its right-hand panel filled.
const panelRight = [
  "............",
  ".##########.",
  ".#......###.",
  ".#......###.",
  ".#......###.",
  ".#......###.",
  ".#......###.",
  ".#......###.",
  ".#......###.",
  ".#......###.",
  ".##########.",
  "............",
];

/** Check: the tick the checkbox draws, for a state that is done or fine. */
const check = [
  "............",
  "............",
  "..........##",
  ".........##.",
  "........##..",
  ".##....##...",
  ".##...##....",
  "..#####.....",
  "...####.....",
  "....##......",
  "............",
  "............",
];

/** Warning: a triangle with a bar and a point, for something that needs a look. */
const warning = [
  "............",
  ".....##.....",
  "....####....",
  "....####....",
  "...##..##...",
  "...##..##...",
  "..###..###..",
  "..###..###..",
  ".####..####.",
  ".##########.",
  ".####..####.",
  "............",
];

/** Star, filled: a favourite. */
const star = [
  "............",
  ".....##.....",
  ".....##.....",
  "....####....",
  "###########.",
  ".#########..",
  "..#######...",
  "..#######...",
  ".####.####..",
  ".###...###..",
  ".##.....##..",
  "............",
];

/** Star, outline: not a favourite. */
const starOutline = [
  "............",
  ".....##.....",
  ".....##.....",
  "....#..#....",
  "###########.",
  ".#.......#..",
  "..#.....#...",
  "..#.....#...",
  ".#..###..#..",
  ".#.##.##.#..",
  ".##.....##..",
  "............",
];

/** Heart, filled: loved. */
const heart = [
  "............",
  "............",
  "..###..###..",
  ".####.####..",
  ".#########..",
  ".#########..",
  ".#########..",
  "..#######...",
  "...#####....",
  "....###.....",
  ".....#......",
  "............",
];

/** Heart, outline: not loved. */
const heartOutline = [
  "............",
  "............",
  "..###..###..",
  ".#...##...#.",
  ".#........#.",
  ".#........#.",
  ".#........#.",
  "..#......#..",
  "...#....#...",
  "....#..#....",
  ".....##.....",
  "............",
];

/** Grip: six dots to take hold of a row and drag it. */
const grip = [
  "............",
  "............",
  "...##..##...",
  "...##..##...",
  "............",
  "...##..##...",
  "...##..##...",
  "............",
  "...##..##...",
  "...##..##...",
  "............",
  "............",
];

/** A solid square: a state that is on or full. */
const dotFilled = [
  "............",
  "............",
  "............",
  "...######...",
  "...######...",
  "...######...",
  "...######...",
  "...######...",
  "...######...",
  "............",
  "............",
  "............",
];

/** A square half filled: a state that is partly on. */
const dotHalf = [
  "............",
  "............",
  "..########..",
  "..###....#..",
  "..###....#..",
  "..###....#..",
  "..###....#..",
  "..###....#..",
  "..###....#..",
  "..########..",
  "............",
  "............",
];

/** Refresh: an arrow chasing its tail, for check again. */
const refresh = [
  "............",
  "...####.#...",
  "..##..####..",
  ".##.....##..",
  ".#.......#..",
  ".#.......#..",
  ".#.......#..",
  "..#.....##..",
  "..##..###...",
  "...####.....",
  "............",
  "............",
];


/** More: three dots in a row, the button that opens a row's other actions. */
const more = [
  "............",
  "............",
  "............",
  "............",
  "............",
  ".##..##..##.",
  ".##..##..##.",
  "............",
  "............",
  "............",
  "............",
  "............",
];

export const PIXEL_ICONS = {
  play,
  pause,
  next,
  previous,
  volume,
  "volume-muted": volumeMuted,
  shuffle,
  repeat,
  "repeat-one": repeatOne,
  queue,
  waveform,
  home,
  library,
  activity,
  settings,
  export: exportIcon,
  filter,
  // SHELL-09: the concept icons FOUNDATION-14 deferred "until there is a
  // screen to draw them against". The sidebar is that screen.
  collections,
  keys,
  clean,
  discover,
  prepare,
  statistics,
  match,
  // LIBUI-07: the playlist pane tells a folder from a set list at a glance.
  folder,
  playlist,
  // ORG-09: CuePoint's own tree needs a saved question to look like one, and
  // ORG-10's chips need a tag to look like a tag. Both are recurring and
  // high-visibility, which is DEC-010's rule for drawing one rather than
  // borrowing a glyph.
  smart,
  tag,
  // NAV-2, HDR-6: the sidebar's toggle and its brand.
  "chevron-left": chevronLeft,
  "chevron-right": chevronRight,
  "chevron-down": chevronDown,
  "arrow-up": arrowUp,
  "arrow-down": arrowDown,
  // The same drawing as chevron-right (M44): kept as a name until Tabs and the Library trail say chevron-right.
  "chevron-right-sm": chevronRight,
  plus,
  calendar,
  edit,
  columns,
  close,
  remove,
  move,
  "repeat-after": repeatAfter,
  "panel-right": panelRight,
  logo,
  // K8: the sidebar's Search button.
  search,
  // C138: drawn marks in place of the typed glyphs (✓ ⚠ ★ ♥ ⠿ ● ◐ and the refresh arrow).
  check,
  warning,
  star,
  "star-outline": starOutline,
  heart,
  "heart-outline": heartOutline,
  grip,
  "dot-filled": dotFilled,
  "dot-half": dotHalf,
  refresh,
  more,
} as const satisfies Record<string, readonly string[]>;

/** Names that draw the same art as another on purpose (the duplicate-artwork test lets them). */
export const PIXEL_ICON_ALIASES: readonly PixelIconName[] = ["chevron-right-sm"];

export type PixelIconName = keyof typeof PIXEL_ICONS;

export const PIXEL_ICON_NAMES = Object.keys(PIXEL_ICONS) as PixelIconName[];

/** A horizontal run of lit pixels, collapsed into one rectangle. */
interface PixelRun {
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

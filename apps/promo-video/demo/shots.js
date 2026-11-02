// The LinkedIn demo: what each shot shows, how long it lasts and where the camera looks.
// Lengths are whole bars of the music (130 BPM, a bar is 1.846 s) so every cut lands on a bar.
export const FPS = 30;
export const BAR = (60 / 130) * 4;
export const FORMATS = { portrait: { width: 1080, height: 1350 }, wide: { width: 1920, height: 1080 }, tall: { width: 1080, height: 1920 } };

/** Seconds two shots dissolve into each other, and the frames each shot plays on under that dissolve. */
export const SHOT_FADE = 0.45;
export const TAIL = Math.round(SHOT_FADE * FPS);
/** Seconds a speed change ramps over (a wait never jumps to its faster pace, it eases there and back). */
export const RAMP = 0.5;
/** The fastest a wait may run. */
export const MAX_FAST = 3;

/**
 * Three openings, picked with ?opening=a|b|c: a pull back from the live app (3 bars), a logo build (3 bars),
 * or the problem first (4 bars). Each runs 0.2 s plus whole bars so that, with the music starting at 1:58,
 * every cut after it lands on a bar of the track. The end card is the same for all three.
 */
export const OPENINGS = { a: { bars: 3 }, b: { bars: 3 }, c: { bars: 4 } };
export const END = { seconds: 3 * BAR };

/**
 * Camera views. Every zoom is a rectangle of the 1280 x 800 window whose top and bottom land on a seam of the
 * interface (the header divider at 112, the player bar at 703, the status bar at 762, a row boundary, or the
 * empty space under a dialog) so no waveform, strip, tab row or table row is ever sliced by the frame's edge;
 * the sides land on column gaps or the window edge. `view(s, x0, y0, x1, y1)` turns such a rectangle into a
 * keyframe [s, x, y, zoom]: the zoom comes from the height, the rectangle's centre is kept centred.
 */
const view = (s, x0, y0, x1, y1) => [s, (x0 + x1) / 2, (y0 + y1) / 2, 800 / (y1 - y0)];
/** The whole window. */
const FULL = (s) => [s, 640, 400, 1];
/** A lean-in: the page without the icon rail and the status bar (5 %). */
const RAIL = (s) => view(s, 62, 0, 1280, 762);
/** Library: the table from the header divider to a row boundary; then, with Track details open, both. */
const LIB_TABLE = (s) => view(s, 488, 112, 1280, 607);
const LIB_DETAILS = (s) => view(s, 415, 91, 1280, 632);
/** Clean: the review table from the breadcrumb down to the player bar, Check the match whole. */
const CLEAN_MATCH = (s) => view(s, 451, 185, 1280, 703);
/** Keys: the wheel and the tracks it lists, down to the player bar. */
const WHEEL = (s) => view(s, 328, 108, 1280, 703);
/** Settings: the section (the section list left of it stays out) down to the player bar. */
const SECTION = (s) => view(s, 335, 112, 1280, 703);
/** Sync to files: the dialog with air around it; the second view is the slow push-in. */
const SYNC_DIALOG = (s) => view(s, 140, 0, 1140, 625);
const SYNC_DIALOG_IN = (s) => view(s, 152, 0, 1128, 610);
/** Export to Rekordbox: the dialog, both bottoms on a (dimmed) row boundary. */
const EXPORT_DIALOG = (s) => view(s, 181, 0, 1098, 573);
const EXPORT_DIALOG_IN = (s) => view(s, 209, 0, 1071, 539);

/**
 * The 30 s story edit (?edit=story, --edit=story): a 2-bar problem opening with the lines on half beats, five
 * shots cut from the same clips (Clean, Discover, Prepare, Keys, Export) and a 2-bar end card: 16 bars, 29.7 s.
 */
export const STORY = {
  openBars: 2,
  endBars: 2,
  shots: [
    { id: "clean", bars: 4, span: [4.0, 18.4], keep: [[4.0, 4.9], [12.5, 13.1], [14.3, 15.0], [17.3, 18.3]],
      cam: [FULL(0), FULL(6.3), CLEAN_MATCH(7.9)] },
    { id: "discover", bars: 2, span: [3.3, 8.0], keep: [[3.4, 4.2], [4.9, 5.4], [7.3, 8.0]],
      cam: [FULL(0), FULL(0.6), RAIL(3.2)] },
    { id: "prepare", bars: 2, span: [3.0, 8.3], keep: [[3.3, 3.9], [5.4, 6.0], [7.5, 8.1]],
      cam: [FULL(0), FULL(0.6), RAIL(3.2)] },
    { id: "keys", bars: 2, span: [0.8, 5.3], keep: [[1.2, 1.9], [3.6, 4.6]],
      cam: [FULL(0), FULL(0.3), WHEEL(2.1)] },
    { id: "export", bars: 2, span: [0.8, 7.4], keep: [[0.9, 1.4], [5.9, 7.4]],
      cam: [FULL(0), FULL(1.0), EXPORT_DIALOG(2.6), EXPORT_DIALOG_IN(4.2)] },
  ],
};

/**
 * Each shot: the raw clip (`<id>.mkv` from e2e/capture/demo.spec.ts), the stretch of it used (`span`, clip
 * seconds) and the moments that must play at normal speed (`keep`, clip seconds: the clicks, the typing, the
 * things appearing). Everything between the kept moments (the pointer travelling, the app loading) runs faster,
 * up to MAX_FAST, easing there and back over RAMP seconds, by exactly the factor that makes the span fill the
 * slot plus the dissolve tail. Nothing is cut, so nothing ever jumps. `cam` is camera keyframes
 * [shot seconds, x, y, zoom] (see the views above) with x/y the point of the 1280 x 800 window kept centred;
 * moves take at least 1.6 s and are framed so whatever the shot is about stays wholly in view.
 */
export const SHOTS = [
  {
    id: "library", chip: "Library", caption: "Your whole Rekordbox library", bars: 4,
    span: [0.3, 10.87], keep: [[1.2, 3.4], [4.8, 5.4], [7.6, 8.6]],
    cam: [FULL(0), FULL(0.6), LIB_TABLE(2.2), LIB_TABLE(4.4), LIB_DETAILS(6.0)],
    // with opening A the title sits on the scroll and the search; the slot opens on the result and the details
    camA: [LIB_TABLE(0), LIB_TABLE(1.6), LIB_DETAILS(3.4)],
  },
  {
    id: "player", chip: "Player", caption: "Listen without leaving", bars: 4,
    span: [0.8, 10.77], keep: [[1.3, 2.4], [4.0, 4.8], [7.0, 8.0]],
    cam: [FULL(0), FULL(1.4), RAIL(4.0)],
  },
  {
    id: "clean", chip: "Clean", caption: "Fix keys, BPM and tags from Beatport", bars: 7,
    span: [1.0, 21.9], keep: [[1.1, 4.2], [8.5, 10.1], [12.5, 13.1], [14.3, 15.0], [17.3, 18.3], [21.0, 21.6]],
    cam: [FULL(0), FULL(9.7), CLEAN_MATCH(11.3)],
  },
  {
    id: "discover", chip: "Discover", caption: "Dig the charts for new music", bars: 4,
    span: [0.5, 10.0], keep: [[0.8, 5.2], [6.5, 7.4]],
    cam: [FULL(0), FULL(1.2), RAIL(3.8)],
  },
  {
    id: "prepare", chip: "Prepare", caption: "Plan your set, see every transition", bars: 4,
    span: [0.8, 11.0], keep: [[1.2, 1.8], [3.3, 3.9], [5.4, 6.0], [7.5, 8.1], [9.6, 10.3]],
    cam: [FULL(0), FULL(0.8), RAIL(3.4)],
  },
  {
    id: "keys", chip: "Keys", caption: "Find tracks that mix", bars: 3,
    span: [0.3, 7.77], keep: [[0.4, 1.9], [4.4, 5.2]],
    cam: [FULL(0), FULL(0.4), WHEEL(2.2)],
  },
  {
    id: "statistics", chip: "Statistics", caption: "Know your library", bars: 3,
    span: [0.3, 8.17], keep: [[2.2, 3.2], [4.6, 5.4]],
    cam: [FULL(0), FULL(1.4), RAIL(4.4)],
  },
  {
    id: "save", chip: "Save to files", caption: "Write the fixes into your music files", bars: 3,
    span: [1.0, 9.0], keep: [[1.6, 2.4], [4.0, 4.6], [5.3, 6.8]],
    cam: [FULL(0), FULL(1.3), SYNC_DIALOG(2.9), SYNC_DIALOG_IN(5.5)],
  },
  {
    id: "export", chip: "Export", caption: "Straight back to Rekordbox", bars: 3,
    span: [0.5, 9.0], keep: [[1.0, 1.8], [3.3, 3.8], [5.0, 6.0]],
    cam: [FULL(0), FULL(1.3), EXPORT_DIALOG(2.9), EXPORT_DIALOG_IN(5.5)],
  },
  {
    id: "settings", chip: "Themes", caption: "Make it yours", bars: 4,
    span: [0.9, 13.0], keep: [[1.3, 1.9], [3.8, 4.4], [6.2, 6.8], [8.6, 9.2], [11.1, 11.7]],
    cam: [FULL(0), FULL(2.2), SECTION(3.8)],
  },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * k * (k * (k * 6 - 15) + 10);
};

/**
 * The speed map of a shot: output seconds (0 at the slot's start, negative during a lead-in) to clip seconds.
 * `need` is the output length the span must fill (lead + slot + tail); the fast factor is solved for it. If the
 * span is shorter than that even at normal speed, it plays at normal speed and holds its last frame.
 */
export function speedMap(shot, need, lead = 0) {
  const [from, to] = shot.span;
  const keep = [...shot.keep, ...(lead ? [[from, from + lead]] : [])];
  const STEP = 1 / 600;
  // w(u): 0 inside a kept moment, 1 well outside, easing over RAMP seconds at each edge
  const w = (u) => {
    let v = 1;
    for (const [a, b] of keep) {
      const d = u < a ? a - u : u > b ? u - b : 0;
      v = Math.min(v, smooth(d / RAMP));
    }
    return v;
  };
  const integrate = (F) => {
    let o = 0;
    for (let u = from; u < to; u += STEP) o += STEP / (1 + (F - 1) * w(u));
    return o;
  };
  let F = 1;
  if (integrate(1) > need) {
    let lo = 1;
    let hi = MAX_FAST;
    for (let i = 0; i < 30; i++) {
      F = (lo + hi) / 2;
      if (integrate(F) > need) lo = F;
      else hi = F;
    }
    F = hi;
  }
  // tables both ways
  const src = [from];
  const out = [0];
  let o = 0;
  for (let u = from; u < to; u += STEP) {
    o += STEP / (1 + (F - 1) * w(u));
    src.push(Math.min(to, u + STEP));
    out.push(o);
  }
  const lookup = (xs, ys, x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (xs[m] <= x) lo = m;
      else hi = m;
    }
    const k = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + (ys[hi] - ys[lo]) * k;
  };
  return {
    F,
    length: o,
    short: Math.max(0, need - o),
    toClip: (outSec) => lookup(out, src, outSec + lead),
    toOut: (clipSec) => lookup(src, out, clipSec) - lead,
  };
}

/** Lay the timeline out for one opening: slot lengths, each shot's speed map, the camera in output seconds. */
export function layout(opening = "a", edit = "full") {
  const story = edit === "story";
  const open = story ? { bars: STORY.openBars } : (OPENINGS[opening] ?? OPENINGS.a);
  const OPEN = { seconds: 0.2 + open.bars * BAR, bars: open.bars };
  const END_ = { seconds: (story ? STORY.endBars : 3) * BAR };
  const shots = story
    ? STORY.shots.map((o) => ({ ...SHOTS.find((s) => s.id === o.id), ...o }))
    : SHOTS.map((s) => ({ ...s }));
  if (opening === "a" && !story) {
    // the opening is the Library itself, live, full-frame: its clip starts under the title and runs on
    shots[0].span = [0, shots[0].span[1]];
    shots[0].bars = 3;
    shots[0].lead = OPEN.seconds;
  }
  // every slot starts on the frame nearest its bar line, counted from the opening so rounding never accumulates
  OPEN.seconds = Math.round(OPEN.seconds * FPS) / FPS;
  let bars = 0;
  let f0 = Math.round(OPEN.seconds * FPS);
  for (const s of shots) {
    bars += s.bars;
    const f1 = Math.round((0.2 + (open.bars + bars) * BAR) * FPS);
    s.frames = f1 - f0;
    s.lead = s.lead ?? 0;
    s.start = f0 / FPS;
    s.dur = s.frames / FPS;
    s.map = speedMap(s, s.lead + s.dur + SHOT_FADE, s.lead);
    f0 = f1;
  }
  const endStart = f0 / FPS;
  return { OPEN, END: END_, shots, endStart, duration: endStart + END_.seconds };
}

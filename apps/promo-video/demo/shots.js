// The LinkedIn demo: what each shot shows, how long it lasts and where the camera looks.
// Lengths are whole bars of the music (130 BPM, a bar is 1.846 s, unless the edit names another tempo) so every
// cut lands on a bar.
export const FPS = 30;
export const BPM = 130;
export const BAR = (60 / BPM) * 4;
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
/** The page with the status bar off (5 %), the icon rail kept: for a page whose first click sits by the rail. */
const PAGE = (s) => view(s, 0, 0, 1280, 762);
/** Library: the search row and the table down to a row boundary; the table alone; then, with Track details open, both. */
const LIB_SEARCH = (s) => view(s, 488, 91, 1280, 607);
const LIB_TABLE = (s) => view(s, 488, 112, 1280, 607);
const LIB_DETAILS = (s) => view(s, 415, 91, 1280, 632);
/** Clean: the review table from the breadcrumb down to the player bar, Check the match whole. */
const CLEAN_MATCH = (s) => view(s, 451, 185, 1280, 703);
/** Discover: the New dig panel, header divider to player bar, the genre list and Start dig whole. */
const DIG = (s) => view(s, 205, 112, 1140, 703);
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
 * The 60 s LinkedIn cut (?edit=short, --edit=short): a 3-bar problem opening with the lines on beats, all ten
 * features and a 2-bar end card: 31 bars, 57.4 s. Its pace rule: a click is kept 0.4 s ([click - 0.1, click + 0.3]),
 * typing and a result a little longer; every wait between two kept moments runs at least `pace` times faster and
 * never rests more than `hold` seconds on screen (a long wait runs faster still, up to `maxFast`); the rest after
 * a shot's last moment runs at the shot's solved pace. Shots dissolve over `fade` seconds. The camera opens on
 * the whole window (or a 5 % lean-in) and moves (`move` seconds) on the click that opens what it moves to: `cam` is
 * [{ view }, { at: clip seconds of that click, view }, ...]; layout() turns it into keyframes.
 */
export const SHORT = {
  openBars: 3,
  endBars: 2,
  fade: 0.6,
  pace: 2.2,
  hold: 0.55,
  maxFast: 4,
  ramp: 0.35,
  move: 1.0,
  shots: [
    { id: "library", bars: 3, span: [0.3, 10.87], keep: [[4.4, 5.5], [7.5, 7.9]],
      cam: [{ view: RAIL }, { at: 4.5, view: LIB_SEARCH }, { at: 7.6, view: LIB_DETAILS }] },
    { id: "player", bars: 2, span: [0.8, 8.6], keep: [[1.2, 1.7], [4.7, 5.1], [7.2, 7.6]],
      cam: [{ view: RAIL }] },
    { id: "clean", bars: 6, span: [1.0, 22.5], keep: [[1.4, 1.8], [3.0, 3.4], [4.3, 4.7], [5.3, 5.7], [8.65, 9.05], [9.95, 10.35], [12.1, 12.5], [14.05, 14.45], [17.85, 18.25], [21.05, 21.45]],
      cam: [{ view: PAGE }, { at: 14.15, view: CLEAN_MATCH }] },
    { id: "discover", bars: 3, span: [1.4, 10.4], keep: [[2.6, 3.0], [3.8, 4.2], [4.85, 5.25], [5.5, 6.2], [8.0, 8.7]],
      cam: [{ view: RAIL }, { at: 2.7, view: DIG }, { at: 4.95, view: RAIL }] },
    { id: "prepare", bars: 3, span: [0.8, 10.6], keep: [[1.4, 1.95], [3.4, 3.95], [5.6, 6.15], [7.6, 8.15], [9.8, 10.35]],
      cam: [{ view: RAIL }] },
    { id: "keys", bars: 1, span: [0.7, 7.0], keep: [[1.2, 1.6], [4.5, 4.9]],
      cam: [{ view: RAIL }, { at: 1.3, view: WHEEL }] },
    { id: "statistics", bars: 2, span: [2.2, 7.6], keep: [[2.4, 3.4], [4.7, 5.1]],
      cam: [{ view: RAIL }] },
    { id: "save", bars: 2, span: [1.5, 9.0], keep: [[1.9, 2.3], [3.9, 4.3], [5.9, 6.3], [7.0, 7.4]],
      cam: [{ view: RAIL }, { at: 2.0, view: SYNC_DIALOG }, { at: 6.0, view: SYNC_DIALOG_IN }] },
    { id: "export", bars: 2, span: [1.2, 8.0], keep: [[1.5, 1.9], [3.3, 3.7], [4.9, 5.75]],
      cam: [{ view: RAIL }, { at: 1.6, view: EXPORT_DIALOG }, { at: 5.45, view: EXPORT_DIALOG_IN }] },
    { id: "settings", bars: 2, span: [0.3, 7.0], keep: [[1.5, 2.0], [3.9, 4.4], [6.3, 6.8]],
      cam: [{ view: RAIL }, { at: 1.6, view: SECTION }] },
  ],
};
/**
 * The LinkedIn cut on Musinova's "Minimal Techno Electronic Underscore" (Pixabay, 100 BPM, a bar is 2.4 s): the
 * short edit's clicks and pace rule with the bars re-budgeted to 25 (60.2 s). Rendered with --start=33.42 the
 * track's breakdown sits under Library and Player, its return lands on the cut into Clean, and its own fade-out
 * plays under the end card.
 */
const UNDERSCORE_BARS = { library: 2, player: 2, clean: 4.5, discover: 2.5, prepare: 2.5, keys: 1, statistics: 1, save: 2, export: 1.5, settings: 1 };
// Half bars are two beats, so a cut on one still lands on a beat. Spans that differ from the short edit's.
const UNDERSCORE_SPANS = { player: [0.8, 10.4], export: [1.2, 7.5], prepare: [0.8, 11.0] };
export const UNDERSCORE = {
  ...SHORT,
  bpm: 100,
  shots: SHORT.shots.map((s) => ({ ...s, bars: UNDERSCORE_BARS[s.id], ...(UNDERSCORE_SPANS[s.id] ? { span: UNDERSCORE_SPANS[s.id] } : {}) })),
};
/**
 * The LinkedIn cut on sub_clair's "Technology" (Pixabay, 125 BPM, a bar is 1.92 s): the short edit bar for bar (the bars
 * are within 4 % of Water's), three spans a little longer. Rendered with --start=62.72 the track's breakdown sits under the
 * opening, Library and Player and its return lands on the cut into Clean.
 */
const TECHNOLOGY_SPANS = { library: [0.0, 10.87], player: [0.8, 8.7], settings: [0.3, 7.7] };
export const TECHNOLOGY = {
  ...SHORT,
  bpm: 125,
  shots: SHORT.shots.map((s) => ({ ...s, ...(TECHNOLOGY_SPANS[s.id] ? { span: TECHNOLOGY_SPANS[s.id] } : {}) })),
};
/**
 * Five single-angle LinkedIn spots on the Technology track (125 BPM, --start=32.03 puts its full section under
 * them): each is the short edit's pace rule and clips, a 3-bar problem opening with its own lines (`open`:
 * problem lines, then the answer after "CuePoint"), one to three features with their own captions, and a 2-bar
 * end card whose line an edit may replace (`end`). Angles: the fix itself, the price, digging, set prep, safety.
 */
const spot = (id, open, shots, end) => ({
  ...TECHNOLOGY,
  open,
  end,
  shots: shots.map(([sid, caption]) => ({ ...TECHNOLOGY.shots.find((s) => s.id === sid), ...(caption ? { caption } : {}) })),
});
export const SPOTS = {
  fix: spot("fix", { problems: ["300 tracks.", "24 wrong keys.", "BPMs missing.", "Half the tags empty."], answer: "fixes them from Beatport." },
    [["clean", "Fix keys, BPM and tags from Beatport"]]),
  free: spot("free", { problems: ["Most tag tools cost monthly.", "Lock your library in.", "Want an account."], answer: "is free. Open source." },
    [["library", "Your Rekordbox library, as it is"], ["clean", "Fixed from Beatport"], ["export", "Straight back to Rekordbox"]],
    "Free and open source. No account, no subscription."),
  dig: spot("dig", { problems: ["New music is everywhere.", "The good stuff is in charts", "by DJs you already trust."], answer: "digs them for you." },
    [["discover", "Dig the charts for new music"]],
    "New music from the charts of DJs you trust."),
  prep: spot("prep", { problems: ["Saturday's set.", "Forty transitions.", "Which ones work?"], answer: "checks every one." },
    [["prepare", "Plan your set, see every transition"], ["keys", "Find tracks that mix"]],
    "Plan the set, check every transition, before you leave home."),
  roundtrip: spot("roundtrip", { problems: ["Your files stay yours.", "Nothing is overwritten blind.", "Every change is listed first."], answer: "writes, you approve." },
    [["library", "Your whole Rekordbox library"], ["save", "Write the fixes into your music files"], ["export", "Straight back to Rekordbox"]],
    "Fix the files, export, re-import. Nothing lost."),
};
/** The edits that replace the full tour, by their ?edit= name. */
export const EDITS = { story: STORY, short: SHORT, underscore: UNDERSCORE, technology: TECHNOLOGY, ...SPOTS };
/** Seconds of one bar of an edit's music. */
export const barOf = (edit) => (60 / (EDITS[edit]?.bpm ?? BPM)) * 4;

/**
 * Each shot: the raw clip (`<id>.mkv` from e2e/capture/demo.spec.ts), the stretch of it used (`span`, clip
 * seconds) and the moments that must play at normal speed (`keep`, clip seconds: the clicks, the typing, the
 * things appearing). Everything between the kept moments (the pointer travelling, the app loading) runs faster,
 * up to MAX_FAST, easing there and back over RAMP seconds, by exactly the factor that makes the span fill the
 * slot plus the dissolve tail. Nothing is cut, so nothing ever jumps. `cam` is camera keyframes
 * [shot seconds, x, y, zoom] (see the views above) with x/y the point of the 1280 x 800 window kept centred;
 * moves take at least 1.6 s (the short edit: 1.0 s, on the click) and are framed so whatever the shot is about
 * stays wholly in view.
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
  const keep = [...shot.keep, ...(lead ? [[from, from + lead]] : [])].sort((a, b) => a[0] - b[0]);
  const ramp = shot.ramp ?? RAMP;
  const maxFast = shot.maxFast ?? MAX_FAST;
  const STEP = 1 / 600;
  // w(u): 0 inside a kept moment, 1 well outside, easing over the ramp at each edge
  const w = (u) => {
    let v = 1;
    for (const [a, b] of keep) {
      const d = u < a ? a - u : u > b ? u - b : 0;
      v = Math.min(v, smooth(d / ramp));
    }
    return v;
  };
  // the waits: each stretch between two kept moments, and the rest after the last one
  const gaps = [];
  let prev = from;
  for (const [a, b] of keep) {
    if (a > prev) gaps.push({ from: prev, to: a, inner: true });
    prev = Math.max(prev, b);
  }
  gaps.push({ from: prev, to: to, inner: false });
  // the pace of the wait u is in: the solved pace F, or faster when a wait between moments would rest longer
  // than the shot's hold (the rest after the last moment is what the shot leaves on screen, it keeps F)
  const rate = (u, F) => {
    const g = gaps.find((g) => u >= g.from && u < g.to);
    if (!g || !g.inner || !shot.hold) return F;
    return Math.min(maxFast, Math.max(F, (g.to - g.from) / shot.hold));
  };
  const speed = (u, F) => 1 + (rate(u, F) - 1) * w(u);
  const integrate = (F) => {
    let o = 0;
    for (let u = from; u < to; u += STEP) o += STEP / speed(u, F);
    return o;
  };
  let F = 1;
  if (integrate(1) > need) {
    let lo = 1;
    let hi = maxFast;
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
    o += STEP / speed(u, F);
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
  const toOut = (clipSec) => lookup(src, out, clipSec) - lead;
  return {
    F,
    length: o,
    short: Math.max(0, need - o),
    toClip: (outSec) => lookup(out, src, outSec + lead),
    toOut,
    /** Each wait as it plays: its clip seconds, its output seconds, and whether it is between two kept moments. */
    waits: gaps.map((g) => ({ ...g, clip: g.to - g.from, out: toOut(g.to) - toOut(g.from) })),
  };
}

/** The seconds two shots dissolve over in an edit (the short cut dissolves longer). */
export const fadeOf = (edit) => EDITS[edit]?.fade ?? SHOT_FADE;

/** Lay the timeline out for one opening: slot lengths, each shot's speed map, the camera in output seconds. */
export function layout(opening = "a", edit = "full") {
  const cut = EDITS[edit];
  const fade = fadeOf(edit);
  const BAR = barOf(edit);
  const open = cut ? { bars: cut.openBars } : (OPENINGS[opening] ?? OPENINGS.a);
  const OPEN = { seconds: 0.2 + open.bars * BAR, bars: open.bars };
  const END_ = { seconds: (cut ? cut.endBars : 3) * BAR };
  const shots = cut
    ? cut.shots.map((o) => ({ ...SHOTS.find((s) => s.id === o.id), ...o }))
    : SHOTS.map((s) => ({ ...s }));
  if (opening === "a" && !cut) {
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
    if (cut) Object.assign(s, { hold: cut.hold, maxFast: cut.maxFast, ramp: cut.ramp });
    s.map = speedMap(s, s.lead + s.dur + fade, s.lead);
    if (s.cam[0] && !Array.isArray(s.cam[0])) {
      // camera on the click: open on the first view, then each move starts where its click plays and takes `move`
      const move = cut?.move ?? 1.0;
      const cam = [s.cam[0].view(0)];
      for (let i = 1; i < s.cam.length; i++) {
        const t = Math.round(s.map.toOut(s.cam[i].at) * FPS) / FPS;
        cam.push(s.cam[i - 1].view(t), s.cam[i].view(t + move));
      }
      s.cam = cam;
    }
    f0 = f1;
  }
  const endStart = f0 / FPS;
  return { OPEN, END: END_, shots, endStart, duration: endStart + END_.seconds };
}

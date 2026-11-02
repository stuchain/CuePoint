// The LinkedIn demo: what each shot shows, how long it lasts and where the camera looks.
// Lengths are whole bars of the music (130 BPM, a bar is 1.846 s) so every cut lands on a bar.
export const FPS = 30;
export const BAR = (60 / 130) * 4;
export const FORMATS = { portrait: { width: 1080, height: 1350 }, wide: { width: 1920, height: 1080 } };

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
 * Each shot: the raw clip (`<id>.mkv` from e2e/capture/demo.spec.ts), the stretch of it used (`span`, clip
 * seconds) and the moments that must play at normal speed (`keep`, clip seconds: the clicks, the typing, the
 * things appearing). Everything between the kept moments (the pointer travelling, the app loading) runs faster,
 * up to MAX_FAST, easing there and back over RAMP seconds, by exactly the factor that makes the span fill the
 * slot plus the dissolve tail. Nothing is cut, so nothing ever jumps. `cam` is camera keyframes
 * [shot seconds, x, y, zoom] with x/y the point of the 1280 x 800 window kept centred; moves take at least
 * 1.6 s and are framed so whatever the shot is about stays wholly in view.
 */
export const SHOTS = [
  {
    id: "library", chip: "Library", caption: "Your whole Rekordbox library", bars: 4,
    span: [0.3, 10.87], keep: [[1.2, 3.4], [4.8, 5.4], [7.6, 8.6]],
    cam: [[0, 640, 400, 1], [0.6, 640, 400, 1], [2.2, 760, 400, 1.2], [2.8, 760, 400, 1.2], [4.4, 760, 330, 1.2], [5.0, 760, 330, 1.2], [6.8, 840, 380, 1.2]],
    // with opening A the title sits on the scroll and the search; the slot opens on the result and the details
    camA: [[0, 760, 330, 1.2], [1.6, 760, 330, 1.2], [3.4, 840, 380, 1.2]],
  },
  {
    id: "player", chip: "Player", caption: "Listen without leaving", bars: 4,
    span: [0.8, 10.77], keep: [[1.3, 2.4], [4.0, 4.8], [7.0, 8.0]],
    cam: [[0, 640, 400, 1], [0.3, 640, 400, 1], [2.1, 640, 540, 1.2], [4.4, 640, 540, 1.2], [6.2, 960, 500, 1.2]],
  },
  {
    id: "clean", chip: "Clean", caption: "Fix keys, BPM and tags from Beatport", bars: 6,
    span: [0.7, 18.3], keep: [[1.3, 4.6], [10.8, 11.4], [12.7, 13.4], [15.3, 15.9], [17.1, 17.7]],
    cam: [[0, 640, 400, 1], [0.3, 640, 400, 1], [2.0, 640, 380, 1.08], [5.0, 640, 380, 1.08], [6.6, 560, 380, 1.12], [7.0, 560, 380, 1.12], [8.8, 900, 450, 1.3]],
  },
  {
    id: "discover", chip: "Discover", caption: "Dig the charts for new music", bars: 4,
    span: [0.5, 10.0], keep: [[0.8, 5.2], [6.5, 7.4]],
    cam: [[0, 640, 400, 1], [0.3, 640, 400, 1], [2.0, 660, 410, 1.03], [4.9, 660, 410, 1.03], [7.85, 700, 440, 1.2]],
  },
  {
    id: "prepare", chip: "Prepare", caption: "Plan your set, see every transition", bars: 4,
    span: [0.8, 11.0], keep: [[1.2, 1.7], [2.2, 2.6], [3.5, 3.9], [5.6, 6.0], [7.0, 7.4], [8.8, 9.2], [9.8, 10.3]],
    cam: [[0, 640, 400, 1], [0.8, 640, 400, 1], [2.6, 600, 300, 1.2], [7.85, 600, 300, 1.22]],
  },
  {
    id: "keys", chip: "Keys", caption: "Find tracks that mix", bars: 3,
    span: [0.3, 7.77], keep: [[0.4, 1.9], [4.4, 5.2]],
    cam: [[0, 640, 400, 1], [0.2, 640, 400, 1], [2.0, 760, 400, 1.3], [5.9, 760, 400, 1.36]],
  },
  {
    id: "statistics", chip: "Statistics", caption: "Know your library", bars: 3,
    span: [0.3, 8.17], keep: [[2.2, 3.2], [4.6, 5.4]],
    cam: [[0, 640, 400, 1], [5.9, 640, 380, 1.08]],
  },
  {
    id: "save", chip: "Save to files", caption: "Write the fixes into your music files", bars: 3,
    span: [1.0, 9.0], keep: [[1.6, 2.4], [4.0, 4.6], [5.3, 6.8]],
    cam: [[0, 640, 400, 1], [1.0, 640, 400, 1], [2.8, 640, 300, 1.25], [5.9, 640, 300, 1.25]],
  },
  {
    id: "export", chip: "Export", caption: "Straight back to Rekordbox", bars: 3,
    span: [0.5, 9.0], keep: [[1.0, 1.8], [3.3, 3.8], [5.0, 6.0]],
    cam: [[0, 640, 400, 1], [1.0, 640, 400, 1], [2.8, 640, 260, 1.4], [5.9, 640, 260, 1.45]],
  },
  {
    id: "settings", chip: "Themes", caption: "Make it yours", bars: 4,
    span: [0.9, 13.0], keep: [[1.3, 1.9], [3.8, 4.4], [6.2, 6.8], [8.6, 9.2], [11.1, 11.7]],
    cam: [[0, 640, 400, 1], [7.85, 640, 390, 1.08]],
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
export function layout(opening = "a") {
  const open = OPENINGS[opening] ?? OPENINGS.a;
  const OPEN = { seconds: 0.2 + open.bars * BAR };
  const shots = SHOTS.map((s) => ({ ...s }));
  if (opening === "a") {
    // the opening is the Library itself, live, full-frame: its clip starts under the title and runs on
    shots[0].span = [0, shots[0].span[1]];
    shots[0].bars = 3;
    shots[0].lead = OPEN.seconds;
  }
  let t0 = OPEN.seconds;
  for (const s of shots) {
    s.frames = Math.round(s.bars * BAR * FPS);
    s.lead = s.lead ?? 0;
    s.start = t0;
    s.dur = s.frames / FPS;
    s.map = speedMap(s, s.lead + s.dur + SHOT_FADE, s.lead);
    t0 += s.dur;
  }
  return { OPEN, END, shots, endStart: t0, duration: t0 + END.seconds };
}

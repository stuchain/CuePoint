// The LinkedIn demo: what each shot shows, how long it lasts and where the camera looks.
// Lengths are whole bars of the music (130 BPM, a bar is 1.846 s) so every cut lands on a bar.
export const FPS = 30;
export const BAR = (60 / 130) * 4;
export const FORMATS = { portrait: { width: 1080, height: 1350 }, wide: { width: 1920, height: 1080 } };

/** Seconds two parts of one clip dissolve into each other, and two shots into each other. */
export const PART_FADE = 0.25;
export const SHOT_FADE = 0.45;
/** Frames each shot keeps playing past its slot, under the dissolve into the next one. */
export const TAIL = Math.round(SHOT_FADE * FPS);

/**
 * Opening and end card come from the 26 s promo's own renders (its opening, its end card). The opening runs
 * 0.2 s plus 3 bars so that, with the music starting at 1:58, every cut after it lands on a bar of the track.
 */
export const OPEN = { id: "open", seconds: 0.2 + 3 * BAR, from: 0 };
export const END = { id: "end", seconds: 3 * BAR, from: 23.4 };
OPEN.frames = Math.round(OPEN.seconds * FPS);
END.frames = Math.round(END.seconds * FPS);

/**
 * Each shot: the raw clip (`<id>.mkv` from e2e/capture/demo.spec.ts) and the parts of it used (`parts`,
 * [from, to] seconds, dead moments such as the pointer travelling left out, joined by short dissolves and
 * played at normal speed; the last part runs on as far as the slot needs). `cam` is camera keyframes
 * [clip seconds, x, y, zoom], x/y the point of the 1280 x 800 window kept centred, timed on the clip so a
 * move starts when the thing it shows appears. Zooms are framed so whatever the shot is about stays wholly
 * in view, with the cut falling on a side panel, never through the dialog or list being shown.
 */
export const SHOTS = [
  {
    id: "library", chip: "Library", caption: "Your whole Rekordbox library", bars: 4,
    parts: [[0.6, 3.3], [4.1, 5.7], [6.8, 9.9]],
    cam: [[0.6, 640, 400, 1], [3.3, 640, 400, 1.04], [4.5, 760, 330, 1.28], [7.6, 770, 330, 1.3], [8.7, 830, 400, 1.18], [10.6, 840, 400, 1.22]],
  },
  {
    id: "player", chip: "Player", caption: "Listen without leaving", bars: 4,
    parts: [[1.0, 5.6], [6.6, 9.4]],
    cam: [[1.0, 640, 400, 1], [2.4, 640, 520, 1.05], [6.9, 640, 560, 1.07], [8.1, 1000, 420, 1.22], [10.0, 1010, 420, 1.26]],
  },
  {
    id: "clean", chip: "Clean", caption: "Fix keys, BPM and tags from Beatport", bars: 5,
    parts: [[0.7, 4.9], [10.2, 11.4], [12.6, 14.0], [15.7, 17.2], [19.0, 20.0]],
    cam: [[0.7, 640, 400, 1], [4.9, 640, 400, 1.03], [11.4, 640, 400, 1.04], [13.0, 640, 400, 1.04], [14.0, 1000, 450, 1.24], [21.0, 1000, 450, 1.3]],
  },
  {
    id: "discover", chip: "Discover", caption: "Dig the charts for new music", bars: 4,
    parts: [[0.7, 8.1]],
    cam: [[0.7, 640, 400, 1], [1.8, 670, 410, 1.12], [4.3, 670, 410, 1.14], [5.4, 760, 360, 1.12], [8.6, 780, 350, 1.18]],
  },
  {
    id: "prepare", chip: "Prepare", caption: "Plan your set, see every transition", bars: 4,
    parts: [[1.0, 4.2], [4.9, 6.7], [7.3, 9.0], [9.5, 11.0]],
    cam: [[1.0, 640, 400, 1], [2.4, 680, 360, 1.08], [11.6, 700, 340, 1.14]],
  },
  {
    id: "keys", chip: "Keys", caption: "Find tracks that mix", bars: 3,
    parts: [[0.5, 2.8], [3.5, 6.7]],
    cam: [[0.5, 640, 400, 1], [1.5, 798, 320, 1.3], [7.0, 800, 320, 1.36]],
  },
  {
    id: "statistics", chip: "Statistics", caption: "Know your library", bars: 3,
    parts: [[0.6, 3.3], [4.2, 7.0]],
    cam: [[0.6, 640, 400, 1], [3.3, 650, 390, 1.03], [4.6, 640, 400, 1], [7.3, 650, 400, 1.03]],
  },
  {
    id: "save", chip: "Save to files", caption: "Write the fixes into your music files", bars: 3,
    parts: [[1.1, 4.3], [5.6, 7.9]],
    cam: [[1.1, 640, 400, 1], [1.8, 640, 400, 1], [2.9, 632, 300, 1.22], [8.3, 632, 290, 1.25]],
  },
  {
    id: "export", chip: "Export", caption: "Straight back to Rekordbox", bars: 3,
    parts: [[0.5, 3.7], [4.6, 6.9]],
    cam: [[0.5, 640, 400, 1], [1.3, 640, 400, 1], [2.4, 640, 260, 1.42], [7.3, 640, 250, 1.48]],
  },
  {
    id: "settings", chip: "Themes", caption: "Make it yours", bars: 4,
    parts: [[1.0, 2.9], [3.6, 5.3], [6.0, 7.7], [8.4, 10.1], [10.9, 12.4]],
    cam: [[1.0, 640, 400, 1], [13.4, 600, 360, 1.1]],
  },
];

/**
 * Where each part lands in the shot: `start` (seconds into the shot) of each part after the dissolves, the
 * last part stretched to fill the slot plus its tail. `toShot(t)` turns a clip second into a shot second.
 */
export function timeline(shot) {
  const need = shot.frames / FPS + SHOT_FADE;
  const parts = shot.parts.map(([a, b]) => [a, b]);
  let at = 0;
  const starts = parts.map(([a, b], i) => {
    const s = at;
    at += b - a - (i < parts.length - 1 ? PART_FADE : 0);
    return s;
  });
  const last = parts[parts.length - 1];
  last[1] += Math.max(0, need - at);
  const toShot = (t) => {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (t >= parts[i][0]) return starts[i] + Math.min(t, parts[i][1]) - parts[i][0];
    }
    return 0;
  };
  return { parts, starts, need, toShot };
}

for (const s of SHOTS) {
  s.frames = Math.round(s.bars * BAR * FPS);
  const { toShot } = timeline(s);
  s.camAt = s.cam.map(([t, x, y, z]) => [toShot(t), x, y, z]);
}

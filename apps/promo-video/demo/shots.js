// The LinkedIn demo: what each shot shows, how long it lasts and where the camera looks.
// Lengths are whole bars of the music (130 BPM, a bar is 1.846 s) so every cut lands on a bar.
export const FPS = 30;
export const BAR = (60 / 130) * 4;
export const FORMATS = { portrait: { width: 1080, height: 1350 }, wide: { width: 1920, height: 1080 } };

/** Opening and end card come from the 26 s promo's own renders (its first 3 bars at 136 BPM, its end card). */
export const OPEN = { id: "open", seconds: (3 * 4 * 60) / 136, from: 0 };
export const END = { id: "end", seconds: 3 * BAR, from: 23.4 };
OPEN.frames = Math.round(OPEN.seconds * FPS);
END.frames = Math.round(END.seconds * FPS);

/**
 * Each shot: the raw clip (`<id>.mkv` from e2e/capture/demo.spec.ts), the parts of it used (`parts`, [from, to]
 * seconds each, joined and played back at whatever speed fills the slot), and camera keyframes [progress 0..1, x, y, zoom]
 * with x/y a point in the 1280 x 800 window to keep centred.
 */
export const SHOTS = [
  { id: "library", chip: "Library", caption: "Your whole Rekordbox library", bars: 4, parts: [[0.5, 4.5], [4.6, 11.8]], cam: [[0, 640, 400, 1], [0.3, 640, 400, 1], [0.45, 760, 300, 1.4], [0.75, 760, 300, 1.4], [0.88, 980, 360, 1.35], [1, 980, 360, 1.35]] },
  { id: "player", chip: "Player", caption: "Listen without leaving", bars: 3, parts: [[1, 6.5], [7, 10]], cam: [[0, 640, 400, 1], [0.15, 640, 400, 1], [0.4, 640, 620, 1.7], [0.62, 640, 620, 1.7], [0.8, 1090, 300, 1.6], [1, 1090, 300, 1.6]] },
  { id: "clean", chip: "Clean", caption: "Fix keys, BPM and tags from Beatport", bars: 5, parts: [[0.8, 8.5], [12.5, 20.5]], cam: [[0, 640, 400, 1], [0.1, 640, 360, 1.25], [0.45, 640, 360, 1.25], [0.56, 1010, 480, 1.7], [1, 1010, 480, 1.7]] },
  { id: "discover", chip: "Discover", caption: "Dig the charts for new music", bars: 4, parts: [[0.5, 5.2], [5.6, 10.6]], cam: [[0, 640, 400, 1], [0.12, 640, 330, 1.3], [0.48, 640, 330, 1.3], [0.6, 860, 400, 1.25], [1, 860, 400, 1.25]] },
  { id: "prepare", chip: "Prepare", caption: "Plan your set, see every transition", bars: 3, parts: [[1, 9.5]], cam: [[0, 640, 400, 1], [0.3, 640, 300, 1.45], [1, 640, 300, 1.45]] },
  { id: "keys", chip: "Keys", caption: "Find tracks that mix", bars: 3, parts: [[0.8, 7.7]], cam: [[0, 640, 400, 1], [0.25, 760, 440, 1.55], [1, 760, 440, 1.55]] },
  { id: "statistics", chip: "Statistics", caption: "Know your library", bars: 3, parts: [[0, 8]], cam: [[0, 640, 400, 1], [0.45, 640, 400, 1.15], [0.62, 660, 330, 1.3], [1, 660, 330, 1.3]] },
  { id: "save", chip: "Save to files", caption: "Write the fixes into your music files", bars: 3, parts: [[0.8, 7.5]], cam: [[0, 640, 400, 1], [0.15, 640, 400, 1], [0.3, 430, 300, 1.6], [1, 430, 300, 1.6]] },
  { id: "export", chip: "Export", caption: "Straight back to Rekordbox", bars: 4, parts: [[0.8, 9.5]], cam: [[0, 640, 400, 1], [0.2, 640, 280, 1.45], [1, 640, 280, 1.45]] },
  { id: "settings", chip: "Themes", caption: "Make it yours", bars: 3, parts: [[1, 12.6]], cam: [[0, 640, 400, 1], [0.12, 720, 330, 1.3], [1, 720, 330, 1.3]] },
];
for (const s of SHOTS) s.frames = Math.round(s.bars * BAR * FPS);

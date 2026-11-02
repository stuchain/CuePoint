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
  { id: "library", chip: "Library", caption: "Your whole Rekordbox library", bars: 4, parts: [[0.5, 10.8]], cam: [[0, 640, 400, 1], [0.29, 640, 400, 1], [0.38, 560, 260, 1.35], [0.62, 560, 280, 1.35], [0.74, 880, 330, 1.3], [1, 880, 330, 1.3]] },
  { id: "player", chip: "Player", caption: "Listen without leaving", bars: 3, parts: [[0.8, 10.6]], cam: [[0, 640, 400, 1], [0.1, 640, 400, 1], [0.2, 520, 620, 1.35], [0.61, 520, 620, 1.35], [0.72, 1000, 420, 1.3], [1, 1000, 420, 1.3]] },
  { id: "clean", chip: "Clean", caption: "Fix keys, BPM and tags from Beatport", bars: 5, parts: [[0.8, 7.5], [11.5, 20.8]], cam: [[0, 640, 400, 1], [0.05, 640, 360, 1.12], [0.42, 640, 360, 1.12], [0.5, 900, 450, 1.4], [1, 900, 450, 1.4]] },
  { id: "discover", chip: "Discover", caption: "Dig the charts for new music", bars: 4, parts: [[0.6, 4.6], [4.9, 8.3]], cam: [[0, 640, 400, 1], [0.08, 670, 410, 1.3], [0.52, 670, 410, 1.3], [0.58, 640, 330, 1.08], [0.8, 640, 330, 1.08], [0.88, 820, 420, 1.3], [1, 820, 420, 1.3]] },
  { id: "prepare", chip: "Prepare", caption: "Plan your set, see every transition", bars: 3, parts: [[1.5, 9.5]], cam: [[0, 640, 400, 1], [0.15, 600, 320, 1.2], [1, 600, 320, 1.2]] },
  { id: "keys", chip: "Keys", caption: "Find tracks that mix", bars: 3, parts: [[0.8, 7.7]], cam: [[0, 640, 400, 1], [0.2, 790, 380, 1.25], [1, 790, 380, 1.25]] },
  { id: "statistics", chip: "Statistics", caption: "Know your library", bars: 3, parts: [[0, 7.6]], cam: [[0, 640, 400, 1], [0.1, 640, 360, 1.12], [0.5, 640, 360, 1.12], [0.62, 640, 410, 1.1], [1, 640, 410, 1.1]] },
  { id: "save", chip: "Save to files", caption: "Write the fixes into your music files", bars: 3, parts: [[0.8, 8.5]], cam: [[0, 640, 400, 1], [0.12, 640, 400, 1], [0.2, 640, 270, 1.3], [1, 640, 270, 1.3]] },
  { id: "export", chip: "Export", caption: "Straight back to Rekordbox", bars: 4, parts: [[0.8, 9]], cam: [[0, 640, 400, 1], [0.1, 640, 400, 1], [0.2, 640, 250, 1.4], [1, 640, 250, 1.4]] },
  { id: "settings", chip: "Themes", caption: "Make it yours", bars: 3, parts: [[1, 12.6]], cam: [[0, 640, 400, 1], [0.2, 560, 380, 1.12], [1, 560, 380, 1.12]] },
];
for (const s of SHOTS) s.frames = Math.round(s.bars * BAR * FPS);

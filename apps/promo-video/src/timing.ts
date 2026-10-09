/**
 * The promo's clock. Everything is placed on the beat: 132 BPM, 11 bars of 4 beats, exactly 20 seconds,
 * so cuts, pops and camera kicks land on the music (scripts/beat.mjs plays the same grid).
 */
export const FPS = 30;
export const BPM = 132;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 11;
export const DURATION = BAR * BARS;
export const FRAMES = Math.round(DURATION * FPS);

/** Seconds at a bar (0-based), plus beats into it. */
export const at = (bar: number, beat = 0): number => bar * BAR + beat * BEAT;

/**
 * The shots, in bars: the hook and Clean get two bars each, then the features come one bar apiece (the
 * fastest part, on the drop), and the end card holds for two.
 */
export const SHOTS = [
  { id: "opening", from: 0, to: 2 },
  { id: "clean", from: 2, to: 4 },
  { id: "keys", from: 4, to: 5 },
  { id: "discover", from: 5, to: 6 },
  { id: "prepare", from: 6, to: 7 },
  { id: "waveforms", from: 7, to: 8 },
  { id: "export", from: 8, to: 9 },
  { id: "end", from: 9, to: 11 },
] as const;

export type ShotId = (typeof SHOTS)[number]["id"];

export const shot = (id: ShotId): { start: number; end: number } => {
  const s = SHOTS.find((x) => x.id === id)!;
  return { start: at(s.from), end: at(s.to) };
};

/** The cuts between shots: hard cuts on the downbeat. */
export const CUTS: readonly number[] = SHOTS.slice(1).map((s) => at(s.from));

/**
 * The on-screen words, so the video works muted. Plain American English for a DJ, and only what the
 * website's home page already says (apps/website/src/data/home.ts): no claim the app does not back up.
 */
export const CAPTIONS = [
  { text: "A messy library?", from: 0, to: at(1) },
  { text: "Matched on Beatport.", from: at(1), to: at(2) },
  // the app shots: each caption lands with the camera, half a beat after the downbeat
  { text: "Keys and tempos, fixed.", from: at(2, 0.75), to: at(4, 0.5) },
  { text: "Filter by key.", from: at(4, 0.5), to: at(5, 0.5) },
  { text: "Find new music.", from: at(5, 0.5), to: at(6, 0.5) },
  { text: "Plan sets in key.", from: at(6, 0.5), to: at(7, 0.5) },
  { text: "See the drop coming.", from: at(7, 0.5), to: at(8, 0.5) },
  { text: "Back to Rekordbox.", from: at(8, 0.5), to: at(9, 0.25) },
] as const;

/** Which bars the drums play. The intro bar is pads and arps; the riser clears bar 1's second half. */
const DRUM_BARS = (bar: number, beat: number): boolean => {
  if (bar === 0) return false;
  if (bar === 1 && beat >= 2) return false; // the riser into the app shots
  if (bar === BARS - 1 && beat >= 2) return false; // the last hit, alone
  return true;
};

/** A broken beat, Bicep-style: the kick on 1, the "a" of 2 and the "and" of 3; the snare on 2 and 4. */
const KICK_STEPS = [0, 1.75, 2.5] as const;
const SNARE_STEPS = [1, 3] as const;

function grid(steps: readonly number[]): number[] {
  const out: number[] = [];
  for (let bar = 0; bar < BARS; bar++) for (const b of steps) if (DRUM_BARS(bar, b)) out.push(at(bar, b));
  return out;
}

/** Where the kick hits, in seconds, plus the last hit. The music and the picture's pulse read this list. */
export const KICKS: readonly number[] = [...grid(KICK_STEPS), at(BARS - 1, 2)].sort((a, b) => a - b);

/** Where the snare hits, in seconds: the picture punches on these. */
export const SNARES: readonly number[] = grid(SNARE_STEPS);

/** The last hit of the video: everything lands here. */
export const FINAL_HIT = at(BARS - 1, 2);

function envelope(hits: readonly number[], t: number, decay: number): number {
  if (t < 0 || t >= DURATION) return 0;
  let last = -1;
  for (const k of hits) {
    if (k > t + 1e-9) break;
    last = k;
  }
  if (last < 0) return 0;
  return Math.exp(-(t - last) * decay);
}

/** How hard the kick is hitting at time t, 0 to 1: a sharp attack on each hit, decaying fast. */
export const kickLevel = (t: number): number => envelope(KICKS, t, 9);

/** The same for the snare. */
export const snareLevel = (t: number): number => envelope(SNARES, t, 12);

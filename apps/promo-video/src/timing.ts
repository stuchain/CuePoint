/**
 * The promo's clock. Everything is placed on the beat: 136 BPM, 15 bars of 4 beats, about 26 seconds,
 * so cuts, pops and camera kicks land on the music (scripts/beat.mjs plays the same grid).
 */
export const FPS = 30;
export const BPM = 136;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 15;
export const DURATION = BAR * BARS;
export const FRAMES = Math.round(DURATION * FPS);

/** Seconds at a bar (0-based), plus beats into it. */
export const at = (bar: number, beat = 0): number => bar * BAR + beat * BEAT;

/**
 * The shots, in bars: the hook gets three (a dig into the crate, then the records lift, take their
 * tags and fly into the wheel, the camera never resting), Clean and Keys two bars each, Discover and
 * Prepare a bar and a half (their cut lands on the third beat), Waveforms two, Export one (the drop's
 * fastest cut), and the end card holds for two.
 */
export const SHOTS = [
  { id: "opening", from: 0, to: 3 },
  { id: "clean", from: 3, to: 5 },
  { id: "keys", from: 5, to: 7 },
  { id: "discover", from: 7, to: 8.5 },
  { id: "prepare", from: 8.5, to: 10 },
  { id: "waveforms", from: 10, to: 12 },
  { id: "export", from: 12, to: 13 },
  { id: "end", from: 13, to: 15 },
] as const;

export type ShotId = (typeof SHOTS)[number]["id"];

export const shot = (id: ShotId): { start: number; end: number } => {
  const s = SHOTS.find((x) => x.id === id)!;
  return { start: at(s.from), end: at(s.to) };
};

/** The cuts between shots: hard cuts on a beat (the downbeat, or the third beat for the two short shots). */
export const CUTS: readonly number[] = SHOTS.slice(1).map((s) => at(s.from));

/**
 * The on-screen words, so the video works muted. Plain American English for a DJ, and only what the
 * website's home page already says (apps/website/src/data/home.ts): no claim the app does not back up.
 */
export const CAPTIONS = [
  { text: "A messy library?", from: at(0, 1.5), to: at(1, 3) },
  { text: "Matched on Beatport.", from: at(1, 3), to: at(3) },
  // the app shots: each caption lands with the camera, half a beat after the cut
  { text: "Keys and tempos, fixed.", from: at(3, 0.75), to: at(5, 0.5) },
  { text: "Filter by key.", from: at(5, 0.5), to: at(7, 0.5) },
  { text: "Find new music.", from: at(7, 0.5), to: at(8.5, 0.5) },
  { text: "Plan sets in key.", from: at(8.5, 0.5), to: at(10, 0.5) },
  { text: "See the drop coming.", from: at(10, 0.5), to: at(12, 0.5) },
  { text: "Back to Rekordbox.", from: at(12, 0.5), to: at(13, 0.25) },
] as const;

/** The bar the drop lands on: the cut into the app. */
const DROP_BAR = SHOTS[1].from;

/** Which bars the drums play. The first bar is pads and arps; the riser clears the bar before the drop's second half. */
const DRUM_BARS = (bar: number, beat: number): boolean => {
  if (bar < DROP_BAR - 2) return false;
  if (bar === DROP_BAR - 1 && beat >= 2) return false; // the riser into the app shots
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

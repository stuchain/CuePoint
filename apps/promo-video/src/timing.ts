/**
 * The promo's clock. Everything is placed on the beat: 128 BPM, 16 bars of 4 beats, exactly 30 seconds,
 * so cuts and pops land on the music (scripts/beat.mjs plays the same grid).
 */
export const FPS = 30;
export const BPM = 128;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 16;
export const DURATION = BAR * BARS;
export const FRAMES = Math.round(DURATION * FPS);

/** Seconds at a bar (0-based), plus beats into it. */
export const at = (bar: number, beat = 0): number => bar * BAR + beat * BEAT;

/** The shots, in bars. Each starts where the last ends and the last ends at the final bar. */
export const SHOTS = [
  { id: "opening", from: 0, to: 5 },
  { id: "clean", from: 5, to: 8 },
  { id: "prepare", from: 8, to: 11 },
  { id: "export", from: 11, to: 13 },
  { id: "end", from: 13, to: 16 },
] as const;

export type ShotId = (typeof SHOTS)[number]["id"];

export const shot = (id: ShotId): { start: number; end: number } => {
  const s = SHOTS.find((x) => x.id === id)!;
  return { start: at(s.from), end: at(s.to) };
};

/**
 * The on-screen words, so the video works muted. Plain American English for a DJ, and only what the
 * website's home page already says (apps/website/src/data/home.ts): no claim the app does not back up.
 */
export const CAPTIONS = [
  { text: "A messy library?", from: at(0, 1), to: at(1, 3) },
  { text: "Matched on Beatport.", from: at(2), to: at(3, 1) },
  { text: "Sorted on the Camelot wheel.", from: at(3, 1), to: at(5) },
  { text: "Missing or wrong keys and tempos, fixed.", from: at(5, 1), to: at(8) },
  { text: "Plan sets that mix in key.", from: at(8, 1), to: at(11) },
  { text: "Back to Rekordbox. Your fixes on top.", from: at(11, 1), to: at(13) },
] as const;

/** How hard the kick is hitting at time t, 0 to 1: a sharp attack on every beat, decaying fast. */
export function kickLevel(t: number): number {
  if (t < 0 || t >= DURATION) return 0;
  const into = t % BEAT;
  return Math.exp(-into * 9);
}

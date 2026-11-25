/**
 * The site plays no music, so the crowd dances to a steady 124 BPM pattern that cycles calm (sway),
 * build (bob) and drop (jump, hands up). Pure: a time in seconds in, a phase and a move out.
 */
export const BPM = 124;
/** Four-beat bars, 16 of them: 64 beats, about 31 seconds. */
export const CYCLE_BEATS = 64;
/** Beats 0 to 24 are calm, 24 to 48 build, 48 to 64 the drop. */
export const CALM_BEATS = 24;
export const BUILD_BEATS = 48;
export const CYCLE_SECONDS = (CYCLE_BEATS * 60) / BPM;

export type Phase = "calm" | "build" | "drop";
export type CrowdMove = "sway" | "bob" | "jump";

/** The still frame (reduced motion, saveData): the crowd mid-build, moving but not at the peak. */
export const STILL_SECONDS = (30 * 60) / BPM;

export const beatsAt = (seconds: number): number => (seconds * BPM) / 60;

export function phaseAt(seconds: number): Phase {
  const beat = beatsAt(seconds) % CYCLE_BEATS;
  if (beat < CALM_BEATS) return "calm";
  return beat < BUILD_BEATS ? "build" : "drop";
}

const MOVES: Record<Phase, CrowdMove> = { calm: "sway", build: "bob", drop: "jump" };

export const moveAt = (seconds: number): CrowdMove => MOVES[phaseAt(seconds)];

/**
 * The made-up library the app shots show. No real artist or track: the names are invented, like the
 * website's capture library (SITE-04).
 */

/**
 * True while the app shots are stand-ins drawn in the app's style: the window says "Preview". Set it
 * false only when the shots are real captures of the redesigned pages (Phase 14 and 15).
 */
export const APP_PREVIEW = true;

export interface CleanRow {
  readonly title: string;
  readonly artist: string;
  /**
   * [before, after]; no "after" means it stays. "—" is a missing value. The key changes when the match
   * is accepted; tempo and genre only when Apply takes them from the accepted match.
   */
  readonly key: readonly [string, string?];
  readonly bpm: readonly [string, string?];
  readonly genre: readonly [string, string?];
  readonly status: "accepted" | "review";
}

export const CLEAN_ROWS: readonly CleanRow[] = [
  { title: "Night Drive", artist: "Lumen Coast", key: ["—", "8A"], bpm: ["61", "122"], genre: ["—", "Deep House"], status: "accepted" },
  { title: "Saltwater", artist: "Odd Harbor", key: ["—", "8B"], bpm: ["62", "124"], genre: ["Afro House"], status: "accepted" },
  { title: "Low Orbit", artist: "Kessler Drift", key: ["—", "9B"], bpm: ["126"], genre: ["—", "Tech House"], status: "accepted" },
  { title: "Glass Hours", artist: "Mira Vale", key: ["2A", "9A"], bpm: ["126"], genre: ["Melodic House"], status: "accepted" },
  { title: "Paper Moon", artist: "Tessa Rowe", key: ["10A"], bpm: ["—", "125"], genre: ["—", "Progressive House"], status: "accepted" },
  { title: "Afterglow (Extended Mix)", artist: "Dunes & Delta", key: ["—"], bpm: ["—"], genre: ["—"], status: "review" },
];

/** The set on the Prepare shot: each step mixes in key on the Camelot wheel. */
export const SET: ReadonlyArray<{ title: string; key: string; bpm: number }> = [
  { title: "Night Drive", key: "8A", bpm: 122 },
  { title: "Saltwater", key: "8B", bpm: 124 },
  { title: "Low Orbit", key: "9B", bpm: 126 },
  { title: "Glass Hours", key: "9A", bpm: 126 },
];

/**
 * The twelve hues of the app's icon (DEC-210), one per Camelot number: the icon draws them clockwise
 * from 12 at the top, so 1A sits at one o'clock in the same color here as on the icon.
 */
export const HUES = ["#7af08e", "#b6f05a", "#f0e05a", "#f8b05a", "#f8806a", "#f86a9a", "#e86ad8", "#b87af8", "#8a9af8", "#6ac0f8", "#5ae0f0", "#5ee8c5"] as const;

export function keyColor(key: string): string {
  const n = Number.parseInt(key, 10);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error(`Not a Camelot key: "${key}"`);
  return HUES[n - 1]!;
}

/** Two Camelot keys mix when they are the same, relative (same number) or one step apart (same letter). */
export function mixesInKey(a: string, b: string): boolean {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  const la = a.slice(-1);
  const lb = b.slice(-1);
  if (na === nb) return true;
  const step = (na - nb + 12) % 12;
  return la === lb && (step === 1 || step === 11);
}

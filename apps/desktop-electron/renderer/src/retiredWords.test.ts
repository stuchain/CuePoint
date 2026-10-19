/**
 * Wording guard (D2, D3, WD8): the words the audit retired do not come back.
 *
 * - D3: writing to files is "Save to Rekordbox files" language, never "Write N files",
 *   "Save to files", "Nothing to write" or "In sync" (the sync word is "Up to date").
 * - D2: match states are Confirmed, To check, No match, Not looked up yet and Rejected.
 * - Plain words: "artwork" not "cover art", "status strip" not "status bar", no contractions,
 *   no "Please", no "Failed to", no "e.g.".
 *
 * The files listed still hold an old phrase. The page batch that owns each file removes it from
 * ALLOW; Z empties the list. With CP_GUARD_STRICT=1 a listed file that no longer offends fails, so the list only shrinks.
 *
 * Staleness: the "allow list has no stale entries" check runs only with CP_GUARD_STRICT=1. Batch Z
 * turns it on (and removes the condition) once every page batch is merged; until then a page batch
 * that removes its file's last offender must not fail this guard for it.
 */
import { describe, expect, it } from "vitest";

const STRICT = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CP_GUARD_STRICT === "1";

const sources = import.meta.glob(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}", "!/src/**/*.stories.tsx", "!/src/**/*.d.ts"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const BANNED: Record<string, RegExp> = {
  "Write N files": /Write (?:\d+|\$\{[^}]*\}|N) files?\b/,
  "Save to files": /Save to files/,
  "Nothing to write": /Nothing to write/,
  "In sync": /\bIn sync\b/,
  Matched: /["'`>]Matched["'`<]/,
  "Not matched": /Not matched/,
  "Waiting for you": /Waiting for you/,
  "To review": /["'`>]To review["'`<]/,
  "Not found": /["'`>]Not found["'`<]/,
  "Not searched yet": /Not searched yet/,
  "cover art": /\b[Cc]over art\b/,
  "status bar": /\b[Ss]tatus bar\b/,
  // Any "n't" word, and a pronoun with 're, 've, 'll, 'd or 'm; straight or curly apostrophe, any case.
  contraction: /\b\w+n['\u2019]t\b|\b(?:I|you|we|they|it|he|she|that|there|what|who)['\u2019](?:re|ve|ll|d|m)\b/i,
  Please: /\bPlease\b/i,
  "Failed to": /\bFailed to\b/i,
  "e.g.": /\be\.g\./,
};

const ALLOW = new Set([
  // Contractions the stricter pattern found; each belongs to a page batch (H, S, C, D), which rewords it.
  "components/shell/GlobalSearch.tsx",
  "components/shell/OfflineBanner.tsx",
  "components/updates/UpdateReadyPanel.tsx",
  "components/waveform/analysisWords.ts",
  "screens/clean/match/MatchRunLine.tsx",
  "screens/discover/HideOwnedSwitch.tsx",
  "components/LogViewerDialog.tsx",
  "components/OnboardingIllustrations.tsx",
  "components/PrivacyDialog.tsx",
  "components/player/QueuePanel.tsx",
  "components/saveToFiles/SaveToFilesDialog.tsx",
  "components/saveToFiles/saveChoices.ts",
  "components/shell/ActivityPanel.tsx",
  "components/shell/useActiveJob.ts",
  "screens/clean/cleanFormat.ts",
  "screens/clean/match/reviewList.ts",
  "screens/discover/BeatportHalf.tsx",
  "screens/discover/DiscoverScreen.tsx",
  "screens/library/EditValuesDialog.tsx",
  "screens/library/LibraryNoKeyNote.tsx",
  "screens/library/LibraryReadyNote.tsx",
  "screens/library/TrackBeatportSection.tsx",
  "screens/library/libraryFormat.ts",
  "screens/prepare/ChapterDialog.tsx",
  "screens/prepare/SetEntryZone.tsx",
  "screens/statistics/HealthSection.tsx",
  "screens/statistics/StatisticsScreen.tsx",
]);

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\w])\/\/[^\n]*/g, "$1");
}

function relative(path: string): string {
  return path.replace(/^\/src\//, "");
}

function offenders(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [path, source] of Object.entries(sources)) {
    const text = code(source);
    const hits = Object.entries(BANNED)
      .filter(([, pattern]) => pattern.test(text))
      .map(([name]) => name);
    if (hits.length > 0) found.set(relative(path), hits);
  }
  return found;
}

describe("wording guard (D2, D3)", () => {
  it("uses none of the retired words outside the listed files", () => {
    const bad = [...offenders()]
      .filter(([path]) => !ALLOW.has(path))
      .map(([path, hits]) => `${path} (${hits.join(", ")})`);
    expect(bad, `use the shared words in format/words.ts: ${bad.join("; ")}`).toEqual([]);
  });

  it.runIf(STRICT)("lists only files that still use one", () => {
    const found = offenders();
    const stale = [...ALLOW].filter((path) => !found.has(path));
    expect(stale, `remove from ALLOW: ${stale.join(", ")}`).toEqual([]);
  });

  it("still sees each pattern", () => {
    expect(BANNED["Write N files"]!.test("Write 12 files")).toBe(true);
    expect(BANNED["Matched"]!.test('label: "Matched"')).toBe(true);
    expect(BANNED["Matched"]!.test("Matched tracks are kept")).toBe(false);
    expect(BANNED["contraction"]!.test("Couldn't")).toBe(true);
    for (const text of ["couldn't", "Don’t", "WON'T", "mustn't", "You’re", "we've", "it'll", "I'm"]) {
      expect(BANNED["contraction"]!.test(text), text).toBe(true);
    }
    expect(BANNED["contraction"]!.test("Could not, will not, it is")).toBe(false);
    expect(BANNED["Please"]!.test("please wait")).toBe(true);
    expect(BANNED["Failed to"]!.test("failed to load")).toBe(true);
  });
});

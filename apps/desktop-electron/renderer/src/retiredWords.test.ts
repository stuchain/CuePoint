/**
 * Wording guard (D2, D3, WD8): the words the audit retired do not come back.
 *
 * - D3: writing to files is "Save to Rekordbox files" language, never "Write N files",
 *   "Save to files", "Nothing to write" or "In sync" (the sync word is "Up to date").
 * - D2: match states are Confirmed, To check, No match, Not looked up yet and Rejected.
 * - Plain words: "artwork" not "cover art", "status strip" not "status bar", no contractions,
 *   no "Please", no "Failed to", no "e.g.".
 */
import { describe, expect, it } from "vitest";

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
  // M388: the Library's All tracks has one name; the scope is never "Whole library" or "The whole library".
  "Whole library": /["'`>](?:The )?[Ww]hole library(?:\b(?! will)|["'`<])/,
  // M391: a track in doubt is "to check", never "to review".
  "to review": /\}\s*to review\b|\bNothing to review\b/,
  "Not found": /["'`>]Not found["'`<]/,
  "Not searched yet": /Not searched yet/,
  "cover art": /\b[Cc]over art\b/,
  "status bar": /\b[Ss]tatus bar\b/,
  // Any "n't" word, and a pronoun with 're, 've, 'll, 'd or 'm; straight or curly apostrophe, any case.
  contraction: /\b\w+n['\u2019]t\b|\b(?:I|you|we|they|it|he|she|that|there|what|who)['\u2019](?:re|ve|ll|d|m)\b/i,
  Please: /\bPlease\b/i,
  "Failed to": /\bFailed to\b/i,
  "e.g.": /\be\.g\./,
  // M400: a missing value in a table or card is "—" (NO_VALUE), in a sentence "not set"; never "none", "unknown" or "n/a".
  // Only a ternary drawn as JSX text ({x ? y : "none"}) is read, so a state or a key named "none" is left alone.
  "none as a value": /(?<![=\w])\{[^{}?]*\?[^{}]*:\s*["'`](?:none|unknown|n\/a)["'`]\s*\}|\?\?\s*["'`]n\/a["'`]/,
};

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
      .map(([path, hits]) => `${path} (${hits.join(", ")})`);
    expect(bad, `use the shared words in format/words.ts: ${bad.join("; ")}`).toEqual([]);
  });

  it("still sees each pattern", () => {
    expect(BANNED["Write N files"]!.test("Write 12 files")).toBe(true);
    expect(BANNED["Matched"]!.test('label: "Matched"')).toBe(true);
    expect(BANNED["Matched"]!.test("Matched tracks are kept")).toBe(false);
    expect(BANNED["Whole library"]!.test('label: "Whole library"')).toBe(true);
    expect(BANNED["Whole library"]!.test('label: "The whole library"')).toBe(true);
    expect(BANNED["Whole library"]!.test("The whole library will be analyzed again")).toBe(false);
    expect(BANNED["to review"]!.test("`${n} to review`")).toBe(true);
    expect(BANNED["contraction"]!.test("Couldn't")).toBe(true);
    for (const text of ["couldn't", "Don’t", "WON'T", "mustn't", "You’re", "we've", "it'll", "I'm"]) {
      expect(BANNED["contraction"]!.test(text), text).toBe(true);
    }
    expect(BANNED["contraction"]!.test("Could not, will not, it is")).toBe(false);
    expect(BANNED["none as a value"]!.test('<dd>{lastId ? shortReportId(lastId) : "none"}</dd>')).toBe(true);
    expect(BANNED["none as a value"]!.test('{status.sessionId ?? "n/a"}')).toBe(true);
    expect(BANNED["none as a value"]!.test('key={edited.length > 0 ? "edited" : "none"}')).toBe(false);
    expect(BANNED["none as a value"]!.test('setReading({ kind: "none" })')).toBe(false);
    expect(BANNED["Please"]!.test("please wait")).toBe(true);
    expect(BANNED["Failed to"]!.test("failed to load")).toBe(true);
  });
});

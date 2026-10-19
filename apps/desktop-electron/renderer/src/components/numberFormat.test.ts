/**
 * C169 guard: one way to write a count.
 *
 * - No `toLocaleString("en-US")`: grouping follows the computer's locale, through `formatCount`.
 * - No local plural helper: a function named `plural*` or `pluralize*` lives in `format/counts.ts`
 *   only (`countNoun`). The files below still own one; the page batch that owns each removes its
 *   helper and Z empties this list.
 *
 * Staleness: the "allow list has no stale entries" check runs only with CP_GUARD_STRICT=1. Batch Z
 * turns it on (and removes the condition) once every page batch is merged; until then a page batch
 * that removes its file's last offender must not fail this guard for it.
 */
import { describe, expect, it } from "vitest";

const STRICT = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CP_GUARD_STRICT === "1";

const sources = import.meta.glob(["/src/**/*.{ts,tsx}", "!/src/**/*.d.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Files that still define their own plural helper. Z empties this list. */

const ALLOW = ["screens/library/collectionTree.ts", "screens/library/libraryFormat.ts"];

const EN_US = /toLocaleString\(\s*["'`]en-US["'`]/;
const LOCAL_PLURAL = /\b(?:function|const|let)\s+plural\w*/;

function relative(path: string): string {
  return path.replace(/^\/src\//, "");
}

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\w])\/\/[^\n]*/g, "$1");
}

describe("number format guard (C169)", () => {
  it("has no toLocaleString(\"en-US\")", () => {
    const bad = Object.entries(sources)
      .filter(([path, source]) => !path.endsWith("numberFormat.test.ts") && EN_US.test(code(source)))
      .map(([path]) => relative(path))
      .sort();
    expect(bad, `use formatCount from format/counts in: ${bad.join(", ")}`).toEqual([]);
  });

  it("has no plural helper outside format/ except the listed files", () => {
    const found = Object.entries(sources)
      .filter(([path]) => !relative(path).startsWith("format/") && !path.endsWith("numberFormat.test.ts"))
      .filter(([, source]) => LOCAL_PLURAL.test(code(source)))
      .map(([path]) => relative(path))
      .sort();
    // Strict: exactly the listed files. Otherwise a listed file may have been cleaned already.
    if (STRICT) expect(found).toEqual([...ALLOW].sort());
    else expect(found.filter((path) => !ALLOW.includes(path))).toEqual([]);
  });

  it("still sees both patterns", () => {
    expect(EN_US.test('n.toLocaleString("en-US")')).toBe(true);
    expect(EN_US.test("n.toLocaleString()")).toBe(false);
    expect(LOCAL_PLURAL.test("function pluralize(n) {}")).toBe(true);
    expect(LOCAL_PLURAL.test("const pluralWord = (n) => n")).toBe(true);
    expect(LOCAL_PLURAL.test("const plurals = 1")).toBe(true);
    expect(LOCAL_PLURAL.test("import { plural } from './counts'")).toBe(false);
  });
});

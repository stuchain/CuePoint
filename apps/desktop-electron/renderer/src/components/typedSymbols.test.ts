/**
 * G6 T10 guard: no typed arrow, chevron, cross or pencil glyphs standing in for icons.
 *
 * These marks (`▸▾▼▲↑↓↻×✎✕`) are drawn with `PixelIcon` / `<Button iconOnly icon=…>` so they
 * look the same in every font and theme. There is no allowlist: the one thing left alone is an
 * arrow key named in a shortcut hint ("Alt+↑/↓"), which is the key's name and not an icon.
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

const SYMBOLS = /[▸▾▼▲↑↓↻×✎✕]/;

/**
 * C138: the drawn marks (tick, warning, star, heart, grip, filled and half dot, chevron) and a typed "+"
 * standing for add. Files that still type them are listed so the list can only shrink: a page
 * batch removes its file from here when it swaps in a `PixelIcon`.
 */
const MARKS = /[✓⚠●◐★♥⠿›]|["'`>]\+ ?[A-Za-z]/;
const MARKS_ALLOW = new Set([
  // A typed "›" (go-to arrow or breadcrumb) the stricter pattern found; the owning batch decides.
  "screens/clean/match/CandidatePanel.tsx",
  "screens/clean/match/MatchRunLine.tsx",
  "screens/library/QuickFilters.tsx",
  "screens/library/TagManagerDialog.tsx",
  "screens/library/scopePath.ts",
  "screens/prepare/prepareFormat.ts",
  "components/OnboardingDialog.tsx",
  "screens/discover/similarColumns.tsx",
  "screens/library/FilterBar.tsx",
  "screens/library/FirstSteps.tsx",
  "screens/library/TrackBeatportSection.tsx",
  "screens/library/TrackYours.tsx",
  "screens/library/filterText.ts",
  "screens/library/trackMenu.ts",
  "screens/prepare/WarningCell.tsx",
  "screens/prepare/prepareColumns.tsx",
]);

/** Source with comments removed, an arrow key in a shortcut hint (`+↑`, `+↑/↓`) and a multiplication sign after a digit ("1.5×") or a template value (`${scale}×`) left alone. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\w])\/\/[^\n]*/g, "$1")
    .replace(/\+[↑↓](\/[↑↓])?/g, "+key")
    .replace(/([\d}])×/g, "$1x")
    .replace(/(\w) × (\w)/g, "$1 x $2");
}

function offenders(): string[] {
  return Object.entries(sources)
    .filter(([, source]) => SYMBOLS.test(codeOf(source)))
    .map(([path]) => path.replace(/^\/src\//, ""))
    .sort();
}

function markOffenders(): string[] {
  return Object.entries(sources)
    .filter(([, source]) => MARKS.test(codeOf(source)))
    .map(([path]) => path.replace(/^\/src\//, ""))
    .sort();
}

describe("typed marks guard (C138)", () => {
  it("types a tick, warning, star, heart, grip, dot or plus only where listed", () => {
    const found = markOffenders().filter((path) => !MARKS_ALLOW.has(path));
    expect(found, `draw these with PixelIcon in: ${found.join(", ")}`).toEqual([]);
  });

  it.runIf(STRICT)("lists only files that still type one", () => {
    const found = new Set(markOffenders());
    const stale = [...MARKS_ALLOW].filter((path) => !found.has(path));
    expect(stale, `remove from MARKS_ALLOW: ${stale.join(", ")}`).toEqual([]);
  });

  it("still sees a typed mark", () => {
    expect(MARKS.test(codeOf("<span>✓</span>"))).toBe(true);
    expect(MARKS.test(codeOf('label: "+ New"'))).toBe(true);
    expect(MARKS.test(codeOf("const sum = a + b;"))).toBe(false);
    expect(MARKS.test(codeOf("<span>Open ›</span>"))).toBe(true);
    expect(MARKS.test(codeOf('label: "+New"'))).toBe(true);
    expect(MARKS.test(codeOf("<button>+Add</button>"))).toBe(true);
    expect(MARKS.test(codeOf('const n = "+12"'))).toBe(false);
  });
});

describe("typed symbols guard (T10)", () => {
  it("has no file that types an icon glyph", () => {
    const found = offenders();
    expect(found, `use PixelIcon instead of a typed glyph in: ${found.join(", ")}`).toEqual([]);
  });

  it("still sees a glyph when one is typed", () => {
    expect(SYMBOLS.test(codeOf("<span>▸</span>"))).toBe(true);
    expect(SYMBOLS.test(codeOf("text: `Volume (${mod}+↑/↓)`"))).toBe(false);
    expect(SYMBOLS.test(codeOf("<span>↑</span>"))).toBe(true);
  });

  it("covers the shared components built in G6 step 2", () => {
    const shared = ["components/Modal.tsx", "components/TrackContextMenu.tsx", "components/Select.tsx"];
    for (const path of shared) expect(Object.keys(sources)).toContain(`/src/${path}`);
  });
});

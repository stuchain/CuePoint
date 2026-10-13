/**
 * G6 T2 guard: one divider. A frame or rule between two things is `var(--divider)`; no sheet
 * spells `--border-width` itself, except the player bar (C16c) and the player badge.
 */
import { describe, expect, it } from "vitest";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

/** Sheets that keep `--border-width` on purpose. */
const EXEMPT_SHEETS = [
  "/src/components/player/", // the player bar keeps its 3px look (C16c)
  "/src/components/waveform/WaveformDetailStrip.css", // the player region's detail strip, same look (C16c)
];

/** Remaining uses elsewhere, each with its reason. A declaration is matched by its sheet and text. */
export const BORDER_WIDTH_ALLOWLIST: ReadonlyArray<{ sheet: string; text: string; reason: string }> = [
  { sheet: "/src/tokens/tokens.css", text: "--border-width:", reason: "the token definition" },
  {
    sheet: "/src/components/Badge.css",
    text: "border: var(--border-width) solid var(--border-outline)",
    reason: ".cp-badge--player: the queue badge keeps its bevelled look (C16c)",
  },
  {
    sheet: "/src/components/wheel/CamelotWheel.css",
    text: "stroke-width: var(--border-width)",
    reason: "an SVG stroke, not a border",
  },
  {
    sheet: "/src/screens/library/CollectionsPane.css",
    text: "border-top: var(--border-width) dashed",
    reason: "the drop-target insertion line, not a divider",
  },
  {
    sheet: "/src/screens/library/CollectionsPane.css",
    text: "border: var(--border-width) solid var(--accent-primary)",
    reason: "the inline rename field's frame, an editing state",
  },
];

function code(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function uses(): Array<{ sheet: string; line: string }> {
  const out: Array<{ sheet: string; line: string }> = [];
  for (const [sheet, css] of Object.entries(sheets)) {
    if (EXEMPT_SHEETS.some((prefix) => sheet.startsWith(prefix))) continue;
    for (const line of code(css).split("\n")) {
      // `--border-width-heavy` and `--control-border-width` are other tokens; only the plain one counts.
      if (/(?<![\w-])--border-width(?![\w-])/.test(line)) out.push({ sheet, line: line.trim() });
    }
  }
  return out;
}

describe("one divider (T2)", () => {
  it("finds the sheets", () => {
    expect(Object.keys(sheets).length).toBeGreaterThan(40);
    expect(sheets["/src/tokens/tokens.css"]).toContain("--divider:");
  });

  it("uses --border-width only where the allowlist says", () => {
    const fresh = uses().filter(
      (u) => !BORDER_WIDTH_ALLOWLIST.some((a) => a.sheet === u.sheet && u.line.includes(a.text)),
    );
    expect(fresh, `use var(--divider): ${JSON.stringify(fresh)}`).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    const found = uses();
    const stale = BORDER_WIDTH_ALLOWLIST.filter(
      (a) => !found.some((u) => u.sheet === a.sheet && u.line.includes(a.text)),
    );
    expect(stale).toEqual([]);
  });

  it("leaves the player bar and badge on their own borders", () => {
    expect(sheets["/src/components/player/PlayerBar.css"]).toMatch(/--border-width/);
    expect(sheets["/src/components/Badge.css"]).toMatch(/\.cp-badge--player \{[^}]*--border-width/);
  });
});

/**
 * G6 T16 guard: one focus ring. Any `outline` that sets a colour uses `--focus-ring`
 * (player sheets included: the colour is a value, the bar's look is C16c's). `none`, `0`
 * and `transparent` are not colours.
 *
 * C17: one offset too. An outline is drawn `--focus-ring-offset` outside the control, or
 * `--focus-ring-offset-inset` inside it where the control is clipped (a row, a header cell); no
 * sheet states its own number. The sheets in `OWN_OFFSET` still do; their page batch converts
 * them and Z empties the list.
 */
import { describe, expect, it } from "vitest";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

/** Outlines that are not focus, with the reason. */
export const NOT_FOCUS_OUTLINES: ReadonlyArray<{ sheet: string; value: string; reason: string }> = [
  {
    sheet: "/src/screens/library/CollectionsPane.css",
    value: "var(--focus-ring-width) solid var(--accent-primary)",
    reason: "drop target, not focus",
  },
];

/** Sheets that still state their own outline-offset. Z empties this list. */
const OWN_OFFSET = [
  "/src/screens/library/CreditLinks.css",
  "/src/screens/library/CollectionsPane.css",
  "/src/screens/library/TrackDetailPanel.css",
  "/src/screens/library/PlaylistPane.css",
  "/src/screens/discover/discover.css",
  "/src/screens/discover/discoverCards.css",
  "/src/screens/prepare/prepare.css",
];

function offsets(): Array<{ sheet: string; value: string }> {
  const out: Array<{ sheet: string; value: string }> = [];
  for (const [sheet, css] of Object.entries(sheets)) {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of code.matchAll(/outline-offset\s*:\s*([^;}]+)/g)) out.push({ sheet, value: m[1]!.trim() });
  }
  return out;
}

function outlines(): Array<{ sheet: string; value: string }> {
  const out: Array<{ sheet: string; value: string }> = [];
  for (const [sheet, css] of Object.entries(sheets)) {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of code.matchAll(/(?<![\w-])outline\s*:\s*([^;}]+)/g)) {
      out.push({ sheet, value: m[1]!.trim() });
    }
  }
  return out;
}

describe("one focus ring (T16)", () => {
  it("finds outlines", () => {
    expect(outlines().length).toBeGreaterThan(30);
  });

  it("colours every outline with --focus-ring", () => {
    const bad = outlines().filter(
      ({ sheet, value }) =>
        !/^(none|0|transparent)$/.test(value) &&
        !value.includes("var(--focus-ring)") &&
        !NOT_FOCUS_OUTLINES.some((o) => o.sheet === sheet && o.value === value),
    );
    expect(bad, JSON.stringify(bad)).toEqual([]);
  });

  it("gives the ring its width token outside the player sheets", () => {
    const wrong = outlines().filter(
      ({ sheet, value }) =>
        value.includes("var(--focus-ring)") &&
        !sheet.startsWith("/src/components/player/") &&
        !value.startsWith("var(--focus-ring-width)"),
    );
    expect(wrong).toEqual([]);
  });

  it("draws every ring at the one offset, or the one inset (C17)", () => {
    const allowed = ["var(--focus-ring-offset)", "var(--focus-ring-offset-inset)"];
    const bad = offsets().filter(({ sheet, value }) => !allowed.includes(value) && !OWN_OFFSET.includes(sheet));
    expect(bad, JSON.stringify(bad)).toEqual([]);
  });

  it("lists only sheets that still state their own offset", () => {
    for (const sheet of OWN_OFFSET) {
      const own = offsets().filter(
        (o) => o.sheet === sheet && !["var(--focus-ring-offset)", "var(--focus-ring-offset-inset)"].includes(o.value),
      );
      expect(own.length, `${sheet} is clean: take it off OWN_OFFSET`).toBeGreaterThan(0);
    }
  });

  it("states the ring once, in index.css", () => {
    const root = sheets["/src/index.css"] ?? "";
    expect(root).toMatch(/:where\(:focus-visible\)\s*\{[^}]*outline:\s*var\(--focus-ring-width\) solid var\(--focus-ring\)[^}]*outline-offset:\s*var\(--focus-ring-offset\)/);
  });
});

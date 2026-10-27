/**
 * G6 T16 guard: one focus ring. Any `outline` that sets a colour uses `--focus-ring`
 * (player sheets included: the colour is a value, the bar's look is C16c's). `none`, `0`
 * and `transparent` are not colours.
 *
 * C17: one offset too. An outline is drawn `--focus-ring-offset` outside the control, or
 * `--focus-ring-offset-inset` inside it where the control is clipped (a row, a header cell); no
 * sheet states its own number.
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
  {
    sheet: "/src/screens/library/QuickFilters.css",
    value: "var(--focus-ring-width) solid var(--accent-primary)",
    reason: "a ticked key is outlined so colour is never the only sign (M111), not focus",
  },
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
    // M328 (D29, DEC-302): a filled button's ring stands one ring width off its edge
    // (--focus-ring-offset-filled, index.css), so the ground shows between a fill and a ring of its colour.
    const allowed = ["var(--focus-ring-offset)", "var(--focus-ring-offset-inset)", "var(--focus-ring-offset-filled)", "calc(-1 * var(--focus-ring-width))" /* QuickFilters ticked key (M111) */];
    const bad = offsets().filter(({ value }) => !allowed.includes(value));
    expect(bad, JSON.stringify(bad)).toEqual([]);
  });

  it("states the ring once, in index.css", () => {
    const root = sheets["/src/index.css"] ?? "";
    expect(root).toMatch(/:where\(:focus-visible\)\s*\{[^}]*outline:\s*var\(--focus-ring-width\) solid var\(--focus-ring\)[^}]*outline-offset:\s*var\(--focus-ring-offset\)/);
  });

  // P64: the ring sits flush on the control; items inside a pane or list draw it one width inside.
  it("keeps the outside offset at 0 and the inset at minus one ring width (P64)", () => {
    const tokens = sheets["/src/tokens/tokens.css"] ?? "";
    expect(tokens).toMatch(/--focus-ring-offset:\s*0px;/);
    expect(tokens).toMatch(/--focus-ring-offset-inset:\s*calc\(-1 \* var\(--focus-ring-width\)\)/);
  });

  // P28: one list hover; never a hover under the keyboard's ring. Round 3 (M337, D30): a 6% shade
  // of the text colour, quieter than the old --hover-fill step.
  it("makes the one row hover a 6% shade and keeps it off the keyboard's row (P28, P64, D30)", () => {
    expect(sheets["/src/tokens/tokens.css"]).toMatch(/--row-hover:\s*color-mix\(in srgb, var\(--fg-primary\) 6%, transparent\)/);
    expect(sheets["/src/components/table/TrackTable.css"]).toMatch(
      /\.track-table__row--cursor:not\(\.track-table__row--selected\):hover\s*\{\s*background:\s*none/,
    );
  });
});

/**
 * G6 T16 guard: one focus ring. Any `outline` that sets a colour uses `--focus-ring`
 * (player sheets included: the colour is a value, the bar's look is C16c's). `none`, `0`
 * and `transparent` are not colours.
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
});

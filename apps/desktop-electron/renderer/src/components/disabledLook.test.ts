/**
 * C2 / T6 guard: nothing is greyed by opacity. A disabled control (`:disabled`, `[aria-disabled]`)
 * is drawn in `--fg-disabled` on the quiet panel look and keeps full opacity, so the text keeps
 * its contrast and a disabled control never looks like a fading one.
 */
import { describe, expect, it } from "vitest";
import { parseRules, selectorList, stripComments } from "../test/cssRules";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const DISABLED_SELECTOR = /:disabled|\[aria-disabled|\[disabled|:is\(\[disabled\]/;

function offenders(css: string): string[] {
  return parseRules(stripComments(css))
    .filter((rule) => selectorList(rule.selector).some((s) => DISABLED_SELECTOR.test(s)))
    .filter((rule) => /(^|[;\s])opacity\s*:/.test(rule.body))
    .map((rule) => rule.selector.replace(/\s+/g, " ").slice(0, 80));
}

describe("disabled look guard (C2)", () => {
  it("has no opacity inside a disabled rule", () => {
    const bad = Object.entries(sheets).flatMap(([path, css]) =>
      offenders(css).map((selector) => `${path.replace(/^\/src\//, "")}: ${selector}`),
    );
    expect(bad).toEqual([]);
    expect(Object.keys(sheets).length).toBeGreaterThan(40);
  });

  it("still sees an opacity in a disabled rule", () => {
    expect(offenders('a[aria-disabled="true"] { opacity: .5; }')).toHaveLength(1);
    expect(offenders("button:disabled { opacity: .5; }")).toHaveLength(1);
    expect(offenders("button:disabled { color: gray; }")).toHaveLength(0);
    expect(offenders(".fade { opacity: .5; }")).toHaveLength(0);
  });
});

/**
 * C65 / TY19 guard: a font weight is one of the four named weights (`--font-weight-regular`,
 * `-medium`, `-semibold`, `-bold`), never a number typed into a rule. The numbers live in
 * tokens/tokens.css and nowhere else.
 */
import { describe, expect, it } from "vitest";

const sheets = import.meta.glob(["/src/**/*.css", "!/src/tokens/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** A number or a keyword: `bold`, `bolder`, `lighter` and `normal` are weights too. */
const LITERAL_WEIGHT = /font-weight:\s*(?:\d|bold|bolder|lighter|normal)/i;

describe("font weight guard (C65)", () => {
  it("has no literal font-weight outside tokens/", () => {
    const bad = Object.entries(sheets)
      .filter(([, css]) => LITERAL_WEIGHT.test(css.replace(/\/\*[\s\S]*?\*\//g, "")))
      .map(([path]) => path.replace(/^\/src\//, ""))
      .sort();
    expect(bad, `use var(--font-weight-*) in: ${bad.join(", ")}`).toEqual([]);
    expect(Object.keys(sheets).length).toBeGreaterThan(40);
  });

  it("still sees a literal weight", () => {
    expect(LITERAL_WEIGHT.test("a { font-weight: 700; }")).toBe(true);
    expect(LITERAL_WEIGHT.test("a { font-weight: var(--font-weight-bold); }")).toBe(false);
    for (const keyword of ["bold", "bolder", "lighter", "normal", "BOLD"]) {
      expect(LITERAL_WEIGHT.test(`a { font-weight: ${keyword}; }`)).toBe(true);
    }
    expect(LITERAL_WEIGHT.test("a { font-weight: inherit; }")).toBe(false);
  });
});

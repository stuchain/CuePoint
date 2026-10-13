/** G6 N3 guard: labels are sentence case as typed; no sheet shouts with `text-transform: uppercase`. */
import { describe, expect, it } from "vitest";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

describe("sentence case (N3)", () => {
  it("has no text-transform: uppercase in any stylesheet", () => {
    const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
    const bad = Object.entries(sheets)
      .filter(([, css]) => /text-transform\s*:\s*uppercase/.test(code(css)))
      .map(([sheet]) => sheet);
    expect(bad).toEqual([]);
    expect(Object.keys(sheets).length).toBeGreaterThan(40);
  });
});

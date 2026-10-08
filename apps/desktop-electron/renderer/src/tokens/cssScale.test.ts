/**
 * The pixel style stays sharp at 1.5× only if no size lands on a half pixel
 * (DEC-161). A `calc(<n>px * var(--scale))` whose base times 1.5 is not whole
 * does, unless `round(` wraps it; 1px hairlines use `var(--hairline)`.
 */
import { describe, expect, it } from "vitest";

const sheets = import.meta.glob("../**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SCALED = /calc\(\s*(-?\d*\.?\d+)px\s*\*\s*var\(--scale\)\s*\)/g;

/** Every `calc(<n>px * var(--scale))` whose 1.5× value is fractional and which no `round(` encloses. */
function findFractionalSizes(css: string): number[] {
  const lines: number[] = [];
  css.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(SCALED)) {
      const base = Number(match[1]);
      if (Number.isInteger(base * 1.5)) continue;
      const before = line.slice(0, match.index);
      const opens = (before.match(/round\(/g) ?? []).length;
      const insideRound = opens > 0 && (before.match(/\)/g) ?? []).length < (before.match(/\(/g) ?? []).length;
      if (insideRound) continue;
      lines.push(index + 1);
    }
  });
  return lines;
}

describe("sizes at 1.5×", () => {
  it("fails on a bare calc(1px * var(--scale))", () => {
    const fixture = [
      ".a { border: 2px solid red; }",
      ".b { border-width: calc(1px * var(--scale)); }",
      ".c { margin: round(down, calc(3px * var(--scale)), 1px); }",
      ".d { margin: calc(4px * var(--scale)); }",
      ".e { top: calc(-1px * var(--scale)); }",
    ].join("\n");
    expect(findFractionalSizes(fixture)).toEqual([2, 5]);
  });

  it("finds a stylesheet to read", () => {
    expect(Object.keys(sheets).length).toBeGreaterThan(20);
  });

  it("is whole in every stylesheet", () => {
    const found = Object.entries(sheets).flatMap(([file, css]) =>
      findFractionalSizes(css).map((line) => `${file}:${line}`),
    );
    expect(found).toEqual([]);
  });
});

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

const SIZES = [1, 1.5, 2, 3];

/** Evaluate a `calc()` body built from `--unit`, the spacing tokens and `--scale`; null when it holds anything else (vw, %, em). */
function valueAt(body: string, scale: number): number | null {
  const unit = 4 * scale;
  const steps: Record<string, number> = { xs: 1, sm: 1.5, md: 2, lg: 3, xl: 4 };
  const text = body
    .replace(/var\(--unit\)/g, `(${unit})`)
    .replace(/var\(--space-(xs|sm|md|lg|xl)\)/g, (_, step: string) => `(${unit * steps[step]!})`)
    .replace(/var\(--scale\)/g, `(${scale})`)
    .replace(/(\d)px/g, "$1");
  if (!/^[\d\s.+\-*/()]+$/.test(text)) return null;
  try {
    return Function(`"use strict"; return (${text});`)() as number;
  } catch {
    return null;
  }
}

/**
 * Lines holding a `calc()` over --unit or a --space-* token, scaled or divided by a number,
 * that is not whole at one of the four sizes and which no `round(` encloses (DEC-161).
 */
function findFractionalSpacing(css: string): number[] {
  const lines: number[] = [];
  const text = css;
  const seen = new Set<number>();
  for (let at = text.indexOf("calc("); at !== -1; at = text.indexOf("calc(", at + 1)) {
    // The matching close, and whether a round( encloses this calc.
    const stack: boolean[] = [];
    for (let i = 0; i < at; i += 1) {
      if (text[i] === "(") stack.push(text.slice(Math.max(0, i - 5), i) === "round");
      else if (text[i] === ")") stack.pop();
    }
    if (stack.some(Boolean)) continue;
    let depth = 0;
    let end = at + 4;
    for (; end < text.length; end += 1) {
      if (text[end] === "(") depth += 1;
      else if (text[end] === ")" && --depth === 0) break;
    }
    const body = text.slice(at + 5, end);
    if (!/var\(--(unit|space-[a-z]+)\)/.test(body) || !/[*/]/.test(body)) continue;
    const fractional = SIZES.some((scale) => {
      const value = valueAt(body, scale);
      return value !== null && Math.abs(value - Math.round(value)) > 1e-9;
    });
    const line = text.slice(0, at).split("\n").length;
    if (fractional && !seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
}

describe("spacing tokens times or over a number", () => {
  it("fails on a fraction of a token outside round()", () => {
    const fixture = [
      ".a { padding: calc(var(--space-xs) / 4); }",
      ".b { padding: round(down, calc(var(--space-xs) / 4), 1px); }",
      ".c { gap: calc(var(--space-xs) * 2 / 3); }",
      ".d { gap: calc(var(--unit) * 1.5); }",
      ".e { gap: calc(var(--space-xs) / 2); }",
      ".f { width: calc(var(--unit) * 70); }",
      ".g { width: min(calc(var(--unit) * 120), calc(100vw - var(--space-lg))); }",
    ].join("\n");
    expect(findFractionalSpacing(fixture)).toEqual([1, 3]);
  });

  it("is whole in every stylesheet at 1×, 1.5×, 2× and 3×", () => {
    const found = Object.entries(sheets).flatMap(([file, css]) =>
      findFractionalSpacing(css).map((line) => `${file}:${line}`),
    );
    expect(found).toEqual([]);
  });
});

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

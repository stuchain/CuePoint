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

const SIZES = [1, 1.25, 1.5, 2, 3];

/** Evaluate a `calc()` body built from `--unit`, the spacing tokens and `--scale`; null when it holds anything else (vw, %, em). */
function valueAt(body: string, scale: number): number | null {
  const unit = 4 * scale;
  const steps: Record<string, number> = { "2xs": 0.5, xs: 1, sm: 1.5, md: 2, lg: 3, xl: 4, "2xl": 6 };
  const text = body
    .replace(/var\(--unit\)/g, `(${unit})`)
    .replace(/var\(--space-(2xs|xs|sm|md|lg|xl|2xl)\)/g, (_, step: string) => `(${unit * steps[step]!})`)
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
    if (!/var\(--(unit|space-[a-z0-9]+)\)/.test(body) || !/[*/]/.test(body)) continue;
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
      ".d { gap: calc(var(--unit) * 2); }",
      ".e { gap: calc(var(--space-xs) * 2); }",
      ".f { width: calc(var(--unit) * 70); }",
      ".g { width: min(calc(var(--unit) * 120), calc(100vw - var(--space-lg))); }",
    ].join("\n");
    expect(findFractionalSpacing(fixture)).toEqual([1, 3]);
  });

  it("is whole in every stylesheet at 1×, 1.25×, 1.5×, 2× and 3×", () => {
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

/**
 * A rem length is the browser's font size, not the app's scale, so it does not follow the text
 * size (R2-4). Sizes are `calc(<n>px * var(--scale))`; `calc(<n>rem * var(--scale))` is still a
 * rem length and counts. The files below belong to other threads: each entry is the number of rem
 * lengths it still has, and may only shrink.
 */
const KNOWN_EXCEPTIONS: Record<string, number> = {
};

const REM = /(?<![\w-])-?\d*\.?\d+rem\b/g;

function countRem(css: string): number {
  return (css.replace(/\/\*[\s\S]*?\*\//g, "").match(REM) ?? []).length;
}

describe("rem lengths (R2-4)", () => {
  it("counts a rem length, scaled or not, and ignores comments and names", () => {
    const fixture = [
      "/* 18rem of a pane */",
      ".a { width: 5rem; }",
      ".b { width: calc(7rem * var(--scale)); }",
      ".c { width: calc(7px * var(--scale)); }",
      ".cp-queue__remove { gap: 1.5rem; }",
    ].join("\n");
    expect(countRem(fixture)).toBe(3);
  });

  it("is absent from every stylesheet under screens and components, bar the known exceptions", () => {
    const found: Record<string, number> = {};
    for (const [file, css] of Object.entries(sheets)) {
      const path = file.replace(/^\.\.\//, "");
      if (!path.startsWith("screens/") && !path.startsWith("components/")) continue;
      const count = countRem(css);
      if (count > 0) found[path] = count;
    }
    const problems: string[] = [];
    for (const [path, count] of Object.entries(found)) {
      const allowed = KNOWN_EXCEPTIONS[path] ?? 0;
      if (count > allowed) {
        problems.push(`${path} has ${count} rem length(s), ${allowed} allowed: use calc(<n>px * var(--scale))`);
      }
    }
    for (const [path, allowed] of Object.entries(KNOWN_EXCEPTIONS)) {
      const count = found[path] ?? 0;
      if (count < allowed) {
        problems.push(`${path} now has ${count} rem length(s), ${allowed} listed: delete or lower its entry in KNOWN_EXCEPTIONS`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("pixel icon sizes snap on their own (C136)", () => {
  const css = sheets["./tokens.css"] ?? sheets["../tokens/tokens.css"] ?? "";
  // M493: the sizes are snapped to device pixels, so the expression carries --dpr (1 when unset):
  // max(12 device px, the base at the scale rounded down to 12 device px), in CSS px.
  const expression = (name: string) =>
    new RegExp(
      `--icon-size-${name}:\\s*max\\(calc\\(12px / var\\(--dpr, 1\\)\\),\\s*calc\\(round\\(down,\\s*calc\\((\\d+)px \\* var\\(--scale\\) \\* var\\(--dpr, 1\\)\\),\\s*12px\\) / var\\(--dpr, 1\\)\\)\\);`,
    ).exec(css);

  /** What the token resolves to at a scale and pixel ratio: whole 12-device-pixel cells, never under 12. */
  const sizeAt = (name: string, scale: number, dpr = 1) => {
    const match = expression(name);
    expect(match, `--icon-size-${name} is a rounded-down calc`).not.toBeNull();
    return Math.max(12 / dpr, (Math.floor((Number(match![1]) * scale * dpr) / 12) * 12) / dpr);
  };

  it.each([1.25, 1.5])("lands every icon size on whole device pixels at --dpr %s (M493)", (dpr) => {
    for (const scale of SIZES) {
      for (const name of ["sm", "lg"]) {
        const device = sizeAt(name, scale, dpr) * dpr;
        expect(Math.abs(device - Math.round(device)), `${name} at ${scale}x`).toBeLessThan(1e-9);
        expect(Math.round(device) % 12, `${name} at ${scale}x`).toBe(0);
      }
    }
  });

  it.each([
    ["sm", [12, 12, 24, 24, 48]],
    ["lg", [24, 24, 36, 48, 72]],
  ] as const)("--icon-size-%s is whole 12px cells at 1, 1.25, 1.5, 2 and 3", (name, expected) => {
    expect(SIZES.map((scale) => sizeAt(name, scale))).toEqual([...expected]);
  });

  it("never lets a size fall under its own 12px grid or above the next size up", () => {
    for (const scale of SIZES) {
      expect(sizeAt("sm", scale)).toBeLessThanOrEqual(sizeAt("lg", scale));
      for (const name of ["sm", "lg"]) expect(sizeAt(name, scale) % 12).toBe(0);
    }
  });

  it("snaps the hairline to whole device pixels and keeps it one pixel at every scale (M493, M82)", () => {
    expect(css).toMatch(
      /--hairline:\s*max\(calc\(1px \/ var\(--dpr, 1\)\),\s*calc\(round\(down,\s*calc\(1px \* var\(--dpr, 1\)\),\s*1px\) \/ var\(--dpr, 1\)\)\);/,
    );
    const hairline = (dpr: number) => Math.max(1 / dpr, Math.floor(dpr) / dpr);
    expect([1, 1.25, 1.5, 2].map((dpr) => hairline(dpr) * dpr)).toEqual([1, 1, 1, 2]);
    // No --scale in it: a header rule is the same thin line at 1x and 3x (M82).
    expect(/--hairline:[^;]*--scale/.test(css)).toBe(false);
  });

  it("has no medium: --icon-size-md is gone, and no sheet reads it (M28)", () => {
    // Moved for M28: the alias of lg is deleted now that its last uses moved.
    expect(/--icon-size-md/.test(css)).toBe(false);
    for (const [path, sheet] of Object.entries(sheets)) {
      expect(/--icon-size-md|cp-pixel-icon--md/.test(String(sheet)), path).toBe(false);
    }
  });
});

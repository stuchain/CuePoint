/**
 * Numbers are set in the data font with tabular figures (DEC-048, R4-3). Each place below
 * is a spot where figures appear; the test reads the source as text and checks the spot
 * really gets `--font-data` / `cp-data`.
 *
 * To add a place (keys, Discover, Prepare...), append one row to DATA_PLACES: either a CSS
 * rule (`file` + `selector`, which must declare `font-family: var(--font-data)` or
 * `font-variant-numeric: tabular-nums`) or a TSX source (`file` + `needle`, which must sit
 * on a line with the `cp-data` class). Paths are relative to renderer/src.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>(
  ["../components/**/*.{css,tsx}", "../screens/**/*.{css,tsx}", "../index.css", "./*.css"],
  { query: "?raw", import: "default", eager: true },
);

function source(file: string): string {
  const found = sources[file];
  if (found === undefined) throw new Error(`no source ${file}`);
  return found;
}

type DataPlace =
  | { name: string; file: string; selector: string }
  | { name: string; file: string; needle: string };

const DATA_PLACES: DataPlace[] = [
  { name: "TrackTable cell values", file: "../components/table/TrackTable.css", selector: ".track-table__cell" },
  { name: "Badge figures", file: "../components/Badge.css", selector: ".cp-badge" },
  { name: "Tabs counts", file: "../components/Tabs.css", selector: ".cp-tabs__detail" },
  { name: "key chip", file: "../components/wheel/KeyChip.tsx", needle: "key-chip--" },
  { name: "Library toolbar count", file: "../screens/library/LibraryToolbar.tsx", needle: "library-toolbar__count " },
  { name: "Library header facts", file: "../screens/library/LibraryHeader.tsx", needle: 'data-testid={index === 0 ? "library-track-count"' },
];

/** The declaration block of the first rule whose selector list contains `selector` exactly. */
function ruleBody(css: string, selector: string): string {
  const rules = css.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const [, selectors, body] of rules) {
    const list = selectors.replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((part) => part.trim());
    if (list.includes(selector)) return body;
  }
  throw new Error(`no rule for ${selector}`);
}

describe("the data font", () => {
  it.each(DATA_PLACES)("$name uses it", (place) => {
    const text = source(place.file);
    if ("selector" in place) {
      const body = ruleBody(text, place.selector);
      expect(body).toMatch(/font-family:\s*var\(--font-data\)|font-variant-numeric:\s*tabular-nums/);
      return;
    }
    const at = text.indexOf(place.needle);
    expect(at, `${place.needle} in ${place.file}`).toBeGreaterThanOrEqual(0);
    // The class sits in the same element: this line or the two around it.
    const lines = text.slice(0, at).split("\n").length - 1;
    const near = text.split("\n").slice(Math.max(0, lines - 2), lines + 3).join("\n");
    expect(near).toContain("cp-data");
  });

  it("is defined once, with tabular figures", () => {
    expect(ruleBody(source("../index.css"), ".cp-data")).toMatch(
      /font-family:\s*var\(--font-data\)[\s\S]*tabular-nums/,
    );
  });

  it("sets digits inside pixel words in the data face (area 56)", () => {
    const fonts = source("./fonts.css");
    expect(fonts).toMatch(/font-family:\s*"CuePoint Digits"/);
    // Only the figures and the signs numbers use: never letters.
    expect(fonts).toMatch(/unicode-range:\s*U\+0025,\s*U\+0028-0029,\s*U\+002B,\s*U\+0030-003A,\s*U\+2013-2014,\s*U\+2212/);
    // Not the comma, hyphen or full stop of ordinary words (U+002C-002E), which are pixel-face in
    // a sentence; the brackets of "(67)" are, so a count reads in one face (B8).
    for (const range of fonts.match(/unicode-range:[^;]*;/g) ?? []) {
      expect(range).not.toMatch(/U\+002C|U\+002D|U\+002E|U\+002B-002E/);
    }
    expect(source("./tokens.css")).toMatch(/--font-pixel-digits:\s*"CuePoint Digits",\s*var\(--font-pixel\)/);
    // Buttons, tabs, fields, selects and chips take it; the page body gives it to the rest.
    for (const file of ["Button", "Tabs", "TextField", "Select", "SearchField", "Badge"]) {
      expect(source(`../components/${file}.css`), file).toContain("var(--font-pixel-digits)");
    }
    expect(source("./tokens.css")).toMatch(/color: var\(--fg-primary\);\s*\/\*[^*]*\*\/\s*font-family: var\(--font-pixel-digits\)/);
    expect(ruleBody(source("../index.css"), ".cp-digits")).toContain("var(--font-pixel-digits)");
  });

  it("draws the flat and sharp signs in pixel style, at both weights (B12)", () => {
    // Pixelify Sans has neither, so "A♭ minor" fell back to another font and the sign floated.
    const fonts = source("./fonts.css");
    for (const weight of ["400", "700"]) {
      const face = fonts.match(
        new RegExp(`@font-face\\s*\\{[^}]*font-weight:\\s*${weight};[^}]*key-signs-${weight}\\.woff2[^}]*\\}`),
      );
      expect(face, `key signs ${weight}`).not.toBeNull();
      expect(face?.[0]).toContain('font-family: "CuePoint Digits"');
      expect(face?.[0]).toMatch(/unicode-range:\s*U\+266D,\s*U\+266F;/);
    }
  });
});

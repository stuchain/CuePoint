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
  ["../components/**/*.{css,tsx}", "../screens/**/*.{css,tsx}", "../index.css"],
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
});

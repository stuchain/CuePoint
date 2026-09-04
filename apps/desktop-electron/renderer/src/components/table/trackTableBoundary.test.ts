/**
 * The table stays generic, and the old one stays untouched (LIBUI-04, DEC-041).
 *
 * Two boundaries, neither of which a behavioural test can see.
 *
 * **`TrackTable` knows about no particular kind of track.** The moment it
 * imports `mocks/`, the match-result shape, or a library type, it is no longer
 * a component two more phases can adopt — and nothing about how it renders
 * would change to say so.
 *
 * **`ResultsTable` is not being refactored.** DEC-041 chose to extract rather
 * than rewrite: the results screen keeps the component that has worked for a
 * year until Phase 7 converges them. An edit to it during Phase 4 is a
 * decision nobody took.
 */
import { describe, expect, it } from "vitest";

import trackTable from "./TrackTable.tsx?raw";
import trackTableLayout from "./trackTableLayout.ts?raw";
import trackTableSource from "./trackTableSource.ts?raw";
import resultsTable from "../ResultsTable.tsx?raw";
import resultsTableLayout from "../resultsTableLayout.ts?raw";

/** Every module path a file imports. */
function imports(source: string): string[] {
  return [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
}

/**
 * The file without its comments.
 *
 * The property is what the code depends on, not what the prose mentions —
 * these modules explain themselves by naming the row types other phases will
 * pass in, and a test that could not tell the difference would be answered by
 * deleting a sentence.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

describe("TrackTable is generic", () => {
  const generic = [trackTable, trackTableLayout, trackTableSource];

  it.each(generic.map((source, i) => [i, source]))(
    "module %i imports nothing from mocks/",
    (_index, source) => {
      expect(imports(source as string).filter((path) => path.includes("mocks"))).toEqual([]);
    },
  );

  it("names no application row type in its code", () => {
    // TrackResult is the match screen's; LibraryTrackRow is the library's.
    // Either one here would be a component pretending to be generic.
    for (const source of generic) {
      expect(codeOnly(source)).not.toContain("TrackResult");
      expect(codeOnly(source)).not.toContain("LibraryTrackRow");
    }
  });

  it("imports no bridge or API module", () => {
    for (const source of generic) {
      const paths = imports(source);
      expect(paths.filter((path) => path.includes("/api/"))).toEqual([]);
      expect(paths.filter((path) => path.includes("cuepointBridge"))).toEqual([]);
    }
  });

  it("takes its columns and its rows as arguments", () => {
    expect(trackTable).toContain("columns:");
    expect(trackTable).toContain("source:");
  });
});

describe("ResultsTable is left alone", () => {
  it("still reads the match-result columns", () => {
    // If Phase 4 had rewritten it in place, these would be gone.
    expect(resultsTable).toContain("RESULTS_COLUMNS");
    expect(resultsTable).toContain("TrackResult");
  });

  it("still uses its own layout module", () => {
    expect(imports(resultsTable)).toContain("./resultsTableLayout");
    expect(resultsTableLayout).toContain("RESULTS_LAYOUT_STORAGE_KEY");
  });

  it("does not import the new table", () => {
    // The convergence is Phase 7's, with its own tests. A quiet swap now would
    // change the results screen with nothing asserting what it now does.
    expect(imports(resultsTable).filter((path) => path.includes("TrackTable"))).toEqual([]);
  });
});

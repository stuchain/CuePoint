/**
 * The table stays generic (LIBUI-04, DEC-041).
 *
 * A boundary a behavioural test cannot see.
 *
 * **`TrackTable` knows about no particular kind of track.** The moment it
 * imports `mocks/`, the match-result shape, or a library type, it is no longer
 * a component two more phases can adopt — and nothing about how it renders
 * would change to say so.
 *
 * The table it was extracted from retired with the Results screen in CLEAN-14;
 * `retiredModules.test.ts` holds that nothing brings it back.
 */
import { describe, expect, it } from "vitest";

import trackTable from "./TrackTable.tsx?raw";
import trackTableLayout from "./trackTableLayout.ts?raw";
import trackTableSource from "./trackTableSource.ts?raw";

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
    // TrackResult was the retired match screen's; LibraryTrackRow is the library's.
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

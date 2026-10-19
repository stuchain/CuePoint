/**
 * Layout maths for the Universal Track Table (LIBUI-04).
 *
 * The arithmetic lives in its own module so it can be tested without a DOM,
 * and these are the properties the table's usefulness rests on: a column never
 * gets narrower than it can show anything at, a stored width survives a scale
 * change, and a width stored for a column that no longer exists cannot leave a
 * user with a layout they can never correct.
 */
import { describe, expect, it } from "vitest";

import layoutCss from "../../tokens/layout.css?raw";

import {
  COLUMN_DEFAULT_PX,
  COLUMN_MIN_PX,
  DEFAULT_WIDTH_PX_BY_ID,
  GROW_WEIGHTS,
  growWidths,
  widthsAfterResize,
  ROW_HEIGHT_FALLBACK,
  columnDefaultWidth,
  columnMinWidth,
  defaultWidths,
  gridTemplate,
  insertionAt,
  orderedWidths,
  readRowHeight,
  resolveWidths,
  stickyLeft,
  totalWidth,
  widthAfterDrag,
  type TrackColumnDef,
} from "./trackTableLayout";

interface Row {
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [
  { id: "title", header: "Title", sortKey: "title", defaultWidthPx: 200, sticky: true, render: (r) => r.title },
  { id: "artist", header: "Artist", sortKey: "artist", render: (r) => r.title },
  { id: "bpm", header: "BPM", sortKey: "bpm", minWidthPx: 60, defaultWidthPx: 60, align: "right", render: () => null },
  { id: "key", header: "Key", render: () => null },
];

describe("column widths", () => {
  it("scales the declared minimum", () => {
    expect(columnMinWidth({ minWidthPx: 60 }, 1)).toBe(60);
    expect(columnMinWidth({ minWidthPx: 60 }, 2)).toBe(120);
    expect(columnMinWidth({ minWidthPx: 60 }, 3)).toBe(180);
  });

  it("falls back to the standard minimum", () => {
    expect(columnMinWidth({}, 2)).toBe(COLUMN_MIN_PX * 2);
  });

  it("scales the declared default", () => {
    expect(columnDefaultWidth({ defaultWidthPx: 200 }, 2)).toBe(400);
  });

  it("falls back to the standard default", () => {
    expect(columnDefaultWidth({}, 1)).toBe(COLUMN_DEFAULT_PX);
    expect(columnDefaultWidth({ id: "not-a-known-column" }, 1)).toBe(COLUMN_DEFAULT_PX);
  });

  it("gives one default width per column id, shared by every table (C210)", () => {
    expect(columnDefaultWidth({ id: "title" }, 1)).toBe(220);
    expect(columnDefaultWidth({ id: "artist" }, 1)).toBe(170);
    expect(columnDefaultWidth({ id: "year", minWidthPx: 40 }, 1)).toBe(72);
    expect(columnDefaultWidth({ id: "title" }, 2)).toBe(440);
    expect(DEFAULT_WIDTH_PX_BY_ID.title).toBe(220);
  });

  it("lets a column's own declared default win over the shared one", () => {
    expect(columnDefaultWidth({ id: "title", defaultWidthPx: 300 }, 1)).toBe(300);
  });

  it("never defaults below the minimum", () => {
    // A column that asks for less than it can show anything at.
    expect(columnDefaultWidth({ minWidthPx: 120, defaultWidthPx: 40 }, 1)).toBe(120);
  });

  it("gives every column a default", () => {
    const widths = defaultWidths(COLUMNS, 1);
    expect(Object.keys(widths)).toEqual(["title", "artist", "bpm", "key"]);
    expect(widths.title).toBe(200);
    expect(widths.key).toBe(COLUMN_MIN_PX);
  });
});

describe("resolving stored widths", () => {
  it("keeps a stored width", () => {
    expect(resolveWidths(COLUMNS, { title: 320 }, 1).title).toBe(320);
  });

  it("raises a width below the minimum", () => {
    // The failure this prevents: a column dragged to nothing at 1× is
    // unreachable at 3×, because it is narrower than its own resize handle.
    expect(resolveWidths(COLUMNS, { bpm: 10 }, 2).bpm).toBe(120);
  });

  it("fills in a column the stored layout has never seen", () => {
    const widths = resolveWidths(COLUMNS, { title: 300 }, 1);
    expect(widths.artist).toBe(170);
  });

  it("drops a width for a column that no longer exists", () => {
    // Without this, renaming a column leaves a layout that cannot be fixed.
    const widths = resolveWidths(COLUMNS, { title: 300, retired: 400 }, 1);
    expect(widths).not.toHaveProperty("retired");
  });

  it("ignores a stored value that is not a number", () => {
    const stored = { title: Number.NaN, artist: Infinity } as Record<string, number>;
    const widths = resolveWidths(COLUMNS, stored, 1);
    expect(widths.title).toBe(200);
    expect(widths.artist).toBe(170);
  });

  it("resolves against the scale it is given", () => {
    expect(resolveWidths(COLUMNS, undefined, 2).title).toBe(400);
  });
});

describe("the grid", () => {
  it("orders widths by column", () => {
    expect(orderedWidths(COLUMNS, { title: 10, artist: 20, bpm: 30, key: 40 }, 1)).toEqual([
      10, 20, 30, 40,
    ]);
  });

  it("falls back for a column with no width at all", () => {
    expect(orderedWidths(COLUMNS, {}, 1)).toEqual([200, 170, 60, 80]);
  });

  it("builds a pixel template whose last column takes what is left", () => {
    expect(gridTemplate([10, 20.4])).toBe("10px minmax(20px, 1fr)");
    expect(gridTemplate([10])).toBe("minmax(10px, 1fr)");
    expect(gridTemplate([])).toBe("");
  });

  it("totals the widths", () => {
    expect(totalWidth([10, 20, 30])).toBe(60);
  });
});

describe("sticky columns", () => {
  it("puts the first sticky column at the left edge", () => {
    expect(stickyLeft(COLUMNS, [200, 170, 60, 80], 0)).toBe(0);
  });

  it("counts only the sticky columns before it", () => {
    const columns = [
      { ...COLUMNS[0]! },
      { ...COLUMNS[1]! },
      { ...COLUMNS[2]!, sticky: true },
    ];
    // Artist is not sticky, so it scrolls under and does not push BPM along.
    expect(stickyLeft(columns, [200, 120, 60], 2)).toBe(200);
  });

  it("is zero when nothing before it is sticky", () => {
    expect(stickyLeft(COLUMNS, [200, 170, 60, 80], 2)).toBe(200);
  });
});

describe("dragging a column", () => {
  it("widens by the distance dragged", () => {
    expect(widthAfterDrag(COLUMNS[0]!, 200, 60, 1)).toBe(260);
  });

  it("narrows by the distance dragged", () => {
    expect(widthAfterDrag(COLUMNS[0]!, 200, -60, 1)).toBe(140);
  });

  it("stops at the minimum", () => {
    expect(widthAfterDrag(COLUMNS[2]!, 60, -500, 1)).toBe(60);
  });

  it("stops at the scaled minimum", () => {
    expect(widthAfterDrag(COLUMNS[2]!, 120, -500, 2)).toBe(120);
  });
});

describe("row height", () => {
  it("reads the stylesheet", () => {
    document.documentElement.style.setProperty("--row-height", "48px");
    expect(readRowHeight()).toBe(48);
    document.documentElement.style.removeProperty("--row-height");
  });

  it("falls back when the variable says nothing", () => {
    document.documentElement.style.setProperty("--row-height", "");
    expect(readRowHeight()).toBe(ROW_HEIGHT_FALLBACK);
  });

  it("falls back when the variable is nonsense", () => {
    document.documentElement.style.setProperty("--row-height", "auto");
    expect(readRowHeight()).toBe(ROW_HEIGHT_FALLBACK);
    document.documentElement.style.removeProperty("--row-height");
  });
});

describe("the --row-height token", () => {
  // getComputedStyle answers an unresolved `calc(...)` for an unregistered
  // custom property, which parseFloat reads as NaN: every table row was then 36px.
  // jsdom resolves no calc and cannot register a property, so these text checks
  // of layout.css plus e2e/scale.spec.ts carry the regression.
  it("is registered as an inherited length, so the browser resolves it", () => {
    expect(layoutCss).toMatch(
      /@property --row-height\s*\{[^}]*syntax:\s*"<length>";[^}]*inherits:\s*true;[^}]*initial-value:\s*26px;/,
    );
  });

  it("follows the text size, rounded to a whole pixel", () => {
    expect(layoutCss).toMatch(
      /--row-height:\s*round\(nearest,\s*calc\(var\(--font-size-xs\) \* var\(--row-density, 2\.6\)\),\s*1px\);/,
    );
  });

  it("is roomier when the page says roomy", () => {
    expect(layoutCss).toMatch(
      /:root\[data-row-density="roomy"\]\s*\{\s*--row-density:\s*3\.2;\s*\}/,
    );
  });
});

describe("insertionAt", () => {
  // Rows of 20 px, four of them: the body runs 0 to 80 below its own top.
  it("puts the upper half of a row before it and the lower half after it", () => {
    expect(insertionAt(0, 20, 4)).toEqual({ insertAt: 0, over: 0 });
    expect(insertionAt(9, 20, 4)).toEqual({ insertAt: 0, over: 0 });
    expect(insertionAt(11, 20, 4)).toEqual({ insertAt: 1, over: 0 });
    expect(insertionAt(45, 20, 4)).toEqual({ insertAt: 2, over: 2 });
    expect(insertionAt(79, 20, 4)).toEqual({ insertAt: 4, over: 3 });
  });

  it("appends below the last row, over the last row", () => {
    expect(insertionAt(80, 20, 4)).toEqual({ insertAt: 4, over: 3 });
    expect(insertionAt(900, 20, 4)).toEqual({ insertAt: 4, over: 3 });
  });

  it("means the start above the first row, where the header is", () => {
    expect(insertionAt(-12, 20, 4)).toEqual({ insertAt: 0, over: 0 });
  });

  it("has no row to be over in an empty table", () => {
    expect(insertionAt(0, 20, 0)).toEqual({ insertAt: 0, over: -1 });
    expect(insertionAt(300, 20, 0)).toEqual({ insertAt: 0, over: -1 });
  });
});

describe("spare width goes by grow weights (C210)", () => {
  const cols: TrackColumnDef<Row>[] = [
    { id: "title", header: "Title", render: () => null },
    { id: "artist", header: "Artist", render: () => null },
    { id: "album", header: "Album", render: () => null },
    { id: "bpm", header: "BPM", render: () => null },
  ];

  it("weights Title 3, Artist 2, Album, Label and Genre 1, and numbers 0", () => {
    expect(GROW_WEIGHTS).toMatchObject({ title: 3, artist: 2, album: 1, label: 1, genre: 1 });
    expect(GROW_WEIGHTS.bpm ?? 0).toBe(0);
  });

  it("shares the room left over in proportion, and gives numbers none", () => {
    // 600 of columns in 1200: 600 spare, over weights 3 + 2 + 1 = 6.
    const grown = growWidths(cols, [200, 150, 150, 100], 1200);
    expect(grown).toEqual([200 + 300, 150 + 200, 150 + 100, 100]);
    expect(grown.reduce((a, b) => a + b, 0)).toBe(1200);
  });

  it("never gives away a pixel it cannot divide: the heaviest column takes the remainder", () => {
    const grown = growWidths(cols, [200, 150, 150, 100], 1204);
    expect(grown.reduce((a, b) => a + b, 0)).toBe(1204);
    expect(grown[3]).toBe(100);
  });

  it("leaves the widths alone when there is no spare, no room measured, or nothing that grows", () => {
    expect(growWidths(cols, [200, 150, 150, 100], 500)).toEqual([200, 150, 150, 100]);
    expect(growWidths(cols, [200, 150, 150, 100], 0)).toEqual([200, 150, 150, 100]);
    const numbers: TrackColumnDef<Row>[] = [{ id: "bpm", header: "BPM", render: () => null }];
    expect(growWidths(numbers, [100], 900)).toEqual([100]);
  });

  it("takes a column's own grow weight over the shared one", () => {
    const own: TrackColumnDef<Row>[] = [
      { id: "title", header: "T", grow: 0, render: () => null },
      { id: "x", header: "X", grow: 1, render: () => null },
    ];
    expect(growWidths(own, [100, 100], 300)).toEqual([100, 200]);
  });
});

describe("widthsAfterResize (B2)", () => {
  const cols: TrackColumnDef<Row>[] = [
    { id: "title", header: "t", render: () => "" },
    { id: "artist", header: "a", render: () => "" },
    { id: "bpm", header: "b", render: () => "" },
  ];
  it("stores every column at its drawn width and the dragged one at the target", () => {
    expect(widthsAfterResize(cols, [500, 300, 200], 1000, 0, 560)).toEqual({ title: 560, artist: 300, bpm: 200 });
  });
  it("gives the room a narrowing frees to the last column, so no spare is shared out again", () => {
    const stored = widthsAfterResize(cols, [500, 300, 200], 1000, 0, 420);
    expect(stored).toEqual({ title: 420, artist: 300, bpm: 280 });
    const drawn = growWidths(cols, [stored.title!, stored.artist!, stored.bpm!], 1000);
    expect(drawn[0]).toBe(420);
  });
  it("adds nothing when the room is not measured", () => {
    expect(widthsAfterResize(cols, [500, 300, 200], 0, 0, 420)).toEqual({ title: 420, artist: 300, bpm: 200 });
  });
});

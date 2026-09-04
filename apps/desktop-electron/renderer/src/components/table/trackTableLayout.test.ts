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

import {
  COLUMN_DEFAULT_PX,
  COLUMN_MIN_PX,
  ROW_HEIGHT_FALLBACK,
  columnDefaultWidth,
  columnMinWidth,
  defaultWidths,
  gridTemplate,
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
  });

  it("never defaults below the minimum", () => {
    // A column that asks for less than it can show anything at.
    expect(columnDefaultWidth({ minWidthPx: 120, defaultWidthPx: 40 }, 1)).toBe(120);
  });

  it("gives every column a default", () => {
    const widths = defaultWidths(COLUMNS, 1);
    expect(Object.keys(widths)).toEqual(["title", "artist", "bpm", "key"]);
    expect(widths.title).toBe(200);
    expect(widths.key).toBe(COLUMN_DEFAULT_PX);
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
    expect(widths.artist).toBe(COLUMN_DEFAULT_PX);
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
    expect(widths.artist).toBe(COLUMN_DEFAULT_PX);
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
    expect(orderedWidths(COLUMNS, {}, 1)).toEqual([200, 120, 60, 120]);
  });

  it("builds a pixel template", () => {
    expect(gridTemplate([10, 20.4])).toBe("10px 20px");
  });

  it("totals the widths", () => {
    expect(totalWidth([10, 20, 30])).toBe(60);
  });
});

describe("sticky columns", () => {
  it("puts the first sticky column at the left edge", () => {
    expect(stickyLeft(COLUMNS, [200, 120, 60, 120], 0)).toBe(0);
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
    expect(stickyLeft(COLUMNS, [200, 120, 60, 120], 2)).toBe(200);
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

/**
 * Column layout: order, visibility, widths (LIBUI-06, DEC-042).
 *
 * The properties that matter here are the ones a user cannot recover from if
 * they are wrong:
 *
 * **A stored layout is reconciled, never trusted.** A column added in a later
 * release must appear; one that no longer exists must not leave a gap; a width
 * below the current scale's minimum must be raised. Without this, a rename
 * leaves a table that cannot be fixed from inside the app.
 * **The last visible column cannot be hidden**, because a table with no
 * columns hides the control that would bring one back.
 * **Pinned columns stay pinned**, so a column that scrolls away can never end
 * up underneath one that does not.
 * **Nothing throws.** A corrupt value or a storage that refuses to be read
 * gives the default layout, not a screen that fails to render.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIBRARY_TABLE_LAYOUT_KEY,
  allowedRange,
  canMove,
  defaultLayout,
  isLastVisible,
  loadColumnLayout,
  moveColumn,
  nudgeColumn,
  reconcileLayout,
  saveColumnLayout,
  toggleHidden,
  visibleColumns,
  widthsOf,
  withWidths,
  type ColumnLayout,
} from "./columnLayout";
import { COLUMN_DEFAULT_PX, type TrackColumnDef } from "./trackTableLayout";

interface Row {
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [
  { id: "title", header: "Title", defaultWidthPx: 200, sticky: true, render: (r) => r.title },
  { id: "artist", header: "Artist", render: () => null },
  { id: "bpm", header: "BPM", minWidthPx: 60, defaultWidthPx: 80, render: () => null },
  { id: "key", header: "Key", render: () => null },
];

const ids = (layout: ColumnLayout) => layout.map((entry) => entry.id);

beforeEach(() => {
  localStorage.clear();
});

describe("the default layout", () => {
  it("is every column, in registry order, visible", () => {
    const layout = defaultLayout(COLUMNS, 1);
    expect(ids(layout)).toEqual(["title", "artist", "bpm", "key"]);
    expect(layout.every((entry) => !entry.hidden)).toBe(true);
  });

  it("uses each column's declared width at this scale", () => {
    const layout = defaultLayout(COLUMNS, 2);
    expect(layout[0]!.width).toBe(400);
    expect(layout[1]!.width).toBe(COLUMN_DEFAULT_PX * 2);
  });
});

describe("reconciling a stored layout", () => {
  it("keeps the order it was stored in", () => {
    const stored = [
      { id: "title", width: 200, hidden: false },
      { id: "key", width: 100, hidden: false },
      { id: "artist", width: 120, hidden: true },
      { id: "bpm", width: 80, hidden: false },
    ];
    expect(ids(reconcileLayout(stored, COLUMNS, 1))).toEqual([
      "title",
      "key",
      "artist",
      "bpm",
    ]);
  });

  it("keeps what was hidden hidden", () => {
    const stored = [{ id: "artist", width: 120, hidden: true }];
    const layout = reconcileLayout(stored, COLUMNS, 1);
    expect(layout.find((entry) => entry.id === "artist")?.hidden).toBe(true);
  });

  it("appends a column the stored layout has never seen", () => {
    // Where a column added in a later release turns up.
    const stored = [{ id: "title", width: 200, hidden: false }];
    expect(ids(reconcileLayout(stored, COLUMNS, 1))).toEqual([
      "title",
      "artist",
      "bpm",
      "key",
    ]);
  });

  it("drops a column that no longer exists", () => {
    const stored = [
      { id: "retired", width: 300, hidden: false },
      { id: "title", width: 200, hidden: false },
    ];
    expect(ids(reconcileLayout(stored, COLUMNS, 1))).not.toContain("retired");
  });

  it("drops a duplicate entry", () => {
    const stored = [
      { id: "title", width: 200, hidden: false },
      { id: "title", width: 900, hidden: true },
    ];
    const layout = reconcileLayout(stored, COLUMNS, 1);
    expect(layout.filter((entry) => entry.id === "title")).toHaveLength(1);
    expect(layout[0]!.width).toBe(200);
  });

  it("raises a width below the minimum for this scale", () => {
    const stored = [{ id: "bpm", width: 60, hidden: false }];
    const layout = reconcileLayout(stored, COLUMNS, 2);
    expect(layout.find((entry) => entry.id === "bpm")?.width).toBe(120);
  });

  it("replaces a width that is not a number", () => {
    const stored = [{ id: "title", width: "wide", hidden: false }];
    expect(reconcileLayout(stored, COLUMNS, 1)[0]!.width).toBe(200);
  });

  it("ignores entries that are not entries", () => {
    const stored = ["title", 42, null, { width: 100 }];
    expect(ids(reconcileLayout(stored, COLUMNS, 1))).toEqual([
      "title",
      "artist",
      "bpm",
      "key",
    ]);
  });

  it("returns the default layout for something that is not a list", () => {
    expect(ids(reconcileLayout({ title: 200 }, COLUMNS, 1))).toEqual(ids(
      defaultLayout(COLUMNS, 1),
    ));
  });

  it("floats a pinned column back to the front", () => {
    const stored = [
      { id: "artist", width: 120, hidden: false },
      { id: "title", width: 200, hidden: false },
    ];
    expect(ids(reconcileLayout(stored, COLUMNS, 1))[0]).toBe("title");
  });

  it("shows something when everything was stored hidden", () => {
    const stored = COLUMNS.map((column) => ({
      id: column.id,
      width: 100,
      hidden: true,
    }));
    const layout = reconcileLayout(stored, COLUMNS, 1);
    expect(layout.filter((entry) => !entry.hidden)).toHaveLength(1);
  });
});

describe("what the table renders", () => {
  it("is the layout order, hidden columns removed", () => {
    const layout: ColumnLayout = [
      { id: "key", width: 100, hidden: false },
      { id: "title", width: 200, hidden: true },
      { id: "artist", width: 120, hidden: false },
    ];
    expect(visibleColumns(COLUMNS, layout).map((c) => c.id)).toEqual(["key", "artist"]);
  });

  it("skips an entry with no column", () => {
    const layout: ColumnLayout = [{ id: "ghost", width: 100, hidden: false }];
    expect(visibleColumns(COLUMNS, layout)).toEqual([]);
  });

  it("hands widths over keyed by id", () => {
    const layout = defaultLayout(COLUMNS, 1);
    expect(widthsOf(layout)).toMatchObject({ title: 200, bpm: 80 });
  });

  it("takes new widths back the same way", () => {
    const layout = withWidths(defaultLayout(COLUMNS, 1), { title: 320, ghost: 10 });
    expect(layout.find((entry) => entry.id === "title")?.width).toBe(320);
    expect(ids(layout)).not.toContain("ghost");
  });
});

describe("hiding a column", () => {
  it("hides it", () => {
    const layout = toggleHidden(defaultLayout(COLUMNS, 1), "artist");
    expect(layout.find((entry) => entry.id === "artist")?.hidden).toBe(true);
  });

  it("shows it again", () => {
    const once = toggleHidden(defaultLayout(COLUMNS, 1), "artist");
    expect(toggleHidden(once, "artist").find((e) => e.id === "artist")?.hidden).toBe(
      false,
    );
  });

  it("refuses to hide the last visible one", () => {
    let layout = defaultLayout(COLUMNS, 1);
    for (const id of ["artist", "bpm", "key"]) layout = toggleHidden(layout, id);
    expect(isLastVisible(layout, "title")).toBe(true);

    expect(toggleHidden(layout, "title")).toBe(layout);
  });

  it("knows when a column is not the last visible one", () => {
    expect(isLastVisible(defaultLayout(COLUMNS, 1), "title")).toBe(false);
  });
});

describe("moving a column", () => {
  it("moves it to an index", () => {
    const layout = moveColumn(COLUMNS, defaultLayout(COLUMNS, 1), "key", 1);
    expect(ids(layout)).toEqual(["title", "key", "artist", "bpm"]);
  });

  it("nudges it one place", () => {
    const layout = nudgeColumn(COLUMNS, defaultLayout(COLUMNS, 1), "bpm", -1);
    expect(ids(layout)).toEqual(["title", "bpm", "artist", "key"]);
  });

  it("gives the same answer whichever way it was asked", () => {
    // The keyboard path and the drag path are one function, so they cannot
    // disagree about what a move means.
    const base = defaultLayout(COLUMNS, 1);
    expect(ids(nudgeColumn(COLUMNS, base, "key", -1))).toEqual(
      ids(moveColumn(COLUMNS, base, "key", 2)),
    );
  });

  it("will not move a scrolling column before a pinned one", () => {
    const layout = moveColumn(COLUMNS, defaultLayout(COLUMNS, 1), "artist", 0);
    expect(ids(layout)[0]).toBe("title");
  });

  it("will not move a pinned column after a scrolling one", () => {
    const layout = moveColumn(COLUMNS, defaultLayout(COLUMNS, 1), "title", 3);
    expect(ids(layout)[0]).toBe("title");
  });

  it("clamps a move past the end", () => {
    const layout = moveColumn(COLUMNS, defaultLayout(COLUMNS, 1), "artist", 99);
    expect(ids(layout)).toEqual(["title", "bpm", "key", "artist"]);
  });

  it("changes nothing when it is already there", () => {
    const base = defaultLayout(COLUMNS, 1);
    expect(moveColumn(COLUMNS, base, "artist", 1)).toBe(base);
  });

  it("changes nothing for a column it does not have", () => {
    const base = defaultLayout(COLUMNS, 1);
    expect(moveColumn(COLUMNS, base, "ghost", 0)).toBe(base);
    expect(nudgeColumn(COLUMNS, base, "ghost", 1)).toBe(base);
  });

  it("says which moves are available", () => {
    const base = defaultLayout(COLUMNS, 1);
    expect(canMove(COLUMNS, base, "artist", -1)).toBe(false); // pinned title
    expect(canMove(COLUMNS, base, "artist", 1)).toBe(true);
    expect(canMove(COLUMNS, base, "key", 1)).toBe(false); // last already
    expect(canMove(COLUMNS, base, "title", 1)).toBe(false); // the only pinned
  });

  it("describes where a column may go", () => {
    const base = defaultLayout(COLUMNS, 1);
    expect(allowedRange(COLUMNS, base, "title")).toEqual([0, 0]);
    expect(allowedRange(COLUMNS, base, "bpm")).toEqual([1, 3]);
    expect(allowedRange(COLUMNS, base, "ghost")).toBeNull();
  });
});

describe("storage", () => {
  it("round-trips order, visibility and widths", () => {
    let layout = defaultLayout(COLUMNS, 1);
    layout = toggleHidden(layout, "key");
    layout = nudgeColumn(COLUMNS, layout, "bpm", -1);
    layout = withWidths(layout, { artist: 333 });
    saveColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, layout);

    expect(loadColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, COLUMNS, 1)).toEqual(layout);
  });

  it("uses the key without the legacy naming", () => {
    // `PIXEL_DESIGN_SYSTEM.md` §2: the old keys carry a `-ui-lab-` segment
    // that predates the product. New ones do not add to that debt.
    expect(LIBRARY_TABLE_LAYOUT_KEY).toBe("cuepoint-library-table-layout");
    expect(LIBRARY_TABLE_LAYOUT_KEY).not.toContain("ui-lab");
  });

  it("gives the default layout on a first run", () => {
    expect(loadColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, COLUMNS, 1)).toEqual(
      defaultLayout(COLUMNS, 1),
    );
  });

  it("gives the default layout for a corrupt value, without throwing", () => {
    localStorage.setItem(LIBRARY_TABLE_LAYOUT_KEY, "{not json");
    expect(() => loadColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, COLUMNS, 1)).not.toThrow();
    expect(loadColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, COLUMNS, 1)).toEqual(
      defaultLayout(COLUMNS, 1),
    );
  });

  it("survives a storage that refuses to be read", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("Access denied");
      });
    expect(loadColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, COLUMNS, 1)).toEqual(
      defaultLayout(COLUMNS, 1),
    );
    getItem.mockRestore();
  });

  it("survives a storage that refuses to be written", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
    expect(() =>
      saveColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, defaultLayout(COLUMNS, 1)),
    ).not.toThrow();
    setItem.mockRestore();
  });

  it("reconciles what it reads against the columns that exist now", () => {
    localStorage.setItem(
      LIBRARY_TABLE_LAYOUT_KEY,
      JSON.stringify([{ id: "retired", width: 100, hidden: false }]),
    );
    expect(ids(loadColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, COLUMNS, 1))).toEqual([
      "title",
      "artist",
      "bpm",
      "key",
    ]);
  });
});

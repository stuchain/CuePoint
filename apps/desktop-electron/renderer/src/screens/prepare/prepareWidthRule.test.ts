/**
 * The Set table's narrow-width rule (C246): when the visible columns do not fit the table, Artist
 * is dropped first, so the last column is never cut mid-word.
 */
import { describe, expect, it } from "vitest";

import { defaultWidths } from "../../components/table/trackTableLayout";
import { PREPARE_COLUMNS } from "./prepareColumns";
import { columnsToDrop } from "./prepareWidthRule";

const visibleByDefault = PREPARE_COLUMNS.filter((column) => !column.hiddenByDefault);
const total = (widths: Record<string, number>, ids: string[]) => ids.reduce((sum, id) => sum + (widths[id] ?? 0), 0);

describe("columnsToDrop", () => {
  const widths = { position: 50, title: 200, artist: 150, key: 60 };
  const columns = [{ id: "position" }, { id: "title" }, { id: "artist" }, { id: "key" }];

  it("drops nothing when the columns fit", () => {
    expect(columnsToDrop(columns, widths, 460)).toEqual([]);
    expect(columnsToDrop(columns, widths, 1000)).toEqual([]);
  });

  it("drops Artist first when they do not", () => {
    expect(columnsToDrop(columns, widths, 459)).toEqual(["artist"]);
  });

  it("drops nothing when the room is not known, as in a test document", () => {
    expect(columnsToDrop(columns, widths, 0)).toEqual([]);
  });

  it("has nothing to drop without an Artist column", () => {
    expect(columnsToDrop(columns.filter((column) => column.id !== "artist"), widths, 100)).toEqual([]);
  });
});

describe("the default columns at 1264 x 735, scale 1.25, with Details open", () => {
  // The Set's pane there: the page less the sidebar and the Details panel (the source panel waits
  // while they are open, C226). About 600 px; the e2e spec measures the real figure.
  const ROOM = 600;
  const scale = 1.25;
  const widths = defaultWidths(visibleByDefault, scale);
  const ids = visibleByDefault.map((column) => column.id);

  // Round 3 (M85, D12): BPM sits before Key on every page.
  it("shows #, Title, Artist, BPM, Key, Time, Mix in and Fit", () => {
    expect(ids).toEqual(["position", "title", "artist", "bpm", "key", "planned", "in", "fit"]);
  });

  it("do not fit whole, and fit once Artist is dropped", () => {
    expect(total(widths, ids)).toBeGreaterThan(ROOM);
    const dropped = columnsToDrop(visibleByDefault, widths, ROOM);
    expect(dropped).toEqual(["artist"]);
    expect(total(widths, ids.filter((id) => !dropped.includes(id)))).toBeLessThanOrEqual(ROOM);
  });
});

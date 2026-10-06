import { describe, expect, it, vi } from "vitest";

import type { TrackColumnDef } from "../../components/table";
import { cellText, copySummary, gatherTracksAsText, tracksAsText } from "./trackClipboard";

/**
 * Copying tracks as text (LIBUI-09): the columns shown, in their order, with a
 * header; and a column whose text is not in the row reads it first (WAVE-08).
 */

interface Row {
  id: number;
  title: string;
  bpm: number | null;
}

const ROWS: Row[] = [
  { id: 1, title: "One", bpm: 124 },
  { id: 2, title: "Two\tTabbed", bpm: null },
];

const TITLE: TrackColumnDef<Row> = { id: "title", header: "Title", render: (row) => row.title };
const BPM: TrackColumnDef<Row> = { id: "bpm", header: "BPM", render: (row) => row.bpm ?? "" };

describe("tracks as text", () => {
  it("is a header row, then one tab-separated row per track, tabs inside a value made spaces", () => {
    expect(tracksAsText([TITLE, BPM], ROWS)).toBe("Title\tBPM\nOne\t124\nTwo Tabbed\t");
  });

  it("is empty with nothing to copy", () => {
    expect(tracksAsText([TITLE], [])).toBe("");
    expect(tracksAsText([], ROWS)).toBe("");
  });

  it("prefers a column's own text over what it draws", () => {
    const marked: TrackColumnDef<Row> = { ...TITLE, text: (row) => `${row.title}!` };
    expect(cellText(marked, ROWS[0])).toBe("One!");
  });
});

describe("a column that gathers its text (WAVE-08)", () => {
  const gathered = (): TrackColumnDef<Row> => ({
    id: "loudness",
    header: "Loudness",
    render: () => null,
    text: () => "never used",
    gatherText: vi.fn(async (rows: readonly Row[]) => {
      const read = new Map(rows.map((row) => [row.id, `${-row.id} LUFS`]));
      return (row: Row) => read.get(row.id) ?? "";
    }),
  });

  it("reads it once for every row of the copy, before the text is made", async () => {
    const column = gathered();

    const text = await gatherTracksAsText([TITLE, column], ROWS);

    expect(text).toBe("Title\tLoudness\nOne\t-1 LUFS\nTwo Tabbed\t-2 LUFS");
    expect(column.gatherText).toHaveBeenCalledTimes(1);
    expect(column.gatherText).toHaveBeenCalledWith(ROWS);
  });

  it("reads nothing for a copy of nothing, nor for a column not shown", async () => {
    const column = gathered();

    expect(await gatherTracksAsText([TITLE, column], [])).toBe("");
    expect(await gatherTracksAsText([TITLE], ROWS)).toBe("Title\nOne\nTwo Tabbed");
    expect(column.gatherText).not.toHaveBeenCalled();
  });
});

describe("what a copy says", () => {
  it("names how much was copied", () => {
    expect(copySummary(0, 3)).toBe("Nothing to copy");
    expect(copySummary(1, 1)).toBe("Copied 1 track");
    expect(copySummary(5_000, 6_000)).toBe("Copied the first 5,000 of 6,000 tracks");
  });
});

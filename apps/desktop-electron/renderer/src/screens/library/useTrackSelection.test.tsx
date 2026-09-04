/**
 * Selecting tracks in a windowed table (LIBUI-09, DEC-045).
 *
 * The hard part is the part the model deliberately cannot do: a shift-range
 * that crosses rows the table has never loaded. It is resolved through the
 * same browse query with `fields=id` (LIBUI-03), so the ids a selection names
 * and the rows on screen can never disagree about which tracks those are.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery } from "./libraryQuery";
import { COPY_LIMIT, useTrackSelection } from "./useTrackSelection";

const TOTAL = 50_000;

function row(index: number): LibraryTrackRow {
  return {
    id: index + 1,
    rekordbox_track_id: String(index + 1),
    title: `Track ${index + 1}`,
    artist: "Artist",
    remixer: null,
    album: null,
    label: null,
    genre: null,
    key: null,
    bpm: null,
    year: null,
    duration_seconds: null,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: `/music/${index + 1}.mp3`,
  };
}

/** Rows 0-99 are loaded; everything past that is not. */
const loaded = (index: number) => (index < 100 ? row(index) : undefined);

let browseLibrary: ReturnType<typeof vi.fn>;

beforeEach(() => {
  browseLibrary = vi.fn(async (params: Record<string, unknown>) => {
    const offset = (params.offset as number) ?? 0;
    const limit = (params.limit as number) ?? 100;
    const rows = Array.from({ length: Math.min(limit, TOTAL - offset) }, (_, i) =>
      row(offset + i),
    );
    if (params.fields === "id") {
      return {
        query: "",
        total: TOTAL,
        limit,
        offset,
        tracks: [],
        library_empty: false,
        mode: "browse" as const,
        track_ids: rows.map((r) => r.id!),
      };
    }
    return {
      query: "",
      total: TOTAL,
      limit,
      offset,
      tracks: rows,
      library_empty: false,
      mode: "browse" as const,
    };
  });
  (window as unknown as { cuepoint?: unknown }).cuepoint = { browseLibrary };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

const plain = { shiftKey: false, ctrlKey: false, metaKey: false };
const withCtrl = { shiftKey: false, ctrlKey: true, metaKey: false };
const withCmd = { shiftKey: false, ctrlKey: false, metaKey: true };
const withShift = { shiftKey: true, ctrlKey: false, metaKey: false };

function selectionHook(query: LibraryQuery = DEFAULT_LIBRARY_QUERY) {
  return renderHook(({ q }) => useTrackSelection(q, TOTAL, loaded), {
    initialProps: { q: query },
  });
}

describe("clicking", () => {
  it("selects one track", () => {
    const { result } = selectionHook();

    act(() => result.current.onRowClick(row(3), 3, plain));

    expect(result.current.count).toBe(1);
    expect(result.current.selection.lastId).toBe(4);
  });

  it("adds one with ctrl", () => {
    const { result } = selectionHook();
    act(() => result.current.onRowClick(row(3), 3, plain));

    act(() => result.current.onRowClick(row(5), 5, withCtrl));

    expect(result.current.count).toBe(2);
  });

  it("adds one with cmd, for a Mac", () => {
    const { result } = selectionHook();
    act(() => result.current.onRowClick(row(3), 3, plain));

    act(() => result.current.onRowClick(row(5), 5, withCmd));

    expect(result.current.count).toBe(2);
  });

  it("ignores a row with no id", () => {
    const { result } = selectionHook();

    act(() => result.current.onRowClick({ ...row(3), id: null }, 3, plain));

    expect(result.current.count).toBe(0);
  });
});

describe("shift-clicking", () => {
  it("selects the run between, from the rows in hand", async () => {
    const { result } = selectionHook();
    act(() => result.current.onRowClick(row(2), 2, plain));

    act(() => result.current.onRowClick(row(6), 6, withShift));

    expect(result.current.count).toBe(5);
    expect(browseLibrary).not.toHaveBeenCalled();
  });

  it("works upwards as well as downwards", () => {
    const { result } = selectionHook();
    act(() => result.current.onRowClick(row(6), 6, plain));

    act(() => result.current.onRowClick(row(2), 2, withShift));

    expect(result.current.count).toBe(5);
  });

  it("asks the engine for a range that crosses unloaded rows", async () => {
    const { result } = selectionHook();
    act(() => result.current.onRowClick(row(10), 10, plain));

    act(() => result.current.onRowClick(row(4_000), 4_000, withShift));

    await waitFor(() => expect(browseLibrary).toHaveBeenCalled());
    expect(browseLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ fields: "id", offset: 10, limit: 3_991 }),
    );
    await waitFor(() => expect(result.current.count).toBe(3_991));
  });

  it("asks with the same query the table is showing", async () => {
    const query = { ...DEFAULT_LIBRARY_QUERY, sort: "bpm", dir: "desc" as const };
    const { result } = renderHook(() => useTrackSelection(query, TOTAL, loaded));
    act(() => result.current.onRowClick(row(10), 10, plain));

    act(() => result.current.onRowClick(row(4_000), 4_000, withShift));

    await waitFor(() =>
      expect(browseLibrary).toHaveBeenCalledWith(
        expect.objectContaining({ sort: "bpm", dir: "desc", fields: "id" }),
      ),
    );
  });

  it("selects one track when there is no anchor to extend from", () => {
    const { result } = selectionHook();

    act(() => result.current.onRowClick(row(6), 6, withShift));

    expect(result.current.count).toBe(1);
  });
});

describe("selecting everything matching", () => {
  it("counts the whole query without listing it", () => {
    const { result } = selectionHook();

    act(() => result.current.selectAllMatching());

    expect(result.current.count).toBe(TOTAL);
    expect(result.current.selection.ids.size).toBe(0);
  });

  it("asks the engine for nothing", () => {
    const { result } = selectionHook();

    act(() => result.current.selectAllMatching());

    expect(browseLibrary).not.toHaveBeenCalled();
  });

  it("lets a track be taken out again", () => {
    const { result } = selectionHook();
    act(() => result.current.selectAllMatching());

    act(() => result.current.onRowClick(row(3), 3, withCtrl));

    expect(result.current.count).toBe(TOTAL - 1);
  });
});

describe("clearing", () => {
  it("empties the selection", () => {
    const { result } = selectionHook();
    act(() => result.current.onRowClick(row(3), 3, plain));

    act(() => result.current.clear());

    expect(result.current.count).toBe(0);
  });

  it("happens by itself when the question changes", () => {
    const { result, rerender } = selectionHook();
    act(() => result.current.onRowClick(row(3), 3, plain));

    rerender({ q: { ...DEFAULT_LIBRARY_QUERY, sort: "bpm" } });

    // What was selected under the old query is not a subset of the new one;
    // acting on it would act on tracks the user can no longer see.
    expect(result.current.count).toBe(0);
  });

  it("survives a render that changes nothing", () => {
    const { result, rerender } = selectionHook();
    act(() => result.current.onRowClick(row(3), 3, plain));

    rerender({ q: { ...DEFAULT_LIBRARY_QUERY } });

    expect(result.current.count).toBe(1);
  });
});

describe("gathering the rows for a copy", () => {
  it("returns the selected rows, in the table's order", async () => {
    const { result } = selectionHook();
    act(() => result.current.onRowClick(row(2), 2, plain));
    act(() => result.current.onRowClick(row(0), 0, withCtrl));

    const rows = await result.current.gatherRows();

    expect(rows.map((r) => r.id)).toEqual([1, 3]);
  });

  it("returns nothing when nothing is selected", async () => {
    const { result } = selectionHook();
    expect(await result.current.gatherRows()).toEqual([]);
  });

  it("stops at the limit for a selection of everything", async () => {
    const { result } = selectionHook();
    act(() => result.current.selectAllMatching());

    const rows = await result.current.gatherRows(200);

    expect(rows).toHaveLength(200);
  });

  it("has a limit rather than gathering fifty thousand rows", async () => {
    const { result } = selectionHook();
    act(() => result.current.selectAllMatching());

    const rows = await result.current.gatherRows();

    expect(rows).toHaveLength(COPY_LIMIT);
  });

  it("returns nothing when there is no bridge", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    const { result } = selectionHook();

    expect(await result.current.gatherRows()).toEqual([]);
  });
});

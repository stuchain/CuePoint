/**
 * A remembered column layout (LIBUI-06, DEC-042).
 *
 * The model's rules are tested in `columnLayout.test.ts`; this is about the
 * part a user notices — that the layout is still there tomorrow, that it
 * survives a scale change and a release that adds a column, and that "reset"
 * really goes back to the beginning.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { ScaleProvider, useScale } from "../../tokens/ScaleContext";
import { LIBRARY_TABLE_LAYOUT_KEY } from "./columnLayout";
import { useColumnLayout } from "./useColumnLayout";
import type { TrackColumnDef } from "./trackTableLayout";

interface Row {
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [
  { id: "title", header: "Title", defaultWidthPx: 200, sticky: true, render: (r) => r.title },
  { id: "artist", header: "Artist", render: () => null },
  { id: "bpm", header: "BPM", minWidthPx: 60, defaultWidthPx: 80, render: () => null },
];

const WITH_A_CLIENT_SORT: TrackColumnDef<Row>[] = [
  { id: "title", header: "Title", sortKey: "title", defaultWidthPx: 200, render: (r) => r.title },
  { id: "bpm", header: "BPM", accessor: () => null, render: () => null },
];

const WITH_A_NEW_COLUMN: TrackColumnDef<Row>[] = [
  ...COLUMNS,
  { id: "rating", header: "Rating", render: () => null },
];

function wrapper({ children }: { children: ReactNode }) {
  return <ScaleProvider>{children}</ScaleProvider>;
}

function render(columns: readonly TrackColumnDef<Row>[] = COLUMNS) {
  return renderHook(() => useColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, columns), {
    wrapper,
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("cuepoint-ui-lab-scale", "1");
});

describe("what the table is given", () => {
  it("is every column, in order, at its default width", () => {
    const { result } = render();

    expect(result.current.visible.map((column) => column.id)).toEqual([
      "title",
      "artist",
      "bpm",
    ]);
    expect(result.current.widths).toMatchObject({ title: 200, bpm: 80 });
  });

  it("drops a hidden column from what is rendered, but not from the layout", () => {
    const { result } = render();

    act(() => result.current.toggle("artist"));

    expect(result.current.visible.map((column) => column.id)).toEqual(["title", "bpm"]);
    expect(result.current.layout.map((entry) => entry.id)).toContain("artist");
  });

  it("reorders what is rendered", () => {
    const { result } = render();

    act(() => result.current.nudge("bpm", -1));

    expect(result.current.visible.map((column) => column.id)).toEqual([
      "title",
      "bpm",
      "artist",
    ]);
  });
});

describe("remembering", () => {
  it("is still there in the next session", () => {
    const first = render();
    act(() => first.result.current.toggle("artist"));
    act(() => first.result.current.nudge("bpm", -1));
    act(() => first.result.current.setWidths({ title: 260 }));
    first.unmount();

    const second = render();

    expect(second.result.current.layout.map((entry) => entry.id)).toEqual([
      "title",
      "bpm",
      "artist",
    ]);
    expect(second.result.current.widths.title).toBe(260);
    expect(
      second.result.current.layout.find((entry) => entry.id === "artist")?.hidden,
    ).toBe(true);
  });

  it("writes something that can be read back", () => {
    const { result } = render();
    act(() => result.current.nudge("bpm", -1));

    const raw = localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY);
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw!);
    expect(saved.unit).toBe("1x");
    expect(saved.columns).toEqual(result.current.layout);
  });

  it("does not write when it only loads", () => {
    render();
    expect(localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY)).toBeNull();
  });

  it("stores widths in 1x units and reads them back at another scale", () => {
    localStorage.setItem("cuepoint-ui-lab-scale", "2");
    const first = render();
    act(() => first.result.current.setWidths({ bpm: 200 }));
    expect(JSON.parse(localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY)!).columns).toContainEqual(
      expect.objectContaining({ id: "bpm", width: 100 }),
    );
    first.unmount();

    localStorage.setItem("cuepoint-ui-lab-scale", "1");
    const second = render();
    expect(second.result.current.widths.bpm).toBe(100);
  });

  it("reads a layout saved before the unit was recorded as the current scale's", () => {
    localStorage.setItem(
      LIBRARY_TABLE_LAYOUT_KEY,
      JSON.stringify([{ id: "bpm", width: 130, hidden: false }]),
    );
    expect(render().result.current.widths.bpm).toBe(130);
  });

  it("forgets the stored layout on reset", () => {
    const { result } = render();
    act(() => result.current.nudge("bpm", -1));
    act(() => result.current.reset());
    expect(localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY)).toBeNull();
  });

  it("keeps a column a later release added", () => {
    const first = render();
    act(() => first.result.current.nudge("bpm", -1));
    first.unmount();

    const second = render(WITH_A_NEW_COLUMN);

    expect(second.result.current.layout.map((entry) => entry.id)).toEqual([
      "title",
      "bpm",
      "artist",
      "rating",
    ]);
  });

  it("raises stored widths when the scale grows", () => {
    const first = render();
    act(() => first.result.current.setWidths({ bpm: 60 }));
    first.unmount();

    localStorage.setItem("cuepoint-ui-lab-scale", "3");
    const second = render();

    // 60 CSS pixels at 1× is narrower than the column's own resize handle at 3×.
    expect(second.result.current.widths.bpm).toBe(180);
  });
});

describe("while it is open", () => {
  it("re-floors widths when the scale changes under it", () => {
    // Scale is a live setting: a user can change it in Settings with the table
    // on screen, and a width chosen at 1× is narrower than the column's own
    // resize handle at 3×.
    const { result } = renderHook(
      () => ({
        columns: useColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, COLUMNS),
        scale: useScale(),
      }),
      { wrapper },
    );
    act(() => result.current.columns.setWidths({ bpm: 60 }));
    expect(result.current.columns.widths.bpm).toBe(60);

    act(() => result.current.scale.setScale(3));

    expect(result.current.columns.widths.bpm).toBe(180);
  });

  it("writes nothing to storage when only the scale changes (B2)", () => {
    const { result } = renderHook(
      () => ({
        columns: useColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, COLUMNS),
        scale: useScale(),
      }),
      { wrapper },
    );
    act(() => result.current.columns.setWidths({ bpm: 90 }));
    const stored = localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    try {
      act(() => result.current.scale.setScale(2));
      act(() => result.current.scale.setScale(1));
      const layoutWrites = setItem.mock.calls.filter(([key]) => key === LIBRARY_TABLE_LAYOUT_KEY);
      expect(layoutWrites).toEqual([]);
      expect(removeItem).not.toHaveBeenCalled();
      expect(localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY)).toBe(stored);
    } finally {
      setItem.mockRestore();
      removeItem.mockRestore();
    }
  });

  it("takes on a column that appears while it is mounted", () => {
    const { result, rerender } = renderHook(
      ({ columns }) => useColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, columns),
      { wrapper, initialProps: { columns: COLUMNS as TrackColumnDef<Row>[] } },
    );
    act(() => result.current.nudge("bpm", -1));

    rerender({ columns: WITH_A_NEW_COLUMN });

    expect(result.current.layout.map((entry) => entry.id)).toEqual([
      "title",
      "bpm",
      "artist",
      "rating",
    ]);
  });

  it("drops a column that goes away while it is mounted", () => {
    const { result, rerender } = renderHook(
      ({ columns }) => useColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, columns),
      { wrapper, initialProps: { columns: WITH_A_NEW_COLUMN } },
    );
    expect(result.current.layout).toHaveLength(4);

    rerender({ columns: COLUMNS as TrackColumnDef<Row>[] });

    expect(result.current.layout.map((entry) => entry.id)).not.toContain("rating");
  });
});

describe("resetting", () => {
  it("goes back to every column, in order, at its default width", () => {
    const { result } = render();
    act(() => result.current.toggle("artist"));
    act(() => result.current.nudge("bpm", -1));
    act(() => result.current.setWidths({ title: 500 }));

    act(() => result.current.reset());

    expect(result.current.layout.map((entry) => entry.id)).toEqual([
      "title",
      "artist",
      "bpm",
    ]);
    expect(result.current.layout.every((entry) => !entry.hidden)).toBe(true);
    expect(result.current.widths).toMatchObject({ title: 200, artist: 170, bpm: 80 });
  });

  it("is remembered too", () => {
    const first = render();
    act(() => first.result.current.toggle("artist"));
    act(() => first.result.current.reset());
    first.unmount();

    const second = render();
    expect(second.result.current.visible).toHaveLength(3);
  });
});

describe("what it refuses", () => {
  it("will not hide the last visible column", () => {
    const { result } = render();
    act(() => result.current.toggle("artist"));
    act(() => result.current.toggle("bpm"));

    act(() => result.current.toggle("title"));

    expect(result.current.visible).toHaveLength(1);
  });

  it("will not move a scrolling column ahead of a pinned one", () => {
    const { result } = render();

    act(() => result.current.move("artist", 0));

    expect(result.current.layout[0]!.id).toBe("title");
  });
});

describe("moving a layout saved in the previous default order (DEC-NEW-K1)", () => {
  const PREVIOUS = ["title", "bpm", "artist"];

  it("moves it once, keeps widths, and saves the new order", () => {
    localStorage.setItem(
      LIBRARY_TABLE_LAYOUT_KEY,
      JSON.stringify([
        { id: "title", width: 210, hidden: false },
        { id: "bpm", width: 95, hidden: false },
        { id: "artist", width: 150, hidden: true },
      ]),
    );
    const { result } = renderHook(
      () => useColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, COLUMNS, { previousDefaultOrder: PREVIOUS }),
      { wrapper },
    );
    expect(result.current.layout.map((entry) => entry.id)).toEqual(["title", "artist", "bpm"]);
    expect(result.current.layout[1]).toMatchObject({ width: 150, hidden: true });
    expect(result.current.layout[2]).toMatchObject({ width: 95 });
    // Loading writes nothing; the move is saved with the person's next change.
    expect(localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY)).not.toContain('"unit"');
  });
});

describe("the remembered client sort (S11)", () => {
  const sorted = () => renderHook(() => useColumnLayout(LIBRARY_TABLE_LAYOUT_KEY, WITH_A_CLIENT_SORT), { wrapper });

  it("starts with none, and is there after a client sort is made and the table reopens", () => {
    const first = sorted();
    expect(first.result.current.sort).toBeNull();
    act(() => first.result.current.setSort({ key: "bpm", direction: "desc" }));
    expect(first.result.current.sort).toEqual({ key: "bpm", direction: "desc" });
    first.unmount();
    expect(sorted().result.current.sort).toEqual({ key: "bpm", direction: "desc" });
  });

  it("is kept when a width, a column or the order changes afterwards", () => {
    const { result } = sorted();
    act(() => result.current.setSort({ key: "bpm", direction: "asc" }));
    act(() => result.current.setWidths({ title: 260 }));
    act(() => result.current.toggle("bpm"));
    expect(JSON.parse(localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY)!)).toMatchObject({
      unit: "1x",
      sort: { key: "bpm", direction: "asc" },
    });
  });

  it("forgets a client sort when the person sorts by an engine column, and never stores an engine key", () => {
    const { result } = sorted();
    act(() => result.current.setSort({ key: "bpm", direction: "asc" }));
    act(() => result.current.setSort({ key: "title", direction: "asc" }));
    expect(result.current.sort).toBeNull();
    expect(JSON.parse(localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY)!).sort).toBeUndefined();
  });

  it("is forgotten by a reset", () => {
    const { result } = sorted();
    act(() => result.current.setSort({ key: "bpm", direction: "asc" }));
    act(() => result.current.reset());
    expect(result.current.sort).toBeNull();
    expect(localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY)).toBeNull();
  });

  it("reads a layout saved before sorts were stored as having none, and writes nothing on load", () => {
    localStorage.setItem(LIBRARY_TABLE_LAYOUT_KEY, JSON.stringify([{ id: "bpm", width: 90, hidden: false }]));
    const before = localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY);
    const { result } = sorted();
    expect(result.current.sort).toBeNull();
    expect(localStorage.getItem(LIBRARY_TABLE_LAYOUT_KEY)).toBe(before);
  });
});

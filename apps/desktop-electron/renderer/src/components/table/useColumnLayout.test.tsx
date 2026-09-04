/**
 * A remembered column layout (LIBUI-06, DEC-042).
 *
 * The model's rules are tested in `columnLayout.test.ts`; this is about the
 * part a user notices — that the layout is still there tomorrow, that it
 * survives a scale change and a release that adds a column, and that "reset"
 * really goes back to the beginning.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
    expect(JSON.parse(raw!)).toEqual(result.current.layout);
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
    expect(result.current.widths).toMatchObject({ title: 200, artist: 120, bpm: 80 });
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

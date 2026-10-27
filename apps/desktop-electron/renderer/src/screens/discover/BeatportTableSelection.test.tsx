/**
 * A table that sorts its own rows (C193) keeps its selection's positions as the table shows them:
 * the anchor a Shift range starts from and the order of the selected rows follow the displayed
 * rows, also after the rows are loaded again. It also offers the artist and label pages as
 * visible buttons for one selected track (C196), not only in the right-click menu.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useCallback, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiscoverRunTrackRow } from "../../api/cuepointBridge.types";
import { inMemorySource } from "../../components/table";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { BeatportTable } from "./BeatportTable";
import { RUN_COLUMNS } from "./beatportColumns";
import { beatportRef, nameRef } from "./discoverLinks";
import { useBeatportSelection } from "./useBeatportSelection";

function track(id: number, title: string, label: string, artist = "Artist"): DiscoverRunTrackRow {
  return {
    beatport_track_id: id,
    title,
    mix_name: "Original Mix",
    url: `https://www.beatport.com/track/x/${id}`,
    label_id: 7,
    label_name: label,
    label_key: null,
    release_id: id,
    release_name: `Release ${id}`,
    release_date: "2026-09-01",
    bpm: 124,
    key: null,
    genre_id: 5,
    // The genre carries the sorted word: Label waits in the Columns list at the default window (M85).
    genre_name: label,
    fetched_at: "2026-10-14T10:00:00+00:00",
    artists: [artist],
    remixers: [],
    owned: false,
    on_wantlist: false,
    position: id,
    sources: [],
  };
}

// Sorted by the Genre column (no engine key, so the table sorts it): Alpha, Charlie, Bravo.
const ROWS = [track(1, "Bravo", "Zed"), track(2, "Charlie", "Mid"), track(3, "Alpha", "Aaa")];

const proto = HTMLElement.prototype;
const widthBefore = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
const heightBefore = Object.getOwnPropertyDescriptor(proto, "offsetHeight");

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 400 });
});

afterAll(() => {
  for (const [name, before] of [
    ["offsetWidth", widthBefore],
    ["offsetHeight", heightBefore],
  ] as const) {
    if (before) Object.defineProperty(proto, name, before);
    else Reflect.deleteProperty(proto, name);
  }
});

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // Storage may be blocked; the table still renders.
  }
});

function Harness({ onOpenPage }: { onOpenPage?: (kind: "artist" | "label", ref: string) => void }) {
  // A new source object each time the "window" is loaded again, as a refetch makes.
  const [source, setSource] = useState(() => inMemorySource(ROWS.map((row) => ({ ...row }))));
  const idOf = useCallback((row: DiscoverRunTrackRow) => row.beatport_track_id, []);
  const loadedRows = useCallback(
    () => ROWS.map((_, index) => ({ row: source.getRow(index)!, index })),
    [source],
  );
  const selection = useBeatportSelection<DiscoverRunTrackRow>({
    key: "rows",
    idOf,
    getRow: source.getRow,
    loadedRows,
  });
  return (
    <>
      <button type="button" onClick={() => setSource(inMemorySource(ROWS.map((row) => ({ ...row }))))}>
        Reload rows
      </button>
      <output data-testid="anchor">{String(selection.anchor)}</output>
      <output data-testid="anchor-row">{selection.anchorRow?.title ?? "none"}</output>
      <output data-testid="picked">{selection.rows.map((row) => row.title).join(",")}</output>
      <BeatportTable<DiscoverRunTrackRow>
        columns={RUN_COLUMNS}
        layoutKey="test-sorted-selection"
        source={source}
        selection={selection}
        idOf={idOf}
        actions={[]}
        onAction={() => {}}
        label="Tracks this dig found"
        summary="3 tracks"
        emptyState={null}
        resetKey="rows"
        onOpenPage={onOpenPage}
      />
    </>
  );
}

function renderTable(onOpenPage?: (kind: "artist" | "label", ref: string) => void) {
  return render(
    <MemoryRouter>
      <ScaleProvider>
        <Harness onOpenPage={onOpenPage} />
      </ScaleProvider>
    </MemoryRouter>,
  );
}

function bodyTitles() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector('[data-column="title"]')?.textContent ?? "");
}

describe("a table sorted by its own header", () => {
  it("keeps the anchor on the displayed row when the rows are loaded again", () => {
    renderTable();
    fireEvent.click(within(screen.getAllByRole("columnheader")[0]!.closest("[role=row]") as HTMLElement).getByRole("button", { name: /^Genre/ }));
    expect(bodyTitles()[0]).toMatch(/^Alpha/);

    // The first displayed row is the third source row.
    fireEvent.click(screen.getAllByRole("row")[1]!.querySelector('[data-column="title"]')!);
    expect(screen.getByTestId("anchor")).toHaveTextContent("0");
    expect(screen.getByTestId("picked")).toHaveTextContent("Alpha");

    fireEvent.click(screen.getByRole("button", { name: "Reload rows" }));
    expect(screen.getByTestId("anchor")).toHaveTextContent("0");
    // The row the Inspector follows is still the one clicked.
    expect(screen.getByTestId("anchor-row")).toHaveTextContent("Alpha");
    expect(screen.getAllByRole("row")[1]).toHaveAttribute("aria-selected", "true");

    // A Shift-click from there takes the displayed rows between, not the source's.
    fireEvent.click(screen.getAllByRole("row")[2]!.querySelector('[data-column="title"]')!, { shiftKey: true });
    expect(screen.getByTestId("picked")).toHaveTextContent("Alpha,Charlie");
  });
});

describe("the artist and label pages of one selected track", () => {
  it("are in one visible Open menu button in the bar, from the same items as the right-click menu (new D)", async () => {
    const open = vi.fn();
    renderTable(open);
    const bar = screen.getByRole("toolbar", { name: "Tracks this dig found: actions" });
    // Nothing selected: nothing to open.
    expect(within(bar).queryByRole("button", { name: "Open" })).toBeNull();

    fireEvent.click(screen.getAllByRole("row")[1]!.querySelector('[data-column="title"]')!);
    // The pages are never separate buttons, so the bar keeps one line.
    expect(within(bar).queryByRole("button", { name: "Open artist page" })).toBeNull();
    expect(within(bar).queryByRole("button", { name: "Open label page" })).toBeNull();
    const button = within(bar).getByRole("button", { name: "Open" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(button);
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Open label page" }));
    expect(open).toHaveBeenCalledWith("label", beatportRef(7));
    fireEvent.click(within(bar).getByRole("button", { name: "Open" }));
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Open artist page" }));
    expect(open).toHaveBeenCalledWith("artist", nameRef("Artist"));

    // Two tracks have no single page to open.
    fireEvent.click(screen.getAllByRole("row")[2]!.querySelector('[data-column="title"]')!, { ctrlKey: true });
    expect(within(bar).queryByRole("button", { name: "Open" })).toBeNull();
  });
});

/**
 * A long dig draws a window of its rows, not all of them.
 *
 * A dig of 1,481 tracks drew all 1,481 rows, so every click re-drew them and the
 * pages behind it paid for them too. The rows are virtualised; what drew them all
 * was the table's height: `min-height: min-content` on `.discover-table` counted
 * the rows' body, as tall as every row together, so the scroller had room for all
 * of them. `contain: size` on `.discover-table__rows` keeps the rows out of the
 * table's intrinsic height. jsdom lays nothing out, so the viewport is supplied
 * (as `TrackTable.test.tsx` does) and the stylesheet is held to that rule.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DiscoverRunTrackRow } from "../../api/cuepointBridge.types";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { inMemorySource } from "../../components/table";
import discoverCss from "./discover.css?raw";
import { BeatportTable } from "./BeatportTable";
import { RUN_COLUMNS } from "./beatportColumns";
import type { BeatportSelection } from "./useBeatportSelection";

const TRACKS = 1_500;

function track(index: number): DiscoverRunTrackRow {
  return {
    beatport_track_id: 100_000 + index,
    title: `Track ${index}`,
    mix_name: "Original Mix",
    url: `https://www.beatport.com/track/x/${100_000 + index}`,
    label_id: 1,
    label_name: "Label",
    label_key: null,
    release_id: index,
    release_name: `Release ${index}`,
    release_date: "2026-09-01",
    bpm: 124,
    key: null,
    genre_id: 5,
    genre_name: "House",
    fetched_at: "2026-10-14T10:00:00+00:00",
    artists: ["Artist"],
    remixers: [],
    owned: false,
    on_wantlist: false,
    position: index,
    sources: [],
  };
}

const NO_SELECTION: BeatportSelection<DiscoverRunTrackRow> = {
  keys: new Set<number>(),
  rows: [],
  count: 0,
  anchorRow: null,
  anchor: null,
  onRowClick: () => {},
  onRowMenu: () => {},
  select: () => {},
  selectAll: () => {},
  clear: () => {},
  reindex: () => {},
};

const proto = HTMLElement.prototype;
const widthBefore = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
const heightBefore = Object.getOwnPropertyDescriptor(proto, "offsetHeight");

function restore(name: "offsetWidth" | "offsetHeight", before: PropertyDescriptor | undefined) {
  if (before) Object.defineProperty(proto, name, before);
  else Reflect.deleteProperty(proto, name);
}

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
  restore("offsetWidth", widthBefore);
  restore("offsetHeight", heightBefore);
});

describe("a dig's table", () => {
  it("draws a window of a 1,500-track dig, not every row", () => {
    render(
      <MemoryRouter>
        <ScaleProvider>
          <BeatportTable<DiscoverRunTrackRow>
            columns={RUN_COLUMNS}
            layoutKey="test-run-table-window"
            source={inMemorySource(Array.from({ length: TRACKS }, (_, i) => track(i)))}
            selection={NO_SELECTION}
            idOf={(row) => row.beatport_track_id}
            actions={[]}
            onAction={() => {}}
            label="Tracks this dig found"
            summary="1,500 tracks"
            emptyState={null}
            resetKey="run"
          />
        </ScaleProvider>
      </MemoryRouter>,
    );
    const rows = screen.getAllByRole("row");
    // The header, and a screenful with its overscan.
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.length).toBeLessThan(120);
    expect(screen.getByRole("table", { name: "Tracks this dig found" })).toHaveAttribute(
      "aria-rowcount",
      String(TRACKS),
    );
  });

  it("keeps its rows out of the table's own height", () => {
    // Without comments, so one cannot hide or fake a declaration.
    const bare = discoverCss.replace(/\/\*[\s\S]*?\*\//g, "");
    // The body of the rule whose whole selector is `selector`.
    const rule = (selector: string) => {
      for (const [, selectors = "", body = ""] of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (selectors.trim() === selector) return body;
      }
      return "";
    };
    expect(rule(".discover-table__rows")).toMatch(/contain:\s*size/);
    // The actions bar is above the rows: auto for the bar, the floor-and-fill for the rows.
    expect(rule(".discover-table")).toMatch(/grid-template-rows:\s*auto\s+minmax\(/);
  });

  it("keeps the artist page's Your tracks table a grid with a height, so it is not 2px tall", () => {
    // It was once a flex column: the rows (no height of their own) then took none.
    const bare = discoverCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const ruleWith = (selector: string) =>
      [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selectors = ""]) => selectors.split(",").some((one) => one.trim() === selector))
        .map(([, , body = ""]) => body)
        .join(" ");
    const half = ruleWith(".discover-page__half > .discover-table");
    // The height follows the rows the list holds, up to ten (C253), not a fixed box.
    expect(half).toMatch(/height:\s*calc\(\(var\(--discover-rows, 10\) \+ 1\) \* var\(--row-height\)\)/);
    expect(half).not.toMatch(/display:\s*flex/);
    // Nothing later turns the .discover-table itself into a flex box.
    expect(ruleWith(".discover-table")).not.toMatch(/display:\s*flex/);
  });
});

/**
 * Pinned columns and header focus (visual review).
 *
 * jsdom lays nothing out, so the scroll a browser makes when a header cell takes focus is
 * simulated by moving scrollLeft; the sticky rule is read from the stylesheet source.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { TrackTable } from "./TrackTable";
import { inMemorySource } from "./trackTableSource";
import type { TrackColumnDef } from "./trackTableLayout";
import css from "./TrackTable.css?raw";

interface Row {
  id: number;
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [
  { id: "title", header: "Title", sortKey: "title", sticky: true, render: (r) => r.title },
  { id: "key", header: "Key", sortKey: "key", render: () => "8A" },
];

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
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

describe("a table scrolled sideways", () => {
  it("keeps the scroll when a header cell takes focus", () => {
    render(
      <ScaleProvider>
        <TrackTable<Row> columns={COLUMNS} source={inMemorySource([{ id: 1, title: "A" }])} getRowKey={(r) => r.id} />
      </ScaleProvider>,
    );
    const scroll = screen.getByRole("table");
    scroll.scrollLeft = 120;
    fireEvent.scroll(scroll);
    // What a browser does as a header cell takes focus: it moves the scroll to centre it.
    scroll.scrollLeft = 0;
    screen.getByRole("button", { name: "Key" }).focus();
    expect(scroll.scrollLeft).toBe(120);
  });
});

describe("the row's sticky cells", () => {
  it("are not inside a scroll container of the row's own", () => {
    const rule = /\.track-table__row \{[^}]*\}/.exec(css)?.[0] ?? "";
    // "overflow: hidden" would make the row the thing a sticky cell sticks to, and it never scrolls.
    expect(rule).toMatch(/overflow:\s*clip/);
    expect(rule).not.toMatch(/overflow:\s*hidden/);
    expect(css).not.toMatch(/\.track-table__row--end \.track-table__cell--sticky/);
  });
});

/**
 * The bottom bar (option 1A): the selection bar drawn over the table's bottom rows, so the first
 * click of a double-click, which brings it, never moves a row.
 *
 * jsdom lays nothing out, so what is held here is the structure the layout rests on: the end room
 * is one element that is there with or without the bar (never toggled), the bar is outside the
 * scroll area, the scroll padding is the bar's only while it is drawn, and a row the keys move to
 * is kept above it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const COLUMNS: TrackColumnDef<Row>[] = [{ id: "title", header: "Title", render: (r) => r.title }];
const ROWS: Row[] = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, title: `Row ${i + 1}` }));

const scrollTo = vi.fn();

beforeEach(() => {
  localStorage.setItem("cuepoint-ui-lab-scale", "1");
  scrollTo.mockClear();
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("track-table__header") ? 30 : 400;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 400 });
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: scrollTo });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  Reflect.deleteProperty(Element.prototype, "scrollTo");
});

function tree(bottomBar: React.ReactNode | undefined) {
  return (
    <ScaleProvider>
      <TrackTable<Row>
        columns={COLUMNS}
        source={inMemorySource(ROWS)}
        getRowKey={(r) => r.id}
        ariaLabel="Rows"
        onSelect={() => {}}
        bottomBar={bottomBar}
      />
    </ScaleProvider>
  );
}

describe("the bottom bar over a table (option 1A)", () => {
  it("keeps one end room after the rows, with or without the bar, and draws the bar outside the scroll area", () => {
    const { container, rerender } = render(tree(null));
    const scroll = screen.getByRole("table", { name: "Rows" });
    const room = container.querySelector(".track-table__bottom-room");
    expect(room).not.toBeNull();
    expect(scroll.lastElementChild).toBe(room);
    expect(container.querySelector(".track-table__bottom-bar")).toBeNull();
    expect(container.querySelector(".track-table")).not.toHaveAttribute("data-bottom-bar");

    rerender(tree(<div role="toolbar" aria-label="Selection" />));
    const bar = container.querySelector(".track-table__bottom-bar")!;
    expect(bar).not.toBeNull();
    expect(scroll.contains(bar)).toBe(false);
    expect(bar.parentElement).toHaveClass("track-table");
    // The very same element: the room is never taken away and put back.
    expect(container.querySelector(".track-table__bottom-room")).toBe(room);
    expect(container.querySelector(".track-table")).toHaveAttribute("data-bottom-bar", "");

    rerender(tree(null));
    expect(container.querySelector(".track-table__bottom-bar")).toBeNull();
    expect(container.querySelector(".track-table__bottom-room")).toBe(room);
  });

  it("keeps no room for a table without a bottom bar", () => {
    const { container } = render(tree(undefined));
    expect(container.querySelector(".track-table__bottom-room")).toBeNull();
  });

  it("toggles only the scroll padding, never the room, and keeps the bar clear of both scrollbars", () => {
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThanOrEqual(0);
      return css.slice(at, css.indexOf("}", at));
    };
    expect(rule(".track-table__bottom-room")).toMatch(/height:\s*var\(--track-table-bottom-room, var\(--selection-bar-height\)\)/);
    expect(css).not.toMatch(/\[data-bottom-bar\][^{]*\.track-table__bottom-room/);
    expect(rule(".track-table[data-bottom-bar] .track-table__scroll")).toMatch(/scroll-padding-bottom:/);
    const bar = rule(".track-table__bottom-bar");
    expect(bar).toMatch(/position:\s*absolute/);
    expect(bar).toMatch(/bottom:\s*var\(--track-table-scrollbar-x/);
    expect(bar).toMatch(/right:\s*var\(--track-table-scrollbar-y/);
    expect(bar).not.toMatch(/shadow/);
    // Its frame passes the pointer on, so only the bar itself (once armed) takes a click.
    expect(bar).toMatch(/pointer-events:\s*none/);
    expect(rule(".track-table__bottom-bar > *")).toMatch(/pointer-events:\s*auto/);
  });

  it("asks the scroll area for its scroll padding when the keys move the row, so the row stays above the bar", () => {
    render(tree(<div />));
    const scroll = screen.getByRole("table", { name: "Rows" });
    const spy = vi.spyOn(window, "getComputedStyle");
    try {
      scroll.focus();
      fireEvent.keyDown(scroll, { key: "End" });
      expect(spy.mock.calls.some(([element]) => element === scroll)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

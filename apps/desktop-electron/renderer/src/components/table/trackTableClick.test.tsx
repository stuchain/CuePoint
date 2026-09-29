/**
 * A double-click lands on the row that was clicked (DEC-112, PREP-10).
 *
 * The defect Phase 8's macOS pass found: a mouse press on a row moves focus to
 * the table, which is focusable so the keyboard can reach it, and the browser
 * scrolls a newly focused element into view. When the page around the table
 * scrolls and the row is only partly visible, that moves the rows under the
 * pointer between the two clicks of a double-click, so the second lands on
 * another row or on nothing and the track never plays.
 *
 * The fix gives the table focus on the press itself, without the scroll, so
 * the browser finds it focused already and moves nothing. jsdom lays nothing
 * out and never scrolls, so the test holds what the table asks of the
 * browser: focus with `preventScroll`. Keyboard navigation is untouched, and
 * still scrolls (`trackTableScroll.test.tsx`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { TrackTable } from "./TrackTable";
import { inMemorySource } from "./trackTableSource";
import type { TrackColumnDef } from "./trackTableLayout";

interface Row {
  id: number;
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [{ id: "title", header: "Title", render: (r) => r.title }];
const ROWS: Row[] = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, title: `Row ${i + 1}` }));

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

function draw(onRowActivate = vi.fn()) {
  render(
    <ScaleProvider>
      <TrackTable<Row>
        columns={COLUMNS}
        source={inMemorySource(ROWS)}
        getRowKey={(r) => r.id}
        onRowActivate={onRowActivate}
        ariaLabel="Rows"
      />
    </ScaleProvider>,
  );
  return onRowActivate;
}

describe("a mouse press on a row", () => {
  it("focuses the table without asking the browser to scroll it into view", async () => {
    draw();
    const table = screen.getByRole("table", { name: "Rows" });
    const focus = vi.spyOn(table, "focus");
    const row = (await screen.findByText("Row 2")).closest('[role="row"]')!;

    fireEvent.mouseDown(row, { button: 0 });

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(table);
  });

  it("leaves a table that already has focus alone", async () => {
    draw();
    const table = screen.getByRole("table", { name: "Rows" });
    table.focus();
    const focus = vi.spyOn(table, "focus");
    const row = (await screen.findByText("Row 3")).closest('[role="row"]')!;

    fireEvent.mouseDown(row, { button: 0 });

    expect(focus).not.toHaveBeenCalled();
  });

  it("plays the row the double-click landed on", async () => {
    const activate = draw();
    const row = (await screen.findByText("Row 2")).closest('[role="row"]')!;
    fireEvent.mouseDown(row, { button: 0 });
    fireEvent.click(row);
    fireEvent.mouseDown(row, { button: 0 });
    fireEvent.click(row);
    fireEvent.doubleClick(row);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate.mock.calls[0][0]).toEqual({ id: 2, title: "Row 2" });
  });
});

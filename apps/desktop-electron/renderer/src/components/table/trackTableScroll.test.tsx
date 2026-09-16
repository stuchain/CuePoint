/**
 * Keeping the keyboard's row in view (CLEAN-12).
 *
 * The review queue moves its cursor with the arrow keys; the table's part is
 * only to scroll that row into view when it changes. jsdom lays nothing out,
 * so the viewport is supplied as `TrackTable.test.tsx` supplies it, and the
 * scroll the virtualizer asks for is observed on the scroll element.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { TrackTable } from "./TrackTable";
import { inMemorySource } from "./trackTableSource";
import type { TrackColumnDef } from "./trackTableLayout";

interface Row {
  id: number;
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [{ id: "title", header: "Title", render: (r) => r.title }];
const ROWS: Row[] = Array.from({ length: 5_000 }, (_, i) => ({ id: i + 1, title: `Row ${i + 1}` }));

let scrolled: ReturnType<typeof vi.fn>;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 400 });
  scrolled = vi.fn();
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: scrolled });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  Reflect.deleteProperty(Element.prototype, "scrollTo");
});

function table(scrollToIndex: number | null) {
  return (
    <ScaleProvider>
      <TrackTable<Row>
        columns={COLUMNS}
        source={inMemorySource(ROWS)}
        getRowKey={(r) => r.id}
        scrollToIndex={scrollToIndex}
      />
    </ScaleProvider>
  );
}

/**
 * How often the table asked the virtualizer to bring a row into view.
 *
 * The virtualizer answers `scrollToIndex` with a `scrollTo` carrying a
 * `behavior`; the reset to the top carries none. jsdom measures every row as
 * zero pixels tall, so the offset itself says nothing here — that the table
 * asked, and when, is the table's part.
 */
function asked(): number {
  return scrolled.mock.calls.filter(([options]) => "behavior" in (options as object)).length;
}

/** Let the virtualizer finish whatever it does on its own after a render. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

describe("a row kept in view", () => {
  it("is asked for each time the cursor moves", async () => {
    const { rerender } = render(table(null));
    await screen.findByText("Row 1");
    await settle();
    const before = asked();

    rerender(table(3_000));
    await vi.waitFor(() => expect(asked()).toBe(before + 1));

    rerender(table(3_001));
    await vi.waitFor(() => expect(asked()).toBe(before + 2));
  });

  it("is not asked for again while the cursor stays", async () => {
    const { rerender } = render(table(null));
    await screen.findByText("Row 1");
    rerender(table(10));
    await settle();
    const before = asked();

    rerender(table(10));
    await settle();
    expect(asked()).toBe(before);
  });

  it("ignores a row the source does not have", async () => {
    const { rerender } = render(table(null));
    await screen.findByText("Row 1");
    await settle();
    const before = asked();

    rerender(table(99_999));
    rerender(table(-1));
    await settle();
    expect(asked()).toBe(before);
  });
});

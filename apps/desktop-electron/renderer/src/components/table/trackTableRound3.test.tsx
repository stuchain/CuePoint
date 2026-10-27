/**
 * Round 3's table rules (M85, M91, M96, M97, M100, M321, M333, M366, M373, M455, M460).
 *
 * jsdom lays nothing out, so the drawn widths are read from the grid template the table writes, and
 * the stylesheet rules are read from the source text, as the other table guards do.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { TrackTable } from "./TrackTable";
import { inMemorySource, pendingSource } from "./trackTableSource";
import type { TrackColumnDef } from "./trackTableLayout";
import css from "./TrackTable.css?raw";

interface Row {
  id: number;
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [
  { id: "title", header: "Title", sortKey: "title", sticky: true, minWidthPx: 120, defaultWidthPx: 220, render: (r) => r.title },
  { id: "artist", header: "Artist", sortKey: "artist", minWidthPx: 100, defaultWidthPx: 170, render: () => "x" },
  { id: "bpm", header: "BPM", sortKey: "bpm", minWidthPx: 56, defaultWidthPx: 72, align: "right", render: () => "128" },
  { id: "key", header: "Key", sortKey: "key", chips: true, minWidthPx: 56, defaultWidthPx: 70, render: () => "8A" },
];
const ROWS: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, title: `Track ${i + 1}` }));

function measuredAt(width: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("track-table__corner") ? 0 : width;
    },
  });
}

function draw(props: Partial<Parameters<typeof TrackTable<Row>>[0]> = {}) {
  return render(
    <ScaleProvider>
      <TrackTable<Row> columns={COLUMNS} source={inMemorySource(ROWS)} getRowKey={(r) => r.id} {...props} />
    </ScaleProvider>,
  );
}

const drawn = () =>
  (screen.getByTestId("track-table").style.getPropertyValue("--track-table-columns").match(/\d+(?=px)/g) ?? []).map(Number);

beforeEach(() => {
  localStorage.setItem("cuepoint-ui-lab-scale", "1");
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // jsdom lays nothing out: give the scroll area a height, so the virtualizer draws rows.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("track-table__header") ? 30 : 400;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 400 });
});

afterEach(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

afterAll(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

describe("a narrow table gives up Title first (M85)", () => {
  it("takes the shortfall out of Title, down to its minimum, and leaves the numbers alone", () => {
    // 220 + 170 + 72 + 70 = 532 wanted; 440 is all there is.
    measuredAt(440);
    draw();
    const [title, artist, bpm] = drawn();
    expect(title).toBe(128);
    expect(artist).toBe(170);
    expect(bpm).toBe(72);
  });

  it("goes on to Artist, never below a minimum", () => {
    measuredAt(380);
    draw();
    const [title, artist] = drawn();
    expect(title).toBe(120);
    expect(artist).toBeGreaterThanOrEqual(100);
    expect(artist).toBeLessThan(170);
  });

  it("holds a width the person dragged to, and scrolls instead", () => {
    measuredAt(440);
    draw({ widths: { title: 300, artist: 170, bpm: 72, key: 70 } });
    expect(drawn()[0]).toBe(300);
  });
});

describe("headings and rows (M96, M97, M100)", () => {
  it("starts a key column's heading on the chip's edge", () => {
    draw();
    expect(screen.getByRole("button", { name: "Key" })).toHaveClass("track-table__header-cell--chips");
    expect(screen.getByRole("button", { name: "Title" })).not.toHaveClass("track-table__header-cell--chips");
    expect(css).toMatch(/\.track-table__header-cell--chips \{[^}]*padding-left: calc\(var\(--space-sm\) - var\(--chip-pad\)\)/);
    expect(document.querySelector('[role="cell"][data-column="key"]')).toHaveAttribute("data-chips");
  });

  it("puts the arrow before the words in a number column, centred on them", () => {
    expect(css).toMatch(/\.track-table__header-cell--right \.track-table__header-label \{[^}]*flex-direction: row-reverse/);
    expect(css).toMatch(/\.track-table__sort \{[^}]*align-items: center/);
  });

  it("keeps room for the speaker in the title cell of every row and in its heading, so no title moves", () => {
    draw({ isPlayingRow: (row) => row.id === 2 });
    expect(screen.getByRole("button", { name: "Title" })).toHaveClass("track-table__header-cell--mark");
    const cells = document.querySelectorAll('[role="cell"][data-column="title"]');
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell).toHaveClass("track-table__cell--mark");
    expect(css).toMatch(/\.track-table__playing-icon \{[^}]*position: absolute/);
  });

  it("does not reserve it when the table cannot show a playing row", () => {
    draw();
    expect(document.querySelector(".track-table__cell--mark")).toBeNull();
  });
});

describe("states (M321, M333, M366)", () => {
  it("colours the playing title with the link colour, which holds 4.5:1 on a selected or hovered row", () => {
    expect(css).toMatch(/\.track-table__row--playing \.track-table__cell\[data-column="title"\] \{[^}]*color: var\(--link\)/);
    expect(css).not.toMatch(/\.track-table__row--playing \.track-table__cell\[data-column="title"\] \{[^}]*--accent-primary/);
  });

  it("draws no bar on the playing row: the bar means selected, the speaker means playing", () => {
    expect(css).not.toMatch(/\.track-table__row--playing:not\(\.track-table__row--selected\)/);
  });

  it("writes the drop-chapter label in the colour for text on an accent fill", () => {
    const rule = /\.track-table__row\[data-drop-chapter\]::after \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/background:\s*var\(--accent-primary\)/);
    expect(rule).toMatch(/color:\s*var\(--fg-on-accent\)/);
  });
});

describe("loading rows (M373)", () => {
  it("draws a bar per cell, as wide as its column's kind of value, in the one skeleton tone", () => {
    draw({ source: pendingSource(3) });
    const bars = [...document.querySelectorAll<HTMLElement>(".track-table__skeleton")];
    const widthOf = (column: string) =>
      bars.find((bar) => bar.closest('[data-column="' + column + '"]'))!.style.getPropertyValue("--skeleton-width");
    expect(widthOf("title")).toBe("70%");
    expect(widthOf("artist")).toBe("55%");
    expect(widthOf("bpm")).toBe("40%");
    expect(widthOf("key")).toBe("45%");
    expect(css).toMatch(/\.track-table__skeleton \{[^}]*background:\s*var\(--skeleton-tone\)/);
    expect(css).toMatch(/--skeleton-tone:\s*color-mix/);
    expect(css).toMatch(/\.track-table__skeleton \{[^}]*height:\s*round\(nearest/);
  });
});

describe("the scroll bar and the focus mark (M91, M455)", () => {
  it("starts the scroll bar's track under the header", () => {
    expect(css).toMatch(/\.track-table__scroll::-webkit-scrollbar-track \{[^}]*margin-top:\s*var\(--row-height\)/);
  });

  it("gives a click no ring, and a key brings it back", () => {
    draw();
    const table = screen.getByRole("table");
    expect(table).not.toHaveAttribute("data-pointer");
    fireEvent.mouseDown(document.querySelector('[role="row"][data-index="0"]')!);
    expect(table).toHaveAttribute("data-pointer");
    fireEvent.keyDown(table, { key: "ArrowDown" });
    expect(table).not.toHaveAttribute("data-pointer");
    expect(css).toMatch(/\.track-table__scroll\[data-pointer\]:focus-visible \{[^}]*outline:\s*none/);
  });

  it("draws the keyboard's dashes in a layer above the pinned cells and the corner, across the whole row", () => {
    const rule = /\.track-table__row--cursor::after \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/inset:\s*0/);
    expect(rule).toMatch(/z-index:\s*4/);
    expect(rule).toMatch(/border:[^;]*dashed/);
    expect(css).not.toMatch(/\.track-table__row--cursor \{[^}]*outline/);
  });
});

describe("one Tab stop in the headings (M460)", () => {
  it("is the first heading, and Left and Right move between them", async () => {
    const user = userEvent.setup();
    draw();
    const buttons = ["Title", "Artist", "BPM", "Key"].map((name) => screen.getByRole("button", { name }));
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1, -1]);
    for (const handle of screen.getAllByRole("separator")) expect(handle).toHaveAttribute("tabindex", "-1");

    buttons[0]!.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(buttons[2]).toHaveFocus();
    expect(buttons.map((button) => button.tabIndex)).toEqual([-1, -1, 0, -1]);
    await user.keyboard("{ArrowLeft}");
    expect(buttons[1]).toHaveFocus();
    // The ends stay where they are.
    buttons[3]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(buttons[3]).toHaveFocus();
  });

  it("moves a heading's edge with Alt and Left or Right, as the edge's own keys do", async () => {
    const user = userEvent.setup();
    const changes: Record<string, number>[] = [];
    draw({ onWidthsChange: (widths) => changes.push(widths) });
    screen.getByRole("button", { name: "Artist" }).focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(changes.at(-1)?.artist).toBe(178);
  });
});

describe("hard edges (M89)", () => {
  it("draws the pinned heading with a 1 px edge on its right", () => {
    expect(css).toMatch(/\.track-table__header-cell-wrap--sticky \{[^}]*box-shadow:\s*inset calc\(-1 \* var\(--hairline\)\) 0 0 0 var\(--row-line\)/);
  });
});

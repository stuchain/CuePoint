import { afterEach, describe, expect, it, vi } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import keysCss from "./keys.css?raw";
import { KEYS_VIEW_STORAGE_KEY, keysColumnOrder, loadView, saveView, headerFolds } from "./keysView";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the remembered Keys view (K15)", () => {
  it("starts on the wheel", () => {
    expect(loadView()).toBe("wheel");
  });

  it("is remembered under cuepoint-keys-view", () => {
    saveView("list");
    expect(KEYS_VIEW_STORAGE_KEY).toBe("cuepoint-keys-view");
    expect(localStorage.getItem("cuepoint-keys-view")).toBe("list");
    expect(loadView()).toBe("list");
    saveView("wheel");
    expect(loadView()).toBe("wheel");
  });

  it("reads anything else as the wheel", () => {
    localStorage.setItem("cuepoint-keys-view", "grid");
    expect(loadView()).toBe("wheel");
  });

  it("works when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadView()).toBe("wheel");
    expect(() => saveView("list")).not.toThrow();
  });
});

describe("the counts list's key column", () => {
  it("is wider than three characters, so a 10A or 10B chip never runs into the key name", () => {
    const row = /\.keys-counts__row\s*\{[^}]*\}/.exec(keysCss)?.[0] ?? "";
    expect(row).toContain("grid-template-columns");
    expect(row).not.toMatch(/grid-template-columns:\s*3ch/);
    expect(row).toMatch(/grid-template-columns:\s*calc\(4ch \+ 2 \* var\(--key-chip-pad/);
  });

  it("starts the bar right after the name: the name has a column of its own, the bar takes the rest (C100)", () => {
    const row = /\.keys-counts__row\s*\{[^}]*\}/.exec(keysCss)?.[0] ?? "";
    expect(row).toMatch(/\)\)\s+\d+ch\s+minmax\(0, 1fr\)\s+\d+ch;/);
  });

  it("colours the bar with the key's own colour at a tint, and the chart's with the colours off", () => {
    expect(keysCss).toMatch(/\.keys-counts__bar\s*\{[^}]*color-mix\(in srgb, var\(--key/);
    expect(keysCss).toMatch(/data-key-colours="off"\]\s+\.keys-counts__bar/);
  });

  it("never sets a selected row or a count in bold (C82)", () => {
    const selected = /\.keys-counts__row\[aria-pressed="true"\]\s*\{[^}]*\}/.exec(keysCss)?.[0] ?? "";
    expect(selected).not.toMatch(/font-weight:\s*var\(--font-weight-bold\)/);
    expect(keysCss).not.toMatch(/--font-weight-bold/);
  });

  it("uses the data face for names and numbers (C60)", () => {
    expect(/\.keys-counts__name\s*\{[^}]*\}/.exec(keysCss)?.[0]).toContain("var(--font-data)");
    expect(/\.keys-page__caption\s*\{[^}]*\}/.exec(keysCss)?.[0]).toContain("var(--font-data)");
    expect(keysCss).not.toContain("--font-pixel-digits");
  });
});

describe("the two panes (D12)", () => {
  const rule = (selector: string) => {
    const start = keysCss.indexOf(`${selector} {`);
    expect(start, selector).toBeGreaterThan(-1);
    return keysCss.slice(start, keysCss.indexOf("}", start));
  };

  it("lays Sources, the wheel and the tracks in one row, top-aligned, that wraps instead of scrolling sideways", () => {
    const panes = rule(".keys-page__top");
    expect(panes).toContain("display: flex");
    expect(panes).toContain("flex-wrap: wrap");
    // P7: one stage, so the panes stretch to share their top and bottom edges.
    expect(panes).toContain("align-items: stretch");
  });

  it("meets the sidebar with the Sources pane and keeps the panes 20 apart (D36, M61)", () => {
    expect(rule(".keys-sources")).toContain("margin-inline-start: calc(-1 * var(--safe-left))");
    expect(rule(".keys-sources__body")).toContain("padding-inline-start: calc(var(--space-md) + var(--safe-left))");
    expect(rule(".keys-page__top")).toContain("gap: var(--space-xl)");
  });

  it("lets the track list take the rest of the row, with a floor under which it drops below the wheel", () => {
    const tracks = rule(".keys-page__tracks");
    expect(tracks).toMatch(/flex:\s*1 1 calc\(\d+px \* var\(--scale\)\)/);
  });

  it("moves the list under the wheel below about 1024 wide at 1.25 text size, in em of the content region (C206)", () => {
    const stacked = parseRules(stripComments(keysCss)).find(
      (r) => r.selector === ".keys-page__tracks" && r.context.startsWith("@container content"),
    );
    expect(stacked?.context).toBe("@container content (max-width: 81.92em)");
    expect(stacked?.body).toContain("flex-basis: 100%");
    // 81.92em of 12.5px text is the 1024px the decision names.
    expect(81.92 * 12.5).toBeCloseTo(1024, 5);
    expect(keysCss).not.toMatch(/@media/);
  });

  it("makes the wheel and the list the same box, so switching moves nothing (C249)", () => {
    // P7: the wheel has its own padded pane, so the box is the wheel plus 2 x space-lg.
    expect(rule(".keys-page__view")).toContain("flex: 0 0 calc(var(--keys-wheel) + 2 * var(--space-lg))");
    expect(rule(".keys-page__view")).toContain("background: var(--bg-panel)");
    expect(rule(".keys-page__view")).toContain("padding: var(--space-lg)");
    expect(keysCss).not.toContain('data-view="list"');
  });

  it("holds Sources and the track list to the wheel's height, so the panes share their lines", () => {
    // P7: they stretch with the row instead of a fixed height; the list keeps the wheel's height as its floor,
    // and the narrow layout gives Sources the wheel's height back.
    expect(rule(".keys-sources__body")).not.toContain("height: var(--keys-wheel)");
    expect(rule(".keys-sources__body")).toContain("flex: 1 1 0");
    expect(rule(".keys-tracks")).toContain("min-height: max(var(--keys-wheel)");
    expect(rule(".keys-tracks")).toContain("flex: 1 1 auto");
    const narrow = parseRules(stripComments(keysCss)).find(
      (r) => r.selector === ".keys-sources__body" && r.context.startsWith("@container content"),
    );
    expect(narrow?.body).toContain("height: var(--keys-wheel)");
  });

  it("draws no second divider under the header and adds no padding offset of its own (C35, C219)", () => {
    expect(keysCss).not.toMatch(/border-top:\s*var\(--divider\)/);
    expect(rule(".keys-page__top")).toMatch(/padding:\s*0 0 var\(--space-lg\)/);
  });

  it("never lets the wheel run past its column, so 3x does not scroll sideways", () => {
    expect(rule(".keys-page__wheel")).toContain("max-width: 100%");
  });

  it("uses the shared reading width for its note (C214)", () => {
    expect(rule(".keys-note")).toContain("max-width: var(--reading-width)");
  });
});

describe("the Keys track list's columns (C69)", () => {
  it("puts Key right after Title, so the column the page is about is never off the narrow pane's edge", () => {
    const columns = [{ id: "title" }, { id: "artist" }, { id: "remixer" }, { id: "key" }, { id: "bpm" }];
    expect(keysColumnOrder(columns).map((column) => column.id)).toEqual(["title", "key", "artist", "remixer", "bpm"]);
  });

  it("leaves the order alone when there is no Key column", () => {
    const columns = [{ id: "title" }, { id: "artist" }];
    expect(keysColumnOrder(columns)).toEqual(columns);
  });
});

describe("headerFolds (item 3)", () => {
  it("folds once the count is cut short", () => {
    expect(headerFolds(false, { countCut: true, width: 400, unfoldAt: 0 })).toBe(true);
    expect(headerFolds(false, { countCut: false, width: 400, unfoldAt: 0 })).toBe(false);
  });

  it("stays folded until the toolbar is wide enough for the two again", () => {
    expect(headerFolds(true, { countCut: false, width: 520, unfoldAt: 560 })).toBe(true);
    expect(headerFolds(true, { countCut: false, width: 560, unfoldAt: 560 })).toBe(false);
  });
});

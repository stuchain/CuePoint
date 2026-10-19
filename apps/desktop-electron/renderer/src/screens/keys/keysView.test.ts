import { afterEach, describe, expect, it, vi } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import keysCss from "./keys.css?raw";
import { KEYS_VIEW_STORAGE_KEY, loadView, saveView } from "./keysView";

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
    const panes = rule(".keys-page__panes");
    expect(panes).toContain("display: flex");
    expect(panes).toContain("flex-wrap: wrap");
    expect(panes).toContain("align-items: flex-start");
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
    expect(rule(".keys-page__view")).toContain("flex: 0 0 var(--keys-wheel)");
    expect(keysCss).not.toContain('data-view="list"');
  });

  it("holds Sources and the track list to the wheel's height, so the panes share their lines", () => {
    expect(rule(".keys-sources__body")).toContain("height: var(--keys-wheel)");
    expect(rule(".keys-tracks")).toContain("var(--keys-wheel)");
  });

  it("draws no second divider under the header and adds no padding offset of its own (C35, C219)", () => {
    expect(keysCss).not.toMatch(/border-top:\s*var\(--divider\)/);
    expect(rule(".keys-page__panes")).toMatch(/padding:\s*0 0 var\(--space-lg\)/);
  });

  it("uses the shared reading width for its note (C214)", () => {
    expect(rule(".keys-note")).toContain("max-width: var(--reading-width)");
  });
});

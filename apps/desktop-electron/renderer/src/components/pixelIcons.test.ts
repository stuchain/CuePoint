import { describe, expect, it } from "vitest";
import {
  PIXEL_GRID_SIZE,
  PIXEL_ICONS,
  PIXEL_ICON_NAMES,
  pixelRunsFor,
  toPixelRuns,
  type PixelIconName,
} from "./pixelIcons";

describe("pixel icon artwork", () => {
  it.each(PIXEL_ICON_NAMES)("%s is a square grid of the declared size", (name) => {
    expect(PIXEL_ICONS[name]).toHaveLength(PIXEL_GRID_SIZE);
  });

  // A row one character short shifts every pixel after it and silently
  // distorts the drawing, which is easy to miss by eye in a 12-line block.
  it.each(PIXEL_ICON_NAMES)("%s has rows of exactly the grid width", (name) => {
    const widths = new Set(PIXEL_ICONS[name].map((row) => row.length));
    expect([...widths]).toEqual([PIXEL_GRID_SIZE]);
  });

  it.each(PIXEL_ICON_NAMES)("%s draws something", (name) => {
    expect(pixelRunsFor(name).length).toBeGreaterThan(0);
  });

  it.each(PIXEL_ICON_NAMES)("%s stays inside the grid", (name) => {
    for (const run of pixelRunsFor(name)) {
      expect(run.x).toBeGreaterThanOrEqual(0);
      expect(run.y).toBeLessThan(PIXEL_GRID_SIZE);
      expect(run.x + run.width).toBeLessThanOrEqual(PIXEL_GRID_SIZE);
    }
  });

  it("covers the icons the toolbar actually uses", () => {
    expect(PIXEL_ICON_NAMES).toEqual(
      expect.arrayContaining(["settings", "export", "filter"]),
    );
  });

  it("covers every navigation destination (SHELL-09)", () => {
    // FOUNDATION-14 left the concept icons as Unicode glyphs "until there is a
    // screen to draw them against". There is one now.
    expect(PIXEL_ICON_NAMES).toEqual(
      expect.arrayContaining([
        "collections",
        "clean",
        "discover",
        "prepare",
        "match",
        "incrate",
      ]),
    );
  });

  it.each(PIXEL_ICON_NAMES)("%s uses at least one stroke two cells wide", (name) => {
    // At 1x a grid cell is 2 CSS pixels, so a drawing made only of single
    // cells is a two-pixel scratch. Every icon needs some weight to survive
    // the smallest scale.
    const runs = pixelRunsFor(name);
    expect(runs.some((run) => run.width >= 2)).toBe(true);
  });


  it("has no duplicate artwork", () => {
    const seen = new Map<string, PixelIconName>();
    for (const name of PIXEL_ICON_NAMES) {
      const key = PIXEL_ICONS[name].join("\n");
      const twin = seen.get(key);
      expect(twin, `${name} is identical to ${twin}`).toBeUndefined();
      seen.set(key, name);
    }
  });
});

describe("toPixelRuns", () => {
  it("merges a contiguous row into one rectangle", () => {
    expect(toPixelRuns(["###"])).toEqual([{ x: 0, y: 0, width: 3 }]);
  });

  it("splits a row at gaps", () => {
    expect(toPixelRuns(["#.##"])).toEqual([
      { x: 0, y: 0, width: 1 },
      { x: 2, y: 0, width: 2 },
    ]);
  });

  it("does not merge across rows", () => {
    expect(toPixelRuns(["##", "##"])).toEqual([
      { x: 0, y: 0, width: 2 },
      { x: 0, y: 1, width: 2 },
    ]);
  });

  it("returns nothing for an empty drawing", () => {
    expect(toPixelRuns(["...", "..."])).toEqual([]);
  });

  it("preserves the lit pixel count", () => {
    const grid = PIXEL_ICONS.home;
    const lit = grid.join("").split("").filter((c) => c === "#").length;
    const covered = toPixelRuns(grid).reduce((sum, run) => sum + run.width, 0);

    expect(covered).toBe(lit);
  });

  it("merges enough to be worth doing", () => {
    // The whole reason runs exist: one rect per pixel would be 144 nodes.
    const lit = PIXEL_ICONS.settings.join("").split("").filter((c) => c === "#").length;
    expect(pixelRunsFor("settings").length).toBeLessThan(lit / 2);
  });
});

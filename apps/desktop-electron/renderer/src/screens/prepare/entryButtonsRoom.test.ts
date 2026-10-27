import { describe, expect, it } from "vitest";

import { entryButtonsForm, keepTimesClear, keepTitleClear, measureForm, roomBesideTitle, timesClearWidth } from "./entryButtonsRoom";

describe("room for the entry buttons (C15d, DEC-249)", () => {
  it("is what is left beside the number and the title's small minimum, not the column's width", () => {
    expect(roomBesideTitle(1000, 40, 56)).toBe(904);
    expect(roomBesideTitle(500, 40, 112)).toBe(348);
  });

  it("takes the words if they fit, else the glyphs, else one Actions button", () => {
    expect(entryButtonsForm(400, 380, 200)).toBe("words");
    expect(entryButtonsForm(380, 380, 200)).toBe("words");
    expect(entryButtonsForm(379, 380, 200)).toBe("glyphs");
    expect(entryButtonsForm(200, 380, 200)).toBe("glyphs");
    expect(entryButtonsForm(199, 380, 200)).toBe("actions");
    expect(entryButtonsForm(-50, 380, 200)).toBe("actions");
  });

  it("takes buttons that are not measured to be the words", () => {
    expect(entryButtonsForm(0, 0, 0)).toBe("words");
  });

  it("reads the scroll area and the row, and says nothing where there is no layout", () => {
    document.body.innerHTML = `
      <div class="track-table__scroll"><div class="track-table__row">
        <div data-column="position"></div><div data-column="title"></div>
        <div class="track-table__end"><span data-measure="words"></span><span data-measure="glyphs"></span></div>
      </div></div>`;
    const px = (selector: string, width: number) =>
      Object.defineProperty(document.querySelector(selector), "offsetWidth", { value: width, configurable: true });
    const measure = document.querySelector<HTMLElement>('[data-measure="words"]')!;
    // jsdom lays nothing out: no scroll width, nothing to decide.
    expect(measureForm(measure, 56)).toBeNull();
    Object.defineProperty(document.querySelector(".track-table__scroll"), "clientWidth", { value: 700, configurable: true });
    px('[data-column="position"]', 50);
    px('[data-column="title"]', 200);
    px('[data-measure="words"]', 400);
    px('[data-measure="glyphs"]', 150);
    // Room 700 - (50 + 56) = 594, whatever the title column's 200.
    expect(measureForm(measure, 56)).toBe("words");
    px('[data-measure="words"]', 600);
    expect(measureForm(measure, 56)).toBe("glyphs");
    px('[data-measure="glyphs"]', 600);
    expect(measureForm(measure, 56)).toBe("actions");
    document.body.innerHTML = "";
  });

  it("leaves the time columns clear when they come last, from the first of them to the view's edge (option 3A)", () => {
    const cells = (ids: string[], lefts: number[]) => ids.map((id, at) => ({ id, left: lefts[at]!, width: 80 }));
    // Mix in, Mix out and Starts at end the row: clear from Mix in's left edge.
    expect(timesClearWidth(cells(["position", "title", "key", "in", "out", "starts_at"], [0, 40, 300, 500, 580, 660]), 760)).toBe(260);
    // Only the trailing run counts: Mix in before the Note column is not kept clear.
    expect(timesClearWidth(cells(["position", "title", "in", "note"], [0, 40, 300, 400]), 760)).toBe(0);
    expect(timesClearWidth(cells(["position", "title", "in", "note", "out"], [0, 40, 300, 400, 600]), 760)).toBe(160);
    // Regression (M199 layout): Fit after Mix in still keeps Mix in clear, Fit with it; Fit alone is no time.
    expect(timesClearWidth(cells(["position", "title", "key", "in", "fit"], [0, 40, 300, 600, 700]), 760)).toBe(160);
    expect(timesClearWidth(cells(["position", "title", "key", "fit"], [0, 40, 300, 700]), 760)).toBe(0);
    // Scrolled out of view to the right: nothing to keep clear.
    expect(timesClearWidth(cells(["title", "out"], [0, 900]), 760)).toBe(0);
    expect(timesClearWidth([], 760)).toBe(0);
    // No width is no layout: nothing kept clear.
    expect(timesClearWidth([{ id: "out", left: 0, width: 0 }], 760)).toBe(0);
  });

  it("takes the times kept clear out of the room before choosing the form", () => {
    expect(roomBesideTitle(1000, 40, 56, 200)).toBe(704);
    document.body.innerHTML = `
      <div class="track-table__scroll"><div class="track-table__row">
        <div data-column="position"></div><div data-column="title"></div><div data-column="in"></div>
        <div class="track-table__end"><span data-measure="words"></span><span data-measure="glyphs"></span></div>
      </div></div>`;
    const set = (selector: string, key: string, value: unknown) =>
      Object.defineProperty(document.querySelector(selector), key, { value, configurable: true });
    set(".track-table__scroll", "clientWidth", 700);
    set(".track-table__scroll", "getBoundingClientRect", () => ({ left: 0, right: 715 }));
    // The row runs past the view by the Columns corner's track: the end cell's margin is from its end.
    set(".track-table__row", "getBoundingClientRect", () => ({ left: 0, right: 736 }));
    set('[data-column="position"]', "getBoundingClientRect", () => ({ left: 0, right: 50 }));
    set('[data-column="title"]', "getBoundingClientRect", () => ({ left: 50, right: 550 }));
    set('[data-column="in"]', "getBoundingClientRect", () => ({ left: 550, right: 700 }));
    set('[data-column="position"]', "offsetWidth", 50);
    set('[data-measure="words"]', "offsetWidth", 450);
    set('[data-measure="glyphs"]', "offsetWidth", 300);
    const measure = document.querySelector<HTMLElement>('[data-measure="words"]')!;
    const row = document.querySelector<HTMLElement>(".track-table__row")!;
    const clear = keepTimesClear(measure);
    expect(clear).toBe(150);
    expect(row.style.getPropertyValue("--entry-buttons-clear")).toBe("186px");
    // Room 700 - (50 + 56 + 150) = 444: the words (450) no longer fit, the glyphs do.
    expect(measureForm(measure, 56)).toBe("words");
    expect(measureForm(measure, 56, clear)).toBe("glyphs");
    // Too small even for the glyphs: the one Actions button, in the same place.
    set('[data-measure="glyphs"]', "offsetWidth", 445);
    expect(measureForm(measure, 56, clear)).toBe("actions");
    document.body.innerHTML = "";
  });

  it("tells the row how far the buttons reach over the title, so its text ends short of them", () => {
    document.body.innerHTML = `
      <div class="track-table__row"><div data-column="title"></div>
        <div class="track-table__end"><span data-measure="words"></span></div></div>`;
    const rect = (selector: string, left: number, right: number) =>
      Object.defineProperty(document.querySelector(selector), "getBoundingClientRect", {
        value: () => ({ left, right }),
        configurable: true,
      });
    rect('[data-column="title"]', 50, 250);
    rect(".track-table__end", 180, 600);
    const row = document.querySelector<HTMLElement>(".track-table__row")!;
    keepTitleClear(document.querySelector<HTMLElement>('[data-measure="words"]')!);
    expect(row.style.getPropertyValue("--title-cover")).toBe("70px");
    rect(".track-table__end", 300, 600);
    keepTitleClear(document.querySelector<HTMLElement>('[data-measure="words"]')!);
    expect(row.style.getPropertyValue("--title-cover")).toBe("0px");
    document.body.innerHTML = "";
  });
});

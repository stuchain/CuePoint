import { describe, expect, it } from "vitest";

import { entryButtonsForm, keepTitleClear, measureForm, roomBesideTitle } from "./entryButtonsRoom";

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

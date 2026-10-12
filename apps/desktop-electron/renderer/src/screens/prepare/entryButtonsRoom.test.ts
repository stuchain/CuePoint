import { describe, expect, it } from "vitest";

import { entryButtonsForm, measureForm, roomBesideTitle } from "./entryButtonsRoom";

describe("room for the entry buttons (C15d, DEC-249)", () => {
  it("is what is left beside the number and the title, the title counted at its minimum at least", () => {
    expect(roomBesideTitle(1000, 40, 300, 120)).toBe(660);
    // A title squeezed under its minimum still keeps the minimum.
    expect(roomBesideTitle(500, 40, 60, 120)).toBe(340);
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
    expect(measureForm(measure, 120)).toBeNull();
    Object.defineProperty(document.querySelector(".track-table__scroll"), "clientWidth", { value: 700, configurable: true });
    px('[data-column="position"]', 50);
    px('[data-column="title"]', 200);
    px('[data-measure="words"]', 400);
    px('[data-measure="glyphs"]', 150);
    // Room 700 - 250 = 450.
    expect(measureForm(measure, 120)).toBe("words");
    px('[data-measure="words"]', 460);
    expect(measureForm(measure, 120)).toBe("glyphs");
    px('[data-measure="glyphs"]', 460);
    expect(measureForm(measure, 120)).toBe("actions");
    document.body.innerHTML = "";
  });
});

import { describe, expect, it } from "vitest";
import css from "./statistics.css?raw";
import card from "../../components/Card.css?raw";
import grid from "../../components/table/DataTable.css?raw";

describe("Statistics card headings", () => {
  it("use the same size as equal-level section headings elsewhere, the section role (14), not the 18px dialog size", () => {
    const at = card.indexOf(".cp-card__title {");
    const rule = card.slice(at, card.indexOf("}", at));
    expect(rule).toMatch(/font-size:\s*var\(--font-size-section\);/);
  });
});

describe("Statistics lists", () => {
  it("use the one row height, with no boxes and the shared play button at the row's end", async () => {
    const plays = (await import("./PlaysSection.css?raw")).default;
    // The row height, the divider and the hover are the shared list look (DataTable.css), not copies.
    const rule = (selector: string) => {
      const at = grid.lastIndexOf(`${selector} {`);
      return grid.slice(at, grid.indexOf("}", at));
    };
    expect(rule(".cp-data-grid__item")).toContain("min-height: var(--row-height);");
    expect(rule(".cp-data-grid__row")).toContain("min-height: var(--row-height);");
    for (const own of [plays, css]) {
      expect(own).not.toMatch(/border-bottom:\s*var\(--divider\)/);
    }
    expect(plays).not.toContain("plays__preview");
    expect(plays).toContain(".plays__play");
  });
});

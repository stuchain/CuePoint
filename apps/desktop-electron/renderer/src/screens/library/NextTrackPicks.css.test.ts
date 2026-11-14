/**
 * The compact layout of "Plays well next", held as text (a jsdom test cannot lay out): the heading
 * and its meta on one line, a pick as two lines with Play next at the end of the first, and a
 * cover about one row tall.
 */
import { describe, expect, it } from "vitest";
import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";

import css from "./NextTrackPicks.css?raw";

function rule(selector: string): Map<string, string> {
  const found = parseRules(stripComments(css)).filter((entry) => selectorList(entry.selector).includes(selector));
  expect(found.length, selector).toBeGreaterThan(0);
  return new Map(found.flatMap((entry) => declarations(entry.body)));
}

describe("Plays well next layout", () => {
  it("keeps the heading and the meta on one line", () => {
    expect(rule(".cp-next-picks__head").get("flex-wrap")).toBe("nowrap");
    expect(rule(".cp-next-picks__meta").get("white-space")).toBe("nowrap");
  });

  it("lays a pick out as a grid: title and button on line one, facts on line two", () => {
    const row = rule(".cp-next-picks__row");
    expect(row.get("display")).toBe("grid");
    expect(row.get("grid-template-areas")).toMatch(/"cover title button"\s+"cover facts facts"/);
    expect(rule(".cp-next-picks__row > .cp-btn").get("grid-area")).toBe("button");
    expect(rule(".cp-next-picks__text").get("display")).toBe("contents");
  });

  it("sizes the cover to about one row height, not a big box", () => {
    const size = rule(".cp-next-picks__cover").get("height") ?? "";
    const factor = Number(/var\(--row-height\) \* ([\d.]+)/.exec(size)?.[1]);
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThanOrEqual(1.5);
  });

  it("draws no word or dash in a cover without art", () => {
    expect(rule(".cp-next-picks__cover .library-cell__artwork-none").get("font-size")).toBe("0");
  });
});

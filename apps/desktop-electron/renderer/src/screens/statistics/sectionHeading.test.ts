import { describe, expect, it } from "vitest";
import css from "./statistics.css?raw";

describe("Statistics card headings", () => {
  it("use the same size as equal-level section headings elsewhere, the section role (14), not the 18px dialog size", () => {
    const at = css.indexOf(".statistics-panel__title {");
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toMatch(/font-size:\s*var\(--font-size-section\);/);
  });
});

describe("Statistics lists", () => {
  it("use the one row height, with no boxes and the shared play button at the row's end", async () => {
    const plays = (await import("./PlaysSection.css?raw")).default;
    const item = /\.plays__item\s*\{[^}]*\}/.exec(plays)?.[0] ?? "";
    expect(item).toContain("min-height: var(--row-height);");
    expect(plays).not.toContain("plays__preview");
    expect(plays).toContain(".plays__play");
    const at = css.lastIndexOf(".rank__row {");
    const rows = css.slice(at, css.indexOf("}", at));
    expect(rows).toContain("min-height: var(--row-height);");
  });
});

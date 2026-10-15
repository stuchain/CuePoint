import { describe, expect, it } from "vitest";
import css from "./statistics.css?raw";

describe("Statistics section headings", () => {
  it("use the same size as equal-level section headings elsewhere, not the 18px page-title size", () => {
    const at = css.indexOf(".statistics-section__title {");
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toMatch(/font-size:\s*var\(--font-size-md\);/);
  });
});

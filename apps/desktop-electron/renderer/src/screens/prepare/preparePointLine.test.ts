import css from "./prepare.css?raw";
import { describe, expect, it } from "vitest";


function rule(selector: string): string {
  const match = css.match(new RegExp(`${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no ${selector} rule`);
  return match[1];
}

describe("the insert line", () => {
  it("wraps to two lines instead of being cut on one", () => {
    const point = rule(".prepare-source__point");
    expect(point).not.toMatch(/white-space:\s*nowrap/);
    expect(point).toMatch(/-webkit-line-clamp:\s*2/);
    // A flex item with overflow hidden would otherwise be squeezed to a line by the panel's column.
    expect(point).toMatch(/flex:\s*none/);
  });
});

describe("a chapter heading and the header's Set title", () => {
  it("keeps the chapter name a button the width of its text: it does not grow to fill the cell", () => {
    const name = rule(".prepare-heading__name");
    expect(name).toMatch(/flex:\s*0 1 auto/);
    expect(name).toMatch(/min-width:\s*0/);
  });

  it("lets the Set's name shrink to its ellipsis on a narrow page (M201)", () => {
    const title = rule(".prepare-title");
    expect(title).toMatch(/min-width:\s*0/);
    expect(title).toMatch(/max-width:\s*100%/);
    const name = rule(".prepare-title__name");
    expect(name).toMatch(/min-width:\s*0/);
    expect(name).toMatch(/text-overflow:\s*ellipsis/);
    expect(name).toMatch(/white-space:\s*nowrap/);
    // The chevron never shrinks away.
    expect(rule(".prepare-title__arrow")).toMatch(/flex:\s*none/);
  });
});

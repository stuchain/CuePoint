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

describe("a chapter heading and the header's Set picker", () => {
  it("keeps Edit… right after the chapter name: the name does not grow to fill the cell", () => {
    const name = rule(".prepare-heading__name");
    expect(name).toMatch(/flex:\s*0 1 auto/);
    expect(name).toMatch(/min-width:\s*0/);
  });

  it("lets the Set picker shrink to its ellipsis on a narrow page", () => {
    const picker = rule(".prepare-header__picker");
    expect(picker).toMatch(/min-width:\s*0/);
    expect(picker).toMatch(/max-width:\s*min\(calc\(320px \* var\(--scale\)\), 100%\)/);
    // Sized to its content up to that limit, like Statistics' pickers: no fixed width.
    expect(picker).toMatch(/width:\s*auto/);
    expect(rule(".prepare-screen .cp-screen-header__beside")).toMatch(/flex:\s*0 1 auto/);
  });
});

import { describe, expect, it } from "vitest";

import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";
import sidebarCss from "./Sidebar.css?raw";

const rules = parseRules(stripComments(sidebarCss));
const decl = (selector: string, property: string) => {
  const rule = rules.filter((r) => selectorList(r.selector).includes(selector) && r.context === "").pop();
  return rule ? Object.fromEntries(declarations(rule.body))[property] : undefined;
};

describe("the sidebar's Search field", () => {
  it("draws its magnifier at the small icon size, on the 12-unit art grid (M38)", () => {
    const rule = rules.find((r) => r.selector.trim() === ".cp-sidebar__search--box .cp-sidebar__icon .cp-pixel-icon");
    expect(rule).toBeDefined();
    const decls = Object.fromEntries(declarations(rule!.body));
    expect(decls["width"]).toBe("var(--icon-size-sm)");
    expect(decls["height"]).toBe("var(--icon-size-sm)");
    expect(sidebarCss).not.toMatch(/\* 0\.75/);
  });

  it("is a bar-tall row in both states, so every link sits at one y whether the rail is open or closed (M486)", () => {
    expect(decl(".cp-sidebar__search", "min-height")).toBe("var(--toolbar-height)");
    expect(decl(".cp-sidebar__brand", "min-height")).toBe("var(--toolbar-height)");
    expect(decl(".cp-sidebar__link", "min-height")).toBe("var(--toolbar-height)");
  });

  it("reads its words in Inter at the control size, like every page's search (M487)", () => {
    expect(decl(".cp-sidebar__search-placeholder", "font-family")).toBe("var(--font-data)");
    expect(decl(".cp-sidebar__search-placeholder", "font-size")).toBe("var(--control-font-size)");
  });
});

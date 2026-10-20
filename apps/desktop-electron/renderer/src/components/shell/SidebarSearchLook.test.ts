import { describe, expect, it } from "vitest";

import { declarations, parseRules, stripComments } from "../../test/cssRules";
import sidebarCss from "./Sidebar.css?raw";

const rules = parseRules(stripComments(sidebarCss));

describe("the sidebar's Search field", () => {
  it("draws its magnifier at three quarters of the sidebar's icon size, so it sits closer to the text", () => {
    const rule = rules.find((r) => r.selector.trim() === ".cp-sidebar__search--box .cp-sidebar__icon .cp-pixel-icon");
    expect(rule).toBeDefined();
    const decls = Object.fromEntries(declarations(rule!.body));
    expect(decls["width"]).toBe("round(nearest, calc(var(--icon-size) * 0.75), 1px)");
    expect(decls["height"]).toBe("round(nearest, calc(var(--icon-size) * 0.75), 1px)");
  });
});

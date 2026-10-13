import { describe, expect, it } from "vitest";
import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";

import statusStrip from "./StatusStrip.css?raw";
import updateItem from "../updates/UpdateStatusItem.css?raw";

/**
 * R2-2, DEC-266: the status strip is one control tall, with no padding above or below.
 * Pins the rules that make it so; the strip shrinks only while nothing inside it is taller.
 */
function ruleDecls(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of parseRules(stripComments(css))) {
    if (selectorList(rule.selector).includes(selector)) {
      for (const [name, value] of declarations(rule.body)) out[name] = value;
    }
  }
  return out;
}

describe("the status strip is slim", () => {
  it("is the height of a control, with no vertical padding", () => {
    const strip = ruleDecls(statusStrip, ".cp-status");
    expect(strip["min-height"]).toBe("var(--control-height)");
    expect(strip["padding"]).toBe("0 var(--space-sm)");
    expect(strip["border-top"]).toBe("var(--divider)");
  });

  it.each([".cp-status__activity", ".cp-status__cancel", ".cp-status__more"])(
    "keeps %s no taller than the strip",
    (selector) => {
      expect(ruleDecls(statusStrip, selector)["min-height"]).toBe("var(--control-height)");
    },
  );

  it("keeps the update button no taller than the strip", () => {
    expect(ruleDecls(updateItem, ".cp-update-item__button")["min-height"]).toBe("var(--control-height)");
  });

  it("uses the icon size nowhere in the strip or its update item", () => {
    expect(stripComments(statusStrip)).not.toContain("--icon-size");
    expect(stripComments(updateItem)).not.toContain("--icon-size");
  });
});

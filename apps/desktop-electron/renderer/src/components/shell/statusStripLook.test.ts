import { describe, expect, it } from "vitest";
import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";

import statusStrip from "./StatusStrip.css?raw";
import updateItem from "../updates/UpdateStatusItem.css?raw";

/**
 * R2-2, DEC-266: the status strip is one control tall, plus even air above and below (Q6c).
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
  it("is the height of a control, inset from the edges", () => {
    const strip = ruleDecls(statusStrip, ".cp-status");
    expect(strip["min-height"]).toBe("var(--control-height)");
    // The shell inset at both sides (C46) and the same air above and below (Q6c, amending C231).
    expect(strip["padding"]).toBe("var(--space-xs) var(--space-lg)");
    expect(strip["border-top"]).toBe("var(--divider)");
  });

  it.each([".cp-status__cancel", ".cp-status__more"])(
    "keeps %s no taller than the strip",
    (selector) => {
      expect(ruleDecls(statusStrip, selector)["min-height"]).toBe("var(--control-height)");
    },
  );

  it("keeps the update button no taller than the strip", () => {
    expect(ruleDecls(updateItem, ".cp-update-item__button")["min-height"]).toBe("var(--control-height)");
  });

  it("is one fixed height in every state: it never collapses while idle (M367, D25)", () => {
    const strip = ruleDecls(statusStrip, ".cp-status");
    expect(strip["height"]).toBe("calc(var(--control-height) + 2 * var(--space-xs) + var(--hairline))");
    expect(strip["box-sizing"]).toBe("border-box");
    expect(stripComments(statusStrip)).not.toMatch(/data-idle/);
  });

  it("names a wait and a ready engine in the muted colour, and only a stopped one in red (M494)", () => {
    for (const selector of [".cp-status__engine--ok", ".cp-status__engine--reconnecting"]) {
      expect(ruleDecls(statusStrip, selector)["color"]).toBe("var(--fg-muted)");
    }
    expect(ruleDecls(statusStrip, ".cp-status__engine--error")["color"]).toBe("var(--danger-text)");
    expect(ruleDecls(statusStrip, ".cp-status__engine")["font-weight"]).toBeUndefined();
  });

  it("keeps the live region a box, so the finish pulse draws (M368)", () => {
    const live = ruleDecls(statusStrip, ".cp-status__live");
    expect(live["display"]).toBe("flex");
    expect(stripComments(statusStrip)).not.toMatch(/display:\s*contents/);
  });

  it("draws the running list as a popover: its border and shadow (M294)", () => {
    const list = ruleDecls(statusStrip, ".cp-status__running");
    expect(list["border"]).toBe("var(--popover-border)");
    expect(list["box-shadow"]).toBe("var(--shadow-popover)");
    expect(list["max-width"]).toContain("2 * var(--space-xs)");
  });

  it("uses the icon size nowhere in the strip or its update item", () => {
    expect(stripComments(statusStrip)).not.toContain("--icon-size");
    expect(stripComments(updateItem)).not.toContain("--icon-size");
  });
});

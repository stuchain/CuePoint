import { describe, expect, it } from "vitest";

import forced from "./forcedColors.css?raw";
import index from "../index.css?raw";
import app from "../App.css?raw";
import { declarations, parseRules, stripComments } from "../test/cssRules";

/**
 * The forced-colours stylesheet (HARDEN-08, DEC-186): it exists for Windows high contrast only, so every
 * rule sits inside `forced-colors: active` and the normal look cannot change; it keeps borders, the
 * focus ring and the selected row visible in system colours.
 */
const rules = parseRules(stripComments(forced));
const rule = (selector: string) => rules.find((r) => r.selector.split(",").map((s) => s.trim()).includes(selector));

describe("forcedColors.css", () => {
  it("is imported by the app's stylesheet", () => {
    expect(index).toMatch(/@import "\.\/tokens\/forcedColors\.css";/);
  });

  it("has only rules inside @media (forced-colors: active), so normal mode is untouched", () => {
    expect(rules.length).toBeGreaterThan(5);
    for (const r of rules) expect(r.context, r.selector).toContain("forced-colors: active");
  });

  it("uses system colours and no theme token for any colour", () => {
    for (const r of rules) {
      for (const [property, value] of declarations(r.body)) {
        if (/color|outline|border/.test(property)) expect(value, `${r.selector} ${property}`).not.toMatch(/var\(--(?!focus-ring-width)/);
      }
    }
  });

  it("draws the focus ring as a solid line of 2px or more in the highlight colour", () => {
    const ring = rule("html :focus-visible");
    expect(ring?.body).toMatch(/outline-style:\s*solid/);
    expect(ring?.body).toMatch(/outline-width:\s*max\(var\(--focus-ring-width, 2px\), 2px\)/);
    expect(ring?.body).toMatch(/outline-color:\s*Highlight/);
  });

  it("gives a dialog, a card, a menu and a toast an edge, since their fill and shadow are dropped", () => {
    for (const selector of ["html .cp-modal", "html .cp-modal:focus", "html .cp-card", "html .cp-track-menu", "html .cp-toast"]) {
      expect(rule(selector)?.body, selector).toMatch(/outline:\s*1px solid CanvasText/);
    }
  });

  it("lets the keyboard's ring win on a focused dialog, after the edge rule that is as specific", () => {
    const edge = rules.findIndex((r) => r.selector.includes("html .cp-modal:focus"));
    const ring = rules.findIndex((r) => r.selector.split(",").map((x) => x.trim()).includes("html .cp-modal:focus-visible"));
    expect(ring).toBeGreaterThan(edge);
    expect(rules[ring]!.body).toMatch(/outline:\s*2px solid Highlight/);
  });

  it("keeps a frameless button's edge, and says a pressed one is on", () => {
    expect(rule("html .cp-btn")?.body).toMatch(/border-color:\s*ButtonText/);
    // A button that has no border of its own (`border: 0`) gets one, or the colour above has nothing to colour.
    expect(rule("html .cp-btn")?.body).toMatch(/border-style:\s*solid/);
    expect(rule("html .cp-btn")?.body).toMatch(/border-width:\s*1px/);
    expect(rule('html .cp-btn[aria-pressed="true"]')?.body).toMatch(/border-color:\s*Highlight/);
  });

  it("marks the active menu entry, the sidebar's page and a selected row with a line", () => {
    for (const selector of [
      'html .cp-track-menu__item--active:not([aria-disabled="true"])',
      "html .cp-sidebar__link--active",
      'html [role="option"][aria-selected="true"]',
      'html [role="treeitem"][aria-selected="true"]',
    ]) {
      expect(rule(selector)?.body, selector).toMatch(/outline:\s*2px solid Highlight/);
    }
  });

  it("leaves the table's selected row to the rule beside it, which already draws a line in Highlight (M463)", () => {
    const selected = parseRules(stripComments(app)).find(
      (r) => r.context.includes("forced-colors") && r.selector.includes(".track-table__row--selected"),
    );
    expect(selected?.body).toMatch(/border-inline-start:[^;]*Highlight/);
  });
});

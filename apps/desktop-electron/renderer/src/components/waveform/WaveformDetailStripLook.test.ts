import { describe, expect, it } from "vitest";

import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";

import stripCss from "./WaveformDetailStrip.css?raw";

/** R4-11: the paused strip is dimmed, and fades only where scrolling may move. */
function ruleDecls(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of parseRules(stripComments(stripCss))) {
    if (selectorList(rule.selector).includes(selector)) {
      for (const [name, value] of declarations(rule.body)) out[name] = value;
    }
  }
  return out;
}

describe("the zoomed strip's look", () => {
  it("dims the canvas while paused", () => {
    expect(ruleDecls('.cp-detail-strip[data-playing="false"] .cp-detail-strip__canvas')["opacity"]).toBe("0.45");
  });

  it("fades the dimming over the motion tokens only under the scrolling motion switch", () => {
    expect(ruleDecls(":root[data-motion-scroll] .cp-detail-strip__canvas")["transition"]).toBe(
      "opacity var(--motion-base) var(--motion-fade)",
    );
    expect(ruleDecls(".cp-detail-strip__canvas")["transition"]).toBeUndefined();
    expect(ruleDecls(".cp-detail-strip")["transition"]).toBeUndefined();
  });

  it("starts after the sidebar, in the content column, not at the window's edge (C213)", () => {
    const strip = ruleDecls(".cp-detail-strip");
    for (const name of ["margin-left", "padding-left", "left", "transform"]) expect(strip[name]).toBeUndefined();
    const wrapper = ruleDecls(".cp-player-slot > .cp-hint:has(> .cp-detail-strip)");
    expect(wrapper["margin-left"]).toBe("var(--shell-sidebar-width, 0px)");
    expect(wrapper["width"]).toBe("auto");
    expect(wrapper["min-height"]).toBe("0");
  });
});

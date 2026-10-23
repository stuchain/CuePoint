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
  // P57: the stopped picture is dimmed to 60% (was 45%).
  it("dims the canvas while paused", () => {
    expect(ruleDecls('.cp-detail-strip[data-playing="false"] .cp-detail-strip__canvas')["opacity"]).toBe("0.6");
  });

  // P57: the top edge is a hairline in the row line, not a 2px outline.
  it("draws its top edge as a hairline in the row line", () => {
    expect(ruleDecls(".cp-detail-strip")["border-top"]).toBe("var(--hairline) solid var(--row-line)");
  });

  it("fades the dimming over the motion tokens only under the scrolling motion switch", () => {
    expect(ruleDecls(":root[data-motion-scroll] .cp-detail-strip__canvas")["transition"]).toBe(
      "opacity var(--motion-base) var(--motion-fade)",
    );
    expect(ruleDecls(".cp-detail-strip__canvas")["transition"]).toBeUndefined();
    expect(ruleDecls(".cp-detail-strip")["transition"]).toBeUndefined();
  });

  it("runs the full window width, from the window's edge, with no empty box under the sidebar", () => {
    const strip = ruleDecls(".cp-detail-strip");
    for (const name of ["margin-left", "padding-left", "left", "transform"]) expect(strip[name]).toBeUndefined();
    const wrapper = ruleDecls(".cp-player-slot > .cp-hint:has(> .cp-detail-strip)");
    expect(wrapper["margin-left"]).toBeUndefined();
    expect(wrapper["width"]).toBe("auto");
    expect(wrapper["min-height"]).toBe("0");
  });
});

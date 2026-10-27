/**
 * P14, P23: New dig is one frameless pane on the panel tone, Artists and Labels are sections with a
 * divider between them (not cards), the dig bar is the between-tone, and the dig list has no frame.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import css from "./discover.css?raw";

const rules = parseRules(stripComments(css));
const body = (selector: string) =>
  rules.find((rule) => rule.selector.split(",").map((part) => part.trim()).includes(selector))?.body ?? "";

describe("New dig (P14)", () => {
  it("is one panel-tone pane with no frame", () => {
    expect(body(".discover-new")).toMatch(/background:\s*var\(--bg-panel\)/);
    expect(body(".discover-new")).not.toMatch(/border/);
  });

  it("lays Artists and Labels as sections with a divider between, not cards", () => {
    expect(body(".discover-new__scope")).toMatch(/background:\s*transparent/);
    expect(body(".discover-new__scope")).toMatch(/padding:\s*0/);
    expect(body(".discover-new__scope + .discover-new__scope")).toMatch(/border-top:\s*var\(--divider\)/);
  });

  it("sets the dig bar on the between-tone under a divider", () => {
    const bar = body(".discover-new__bar");
    expect(bar).toMatch(/background:\s*var\(--bg-between\)/);
    expect(bar).toMatch(/border-top:\s*var\(--divider\)/);
  });

  it("lifts the dig bar with the upward sticky shadow and keeps scrolled-to controls clear of it (M180)", () => {
    expect(body(".discover-new__bar")).toMatch(/box-shadow:[^;]*rgba\(0, 0, 0, 0\.6\)/);
    expect(body(".discover-new__body")).toMatch(/scroll-padding-bottom:/);
  });
});

describe("the dig list (P23)", () => {
  it("has no frame; the selected item keeps the selected-row look", () => {
    expect(body(".discover-runs__item")).toMatch(/border:\s*0/);
    expect(body(".discover-runs__item--selected")).toMatch(/background:\s*var\(--selected-row-background\)/);
  });
});

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

describe("New dig, round 3 (D20)", () => {
  it("is a centred block: the form, what to fix and the bar share one capped column (M181)", () => {
    const block = body(".discover-new__body > *");
    expect(block).toMatch(/max-width:\s*calc\(\d+px \* var\(--scale\)\)/);
    expect(block).toMatch(/margin-inline:\s*auto/);
  });

  it("keeps the bar under the content, sticky only when the form is longer than the pane (M181)", () => {
    expect(body(".discover-new__bar")).toMatch(/position:\s*sticky/);
    // No flex-grow spacer between the form and the bar.
    expect(body(".discover-new__body")).not.toMatch(/justify-content:\s*space-between/);
  });

  it("draws the day field with its native indicator hidden (M39, D7 B)", () => {
    expect(css).toMatch(/\.discover-date__input::-webkit-calendar-picker-indicator\s*\{[^}]*display:\s*none/);
    expect(body(".discover-date__input")).toMatch(/opacity:\s*0/);
  });

  it("makes New list… a quiet small button at the radios' label edge, not a link (M182, M184)", () => {
    expect(body(".discover-new__new-list")).toMatch(/margin-left:\s*calc\(var\(--check-size\)/);
    expect(css).not.toMatch(/\.discover-new__new-list[^{]*\{[^}]*color:\s*var\(--link/);
  });
});

describe("the dig list (P23)", () => {
  it("keeps the list to its card's width and the scrollbar off the cards (M186, M187)", () => {
    expect(body(".discover-runs-view")).toMatch(/min\(20%, calc\(300px \* var\(--scale\)\)\)/);
    expect(body(".discover-runs-view__list")).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it("draws the stopped line and Resume inside the card's tone, Resume at its own width (M187)", () => {
    const stopped = body(".discover-runs__stopped");
    expect(stopped).toMatch(/align-items:\s*flex-start/);
    expect(stopped).toMatch(/background:\s*var\(--bg-panel\)/);
  });

  it("has no frame; the selected item keeps the selected-row look", () => {
    expect(body(".discover-runs__item")).toMatch(/border:\s*0/);
    expect(body(".discover-runs__item--selected")).toMatch(/background:\s*var\(--selected-row-background\)/);
  });
});

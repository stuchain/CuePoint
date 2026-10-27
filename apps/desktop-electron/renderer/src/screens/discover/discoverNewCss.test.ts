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
  // Moved for M58 (D9 A): the pane is the ground, not one panel-tone pane, and has no frame.
  it("sits on the ground with no frame (M58)", () => {
    expect(body(".discover-new")).toMatch(/background:\s*transparent/);
    expect(body(".discover-new")).not.toMatch(/border/);
  });

  // Moved for M58 (D9 A): Genres, Artists, Labels and When are each a filled card, with no inner rules.
  it("makes each group a card on the ground, with no inner rules (M58)", () => {
    for (const group of [".discover-new__genres", ".discover-new__scope", ".discover-new__when"]) {
      expect(body(group), group).not.toMatch(/background|padding|border/);
    }
    expect(css).not.toMatch(/\.discover-new__scope\s*\+\s*\.discover-new__scope/);
    expect(body(".discover-new__column")).toMatch(/gap:\s*var\(--space-xl\)/);
  });

  it("sets the dig bar on the between-tone under a divider", () => {
    const bar = body(".discover-new__bar");
    expect(bar).toMatch(/background:\s*var\(--bg-between\)/);
    expect(bar).toMatch(/border-top:\s*var\(--divider\)/);
  });

  // Moved for M33: the bar's lift is one hard hairline mirrored upward, no soft shadow.
  it("sets the dig bar off with a hard hairline and keeps scrolled-to controls clear of it (M180, M33)", () => {
    expect(body(".discover-new__bar")).toMatch(/box-shadow:\s*0 calc\(-1 \* var\(--hairline\)\) 0 var\(--row-line\);/);
    expect(body(".discover-new__bar")).not.toMatch(/rgba/);
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
    // M182: less the quiet button's own inline padding, so the word "New" starts on the label edge.
    expect(body(".discover-new__new-list")).toContain("- (var(--space-sm) + var(--control-border-width))");
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

describe("the sounding row (N1, M99)", () => {
  it("has no tint of its own: the table's playing mark shows it, so pinned cells need no override", () => {
    // M99 removed the row's play button, so a rule keyed on `.cp-play-btn--playing` matched nothing,
    // and with N1's opaque pinned cells a row tint would stop at Title (M366: playing is no tint).
    expect(stripComments(css)).not.toMatch(/cp-play-btn--playing/);
  });
});

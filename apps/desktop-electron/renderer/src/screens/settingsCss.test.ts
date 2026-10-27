/**
 * Settings page layout rules the audit checked by eye: hints share the field column's right edge
 * (C51), the About card does not enlarge a hint (C59), and a section or its heading lands below the
 * sticky header with its top edge showing (C124).
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../test/cssRules";
import css from "./settings.css?raw";
import errorReportingCss from "./error-reporting-settings.css?raw";

const rules = parseRules(stripComments(css));

function body(selector: string): string {
  const rule = rules.find((r) => r.selector.split(",").map((s) => s.trim()).includes(selector));
  expect(rule, `a rule for ${selector}`).toBeDefined();
  return rule!.body;
}

describe("Settings page CSS", () => {
  it("stops a hint at the standard field width, the width of the select above it (C51)", () => {
    expect(body(".settings-note")).toMatch(/max-width:\s*var\(--field-width-standard\)/);
  });

  it("has one hint look: .settings-hint is retired for .cp-field__hint (M236)", () => {
    expect(rules.some((r) => r.selector.includes(".settings-hint"))).toBe(false);
  });

  it("does not let the About card's paragraph size reach a hint or a reason line (C59)", () => {
    expect(rules.some((r) => /\.settings-page__about p\s*$/.test(r.selector.trim()))).toBe(false);
    expect(body(".settings-page__about p:not(.settings-note):not(.cp-reason)")).toMatch(/font-size/);
  });

  it("lands a section and its heading a box's gap below the sticky header (C124)", () => {
    for (const selector of [".settings-page__section", ".settings-page__section h2", ".settings-page__section h3"]) {
      expect(body(selector)).toMatch(/scroll-margin-top:\s*calc\(var\(--screen-header-height, 0px\) \+ var\(--gap-box\)\)/);
    }
  });
});

describe("Settings without cards (P9, P17)", () => {
  it("lays the sections on the page with a divider and 16 above each, not in a card (P9)", () => {
    expect(body(".settings-page__sections")).toMatch(/gap:\s*0/);
    const between = body(".settings-page__section + .settings-page__section");
    expect(between).toMatch(/border-top:\s*var\(--divider\)/);
    expect(between).toMatch(/padding-top:\s*var\(--space-xl\)/);
    const card = body(".settings-page__section > .cp-card");
    expect(card).toMatch(/padding:\s*0/);
    expect(card).toMatch(/background:\s*transparent/);
  });

  it("draws a status line's state as a tinted pixel icon, not a round dot (M230, M34)", () => {
    expect(rules.some((r) => r.selector.trim() === ".settings-status::before")).toBe(false);
    expect(body(".settings-status__icon")).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(body(".settings-status--success .settings-status__icon")).toMatch(/color:\s*var\(--success-text\)/);
    expect(body(".settings-status--warning .settings-status__icon")).toMatch(/color:\s*var\(--warning-text\)/);
    expect(body(".settings-status--danger .settings-status__icon")).toMatch(/color:\s*var\(--danger-text\)/);
    expect(css).not.toMatch(/border-radius:\s*50%/);
  });

  it("keeps an all-good line quiet: only a problem colours the words (M325)", () => {
    expect(rules.some((r) => r.selector.trim() === ".settings-status--success")).toBe(false);
    expect(body(".settings-status--danger")).toMatch(/color:\s*var\(--danger-text\)/);
  });

  it("puts the icon on the first status line of a panel only (open question 5)", () => {
    expect(body(".settings-status ~ .settings-status .settings-status__icon")).toMatch(/display:\s*none/);
  });
});

describe("Settings layout (M226-M229)", () => {
  it("sticks the rail where a section's heading lands, so it does not move as the page scrolls (M228)", () => {
    expect(body(".settings-page__nav")).toMatch(/top:\s*calc\(var\(--screen-header-height, 0px\) \+ var\(--gap-box\)\)/);
  });

  it("marks the current link with text and a bar on the edge, no fill (M235, M59)", () => {
    const current = body(".settings-page__nav a[data-current]");
    expect(current).toMatch(/box-shadow:\s*inset/);
    expect(current).not.toMatch(/background/);
    expect(body(".settings-page__nav")).not.toMatch(/margin-inline-start/);
  });

  it("lets the sections reach the page edge: no reading-column cap on them (M229)", () => {
    expect(body(".settings-page__sections")).not.toMatch(/max-width/);
    // A status line keeps its measure, scaled with the text.
    expect(body(".settings-page__sections .settings-status")).toMatch(/max-width:\s*calc\(720px \* var\(--scale\)\)/);
  });

  it("centres a card head on a control-tall line, so every section's title sits alike (M227)", () => {
    const head = body(".settings-page__section .cp-card__head");
    expect(head).toMatch(/align-items:\s*center/);
    expect(head).toMatch(/min-height:\s*var\(--control-height\)/);
  });

  it("scrolls the sections in the page's own region, below the header (M225)", () => {
    expect(body(".app-main .screen.settings-page")).toMatch(/overflow:\s*hidden/);
    expect(body(".settings-page .screen-region")).toMatch(/--screen-header-height:\s*0px/);
  });

  it("draws the quit-clearing divider on a wrapper, never as the fieldset's border (M226)", () => {
    const errorRules = parseRules(stripComments(errorReportingCss));
    const wrapper = errorRules.find((r) => r.selector.trim() === ".cp-error-reporting__exit");
    expect(wrapper?.body).toMatch(/border-top:\s*var\(--divider\)/);
    const fieldset = errorRules.find((r) => r.selector.trim() === ".cp-error-reporting__exit > .cp-fieldset");
    expect(fieldset?.body).toMatch(/border:\s*0/);
  });
});

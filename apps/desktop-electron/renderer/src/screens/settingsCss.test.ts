/**
 * Settings page layout rules the audit checked by eye: hints share the field column's right edge
 * (C51), the About card does not enlarge a hint (C59), and a section or its heading lands below the
 * sticky header with its top edge showing (C124).
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../test/cssRules";
import css from "./settings.css?raw";

const rules = parseRules(stripComments(css));

function body(selector: string): string {
  const rule = rules.find((r) => r.selector.split(",").map((s) => s.trim()).includes(selector));
  expect(rule, `a rule for ${selector}`).toBeDefined();
  return rule!.body;
}

describe("Settings page CSS", () => {
  it("stops a hint at the standard field width, the width of the select above it (C51)", () => {
    expect(body(".settings-hint")).toMatch(/max-width:\s*var\(--field-width-standard\)/);
  });

  it("does not let the About card's paragraph size reach a hint or a reason line (C59)", () => {
    expect(rules.some((r) => /\.settings-page__about p\s*$/.test(r.selector.trim()))).toBe(false);
    expect(body(".settings-page__about p:not(.settings-hint):not(.cp-reason)")).toMatch(/font-size/);
  });

  it("lands a section and its heading a box's gap below the sticky header (C124)", () => {
    for (const selector of [".settings-page__section", ".settings-page__section h2", ".settings-page__section h3"]) {
      expect(body(selector)).toMatch(/scroll-margin-top:\s*calc\(var\(--screen-header-height, 0px\) \+ var\(--gap-box\)\)/);
    }
  });
});

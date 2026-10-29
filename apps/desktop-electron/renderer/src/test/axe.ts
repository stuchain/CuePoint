/**
 * The one axe check every renderer test shares (HARDEN-08, DEC-186): no violation at WCAG 2.2 A and AA.
 *
 * `expectNoAxeViolations()` scans `document.body` (so a dialog portalled out of the render container is
 * covered) unless an element is given. Two rules are off in jsdom runs only, and each has its cover:
 *  - `color-contrast`: jsdom computes no layout or paint, so axe cannot read a colour pair. Contrast is
 *    held by `tokens/themeContrast.test.ts` (every token pair in every theme) and by `e2e/a11y.spec.ts`
 *    (axe in a real renderer).
 *  - `region`: a component rendered alone has no landmarks around it, so "all content is in a landmark"
 *    would fail every fragment. The landmarks of the whole shell are scanned by `e2e/a11y.spec.ts`.
 * Nothing else is disabled.
 *
 * A violation that needs a design change beyond a label, a role, a colour or an order is not built
 * without the owner's go on a mockup. It is named in `known`, with the finding that records it in
 * `/mnt/project-files/phase18-hardening/a11y-findings.md`, and only that rule on only that selector is
 * left out. An entry that no longer matches anything fails the test, so a fix removes its entry.
 */
import { expect } from "vitest";
import { configureAxe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import type { AxeResults, RunOptions } from "axe-core";

import "vitest-axe/extend-expect";

expect.extend(axeMatchers);

/** The tags HARDEN-08 holds the app to: WCAG 2.2 level A and AA, with the 2.0 and 2.1 rules they build on. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

/** Rules axe cannot judge in jsdom (see the header). Jsdom runs only: the e2e scan runs every rule. */
export const JSDOM_DISABLED_RULES = ["color-contrast", "region"] as const;

/** One documented exception: this rule, on elements inside this selector, recorded as this finding. */
export interface KnownViolation {
  rule: string;
  /** Matches the element axe reports, or an ancestor of it. */
  selector: string;
  /** The id of the entry in a11y-findings.md. */
  finding: string;
}

export interface AxeCheck {
  /** Element to scan; the whole document body by default. */
  within?: Element;
  /** Documented exceptions (see the header). */
  known?: KnownViolation[];
}

export const axeOptions = (): RunOptions => ({
  runOnly: { type: "tag", values: [...WCAG_TAGS] },
  rules: Object.fromEntries(JSDOM_DISABLED_RULES.map((rule) => [rule, { enabled: false }])),
});

const run = configureAxe({});

function isKnown(rule: string, target: unknown, known: KnownViolation[]): KnownViolation | undefined {
  const selectors = Array.isArray(target) ? (target as unknown[]) : [target];
  const element = typeof selectors[0] === "string" ? document.querySelector(selectors[0]) : null;
  return known.find((k) => k.rule === rule && element?.closest(k.selector));
}

/** Fails with axe's own report (rule, element, fix) when anything under `within` breaks WCAG 2.2 A or AA. */
export async function expectNoAxeViolations({ within = document.body, known = [] }: AxeCheck = {}): Promise<void> {
  // axe measures icon-font ligatures on a canvas; jsdom has none and reports "not implemented" for each
  // call. A null context is what axe treats as "cannot measure", so the noise is silenced, not the rule.
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof original;
  let results: AxeResults;
  try {
    results = await run(within, axeOptions());
  } finally {
    HTMLCanvasElement.prototype.getContext = original;
  }
  const used = new Set<KnownViolation>();
  const violations = results.violations
    .map((violation) => ({
      ...violation,
      nodes: violation.nodes.filter((node) => {
        const hit = isKnown(violation.id, node.target, known);
        if (hit) used.add(hit);
        return !hit;
      }),
    }))
    .filter((violation) => violation.nodes.length > 0);
  expect({ ...results, violations }).toHaveNoViolations();
  const stale = known.filter((k) => !used.has(k));
  if (stale.length > 0) {
    throw new Error(
      `A known violation no longer occurs, delete its entry: ${stale.map((k) => `${k.finding} (${k.rule} on ${k.selector})`).join(", ")}`,
    );
  }
}

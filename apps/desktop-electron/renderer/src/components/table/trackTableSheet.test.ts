/**
 * The verification round's TrackTable sheet rules, read from the stylesheet source (the cascade a
 * jsdom render cannot resolve).
 */
import { describe, expect, it } from "vitest";

import css from "./TrackTable.css?raw";

/** Every rule whose selector list names `.track-table__cell--sticky`, as [selector, body]. */
function stickyRules(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const pattern = /([^{}]+)\{([^}]*)\}/g;
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(pattern)) {
    const selector = match[1]!.trim();
    if (selector.includes("track-table__cell--sticky")) out.push([selector, match[2]!]);
  }
  return out;
}

describe("N1: a pinned cell is never see-through", () => {
  it("gives every sticky cell an opaque fill of its own, never `inherit` or the translucent hover", () => {
    const rules = stickyRules().filter(([, body]) => /background\s*:/.test(body));
    expect(rules.length).toBeGreaterThan(0);
    for (const [selector, body] of rules) {
      const value = /background\s*:\s*([^;]+);/.exec(body)![1]!.trim();
      // --row-hover is `color-mix(… transparent)`; inherit takes it (or `none`) from the row.
      expect(value, selector).not.toMatch(/^(inherit|none|transparent)$|var\(--row-hover\)/);
    }
  });

  it("draws the base sticky cell on the table's ground", () => {
    const base = /\n\.track-table__cell--sticky \{([^}]*)\}/.exec(css)![1]!;
    expect(base).toMatch(/background:\s*var\(--bg-input\);/);
  });

  it("gives a hovered row's sticky cells the solid hover tone, and the keyboard row the ground", () => {
    expect(css).toMatch(
      /\.track-table__row:hover:not\(\.track-table__row--selected\) \.track-table__cell--sticky \{\s*background: var\(--row-hover-solid\);/,
    );
    expect(css).toMatch(
      /\.track-table__row--cursor:not\(\.track-table__row--selected\):hover \.track-table__cell--sticky \{\s*background: var\(--bg-input\);/,
    );
  });
});

describe("M100 and M118: Title keeps its x", () => {
  it("lets the speaker's room win over the cell's own padding (the mark rule is the more specific)", () => {
    expect(css).toMatch(/\.track-table__cell\.track-table__cell--mark,\s*\.track-table__header-cell--mark \{\s*padding-left: var\(--track-table-lead\);/);
  });

  it("gives the grip the same room as the speaker, so a Collection's Title starts where a playlist's does", () => {
    expect(css).toMatch(/--track-table-lead: calc\(var\(--space-xs\) \+ var\(--track-table-mark\) \+ var\(--space-xs\)\);/);
    expect(css).toMatch(/\.track-table__row--grip > \.track-table__cell:first-of-type \{\s*padding-left: var\(--track-table-lead\);/);
    expect(css).toMatch(/\[data-grip\] \.track-table__header-cell-wrap:first-child \.track-table__header-cell \{\s*padding-left: var\(--track-table-lead\);/);
  });

  it("sizes the speaker by the small icon token (M29)", () => {
    expect(css).toMatch(/--track-table-mark: var\(--icon-size-sm\);/);
  });
});

describe("M2 and M339: the heading", () => {
  it("is in the control weight with the arrow cursor", () => {
    const rule = /\n\.track-table__header-cell \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/font-weight: var\(--control-font-weight\);/);
    expect(rule).toMatch(/cursor: default;/);
  });
});

describe("M369: a stale answer's rows are dimmed", () => {
  it("greys the cells, which set their own colour, and after the base cell rule", () => {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const stale = /\n\.track-table\[data-stale\] \.track-table__cell \{([^}]*)\}/.exec(flat);
    expect(stale?.[1]).toMatch(/color:\s*var\(--fg-muted\);/);
    expect(flat).not.toMatch(/\.track-table\[data-stale\] \.track-table__row \{/);
    expect(flat.indexOf("\n.track-table__cell {")).toBeLessThan(stale!.index);
  });
});

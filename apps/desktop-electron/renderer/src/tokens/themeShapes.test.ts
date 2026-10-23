/**
 * P67: the themes carry the rules. A theme sheet changes colours and never shapes: the row hover, the
 * selected row, the chart ink, the divider, the row line, the scrollbar and the shadows are built once
 * in :root from the theme's colours, so a theme that set one of them would fork a rule.
 */
import { describe, expect, it } from "vitest";
import { THEMES } from "../test/themeFixtures";
import { stripComments } from "../test/cssRules";

/** Role and shape tokens a theme sheet must not set. */
const SHAPE_TOKENS =
  /^--(row-hover|selected-row-background|selected-bar-width|chart-bar[a-z-]*|divider[a-z-]*|row-line|scrollbar-[a-z-]+|shadow-[a-z-]+|resizer-hover|popover-border|notice-[a-z-]+)$/;

describe.each(Object.entries(THEMES))("the %s theme sheet", (name, css) => {
  const names = [...stripComments(css).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]!);

  it("sets colours only: no shape or role token", () => {
    expect(names.filter((token) => SHAPE_TOKENS.test(token)), name).toEqual([]);
  });

  it("sets at least the surface ladder, so the check above is reading something", () => {
    expect(names).toContain("--bg-app");
  });
});

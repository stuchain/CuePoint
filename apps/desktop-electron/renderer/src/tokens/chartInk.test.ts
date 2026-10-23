/**
 * P58, P60: one chart ink and one resize line, both tokens in :root so every theme resolves them.
 * The bars sit at 75% of the accent; the leader and a hovered bar are the full accent. A resize
 * handle is transparent until hover or drag, then draws a thin line at --selected-bar-width.
 */
import { describe, expect, it } from "vitest";
import tokens from "./tokens.css?raw";
import rankBar from "../components/charts/RankBar.css?raw";
import fitBar from "../components/charts/FitBar.css?raw";
import motion from "../motion.css?raw";
import { declarations, parseRules, stripComments } from "../test/cssRules";

const root = Object.fromEntries(
  parseRules(stripComments(tokens))
    .filter((rule) => rule.selector.trim() === ":root")
    .flatMap((rule) => declarations(rule.body)),
);

describe("the chart ink (P58)", () => {
  it("draws bars at 75% of the accent, the leader and a hovered bar in the full accent", () => {
    expect(root["--chart-bar"]).toBe("color-mix(in srgb, var(--accent-primary) 75%, transparent)");
    expect(root["--chart-bar-lead"]).toBe("var(--accent-primary)");
    expect(root["--chart-bar-hover"]).toBe("var(--accent-primary)");
    expect(root["--chart-bar-outline"]).toBe("transparent");
  });

  it("reads the lead colour in the rank bar", () => {
    expect(stripComments(rankBar)).toMatch(/\[data-lead\]\s*\{[^}]*var\(--chart-bar-lead/);
  });

  it("draws the fit bar's blocks 4 wide with a hairline gap, empty ones the muted text at 30%", () => {
    const css = stripComments(fitBar);
    expect(css).toMatch(/\.cp-fit-bar\s*\{[^}]*gap:\s*var\(--hairline\)/);
    expect(css).toMatch(/\.cp-fit-bar__block\s*\{[^}]*inline-size:\s*var\(--space-xs\)/);
    expect(css).toMatch(/color-mix\(in srgb, var\(--fg-muted\) 30%, transparent\)/);
  });
});

describe("the resize line (P60)", () => {
  it("is a gradient line the width of the selected bar in the accent", () => {
    expect(root["--resizer-hover"]).toMatch(/linear-gradient/);
    expect(root["--resizer-hover"]).toMatch(/var\(--selected-bar-width\)/);
    expect(root["--resizer-hover"]).toMatch(/var\(--accent-primary\)/);
  });

  it("is the accent, not the info colour, on a table column's stepped line", () => {
    const css = stripComments(motion);
    expect(css).toMatch(/\.track-table__col-resizer::after\s*\{[^}]*background:\s*var\(--accent-primary\)/);
    expect(css).not.toMatch(/\.track-table__col-resizer::after\s*\{[^}]*accent-info/);
  });
});

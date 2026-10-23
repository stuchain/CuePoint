/**
 * Round 4 details (P39 to P45), read from the sheets: the hint, the sticky shadow, the empty state,
 * the grips, the sort header, the loading line, the status strip and the offline banner.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../test/cssRules";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const body = (sheet: string, selector: string): string =>
  parseRules(stripComments(sheets[sheet] ?? ""))
    .filter((r) => r.selector.split(",").map((s) => s.trim().replace(/\s+/g, " ")).includes(selector))
    .map((r) => r.body)
    .join("\n");

describe("hint (P39)", () => {
  const tip = body("/src/components/Hint.css", ".cp-hint__tip");
  it("is a regular-weight control-face sentence, 4 by 8 padded, on the popover chrome", () => {
    expect(tip).toMatch(/font-weight:\s*var\(--font-weight-regular\)/);
    expect(tip).toMatch(/font-size:\s*var\(--control-font-size\)/);
    expect(tip).toMatch(/font-family:\s*var\(--font-control\)/);
    expect(tip).toMatch(/padding:\s*var\(--space-xs\) var\(--space-md\)/);
    expect(tip).toMatch(/box-shadow:\s*var\(--shadow-popover\)/);
    expect(tip).toMatch(/360px \* var\(--scale\)/);
  });
});

describe("sticky shadow (P40)", () => {
  it("defines the hairline plus a soft shadow once, in px that scale", () => {
    const tokens = stripComments(sheets["/src/tokens/tokens.css"] ?? "");
    const token = /--shadow-sticky:\s*([^;]+);/.exec(tokens)?.[1] ?? "";
    expect(token).toContain("var(--row-line)");
    expect(token).toMatch(/round\(nearest, calc\(6px \* var\(--scale\)\), 1px\)/);
    expect(token).toMatch(/round\(nearest, calc\(-6px \* var\(--scale\)\), 1px\)/);
  });

  it.each([
    ["/src/components/table/TrackTable.css", ".track-table__header"],
    ["/src/components/table/DataTable.css", ".cp-data-table thead th"],
    ["/src/components/shell/ScreenHeader.css", ".cp-screen-header"],
  ])("%s %s wears it, always", (sheet, selector) => {
    expect(body(sheet, selector)).toMatch(/box-shadow:\s*var\(--shadow-sticky\)/);
  });
});

describe("empty state (P41)", () => {
  it("starts 48 down, with a 24 icon and a 14 headline", () => {
    expect(body("/src/components/EmptyState.css", ".cp-empty-state:not(.cp-empty-state--compact)")).toMatch(
      /padding-top:\s*calc\(var\(--unit\) \* 12\)/,
    );
    expect(body("/src/components/EmptyState.css", ".cp-empty-state__icon .cp-pixel-icon")).toMatch(/width:\s*var\(--icon-size-lg\)/);
    expect(body("/src/components/EmptyState.css", ".cp-empty-state__headline")).toMatch(/font-size:\s*var\(--font-size-section\)/);
  });
});

describe("grips (P42)", () => {
  it.each([
    ["/src/components/table/TrackTable.css", ".track-table__grip", ".track-table__row:hover .track-table__grip"],
    ["/src/components/player/QueuePanel.css", ".cp-queue__grip", ".cp-queue__row:hover .cp-queue__grip"],
  ])("%s %s is 60%% of muted, full muted on row hover, never hidden", (sheet, grip, hover) => {
    expect(body(sheet, grip)).toMatch(/color:\s*color-mix\(in srgb, var\(--fg-muted\) 60%, transparent\)/);
    expect(body(sheet, hover)).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(body(sheet, grip)).not.toMatch(/display:\s*none|visibility|opacity/);
  });
});

describe("sort header (P43)", () => {
  const css = stripComments(sheets["/src/components/table/TrackTable.css"] ?? "");
  it("mutes the arrow and brightens the sorted or hovered heading, with aria-sort on the wrap", () => {
    expect(body("/src/components/table/TrackTable.css", ".track-table__sort")).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(css).toMatch(/\.track-table__header-cell-wrap:is\(\[aria-sort="ascending"\], \[aria-sort="descending"\]\)/);
    expect(css).toMatch(/\.track-table__header-cell-wrap:hover \.track-table__header-cell/);
  });
});

describe("loading (P44)", () => {
  it("is Inter at the control size, muted, centred", () => {
    const loading = body("/src/components/Loading.css", ".cp-loading");
    expect(loading).toMatch(/font-family:\s*var\(--font-control\)/);
    expect(loading).toMatch(/font-size:\s*var\(--control-font-size\)/);
    expect(loading).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(loading).toMatch(/justify-content:\s*center/);
  });
});

describe("status strip and offline banner (P45)", () => {
  it("sets the strip in Inter at the label size, muted, on the toolbar tone", () => {
    const strip = body("/src/components/shell/StatusStrip.css", ".cp-status");
    expect(strip).toMatch(/font-family:\s*var\(--font-data\)/);
    expect(strip).toMatch(/font-size:\s*var\(--font-size-label\)/);
    expect(strip).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(strip).toMatch(/background:\s*var\(--bg-toolbar\)/);
    expect(body("/src/components/shell/StatusStrip.css", ".cp-status__engine--ok")).toMatch(/color:\s*var\(--success-text\)/);
  });

  it("draws the offline banner as a notice: a danger bar over an 8% tint, no framed row", () => {
    const offline = body("/src/components/shell/OfflineBanner.css", ".cp-offline");
    expect(offline).toMatch(/border-left:\s*var\(--notice-bar-width\) solid var\(--accent-danger\)/);
    expect(offline).toMatch(/background:\s*color-mix\(in srgb, var\(--accent-danger\) var\(--notice-fill-mix\), var\(--bg-panel\)\)/);
    expect(offline).toMatch(/border:\s*0/);
    expect(offline).not.toMatch(/border-bottom/);
  });
});

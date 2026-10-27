/**
 * Prepare's stylesheet decisions that a DOM test cannot see (jsdom draws no layout): each is
 * read from the rule itself, so a later edit that drops one fails here.
 */
import { describe, expect, it } from "vitest";

import css from "./prepare.css?raw";

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\})\\s*(?:/\\*[\\s\\S]*?\\*/\\s*)*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css);
  expect(match, `a rule for ${selector}`).not.toBeNull();
  return match![1]!;
}

describe("the strips above the Set (C251, C49, C259)", () => {
  it("gives the lanes and the transition strip the same top padding, so the lanes' BPM is not clipped", () => {
    expect(rule(".prepare-lanes")).toMatch(/padding-top:\s*var\(--prepare-strip-pad\)/);
    expect(rule(".prepare-transition")).toMatch(/padding-top:\s*var\(--prepare-strip-pad\)/);
    // M80: the 2 px step is rounded to whole pixels, like every other scaled length.
    expect(rule(".prepare-set")).toMatch(/--prepare-strip-pad:\s*round\(nearest, calc\(2px \* var\(--scale\)\), 1px\)/);
  });

  it("lays a lane's name on one row in the control face, so it cannot be cut at the top (C251, M197)", () => {
    // The name and its range sat in a column that was taller than the lane at 1.25 and the top of
    // "BPM" was cut. On one row, centred, there is no such height to overflow.
    const name = rule(".prepare-lanes__name");
    expect(name).toMatch(/flex-direction:\s*row/);
    expect(name).toMatch(/align-items:\s*center/);
    expect(name).toMatch(/font-family:\s*var\(--font-control\)/);
    expect(name).not.toMatch(/overflow:\s*hidden/);
  });

  it("sets the Inserting line and the panel's notes as sentences, in Inter (D5, C55)", () => {
    expect(rule(".prepare-source__point")).toMatch(/font-family:\s*var\(--font-data\)/);
    expect(rule(".prepare-source__note")).toMatch(/font-family:\s*var\(--font-data\)/);
  });

  it("insets the right waveform by 8 at 1x (--space-md)", () => {
    expect(rule(".prepare-transition")).toMatch(/padding-right:\s*var\(--space-md\)/);
  });
});

describe("a chapter's band (C250)", () => {
  it("is the panel-tone band, its name in the voice face, with no row divider of its own, so it does not read as a data row (P18)", () => {
    const band = rule(".track-table__row.prepare-heading");
    // P18: the band is the panel tone (was panel-alt); its cells draw the row line.
    expect(band).toMatch(/background:\s*var\(--bg-panel\)/);
    expect(band).toMatch(/box-shadow:\s*none/);
    expect(rule(".track-table__row.prepare-heading > .track-table__cell")).toMatch(/var\(--row-line\)/);
    // The pixel face is the chapter's label only, not the whole row.
    expect(band).not.toMatch(/font-family/);
    expect(rule(".prepare-heading__name")).toMatch(/font-family:\s*var\(--font-voice\)/); // P2: the voice
  });
});

describe("the source panel and its divider (C48, C149, C28)", () => {
  it("has no padding of its own: a head one row high meets its line, the rest keeps --space-lg at the sides (M193)", () => {
    expect(rule(".prepare-source")).toMatch(/padding:\s*0;/);
    expect(rule(".prepare-source")).toMatch(/background:\s*var\(--bg-panel\)/);
    const head = rule(".prepare-source__head");
    expect(head).toMatch(/height:\s*var\(--row-height\)/);
    expect(head).toMatch(/border-bottom:\s*var\(--divider\)/);
    expect(rule(".prepare-source > :not(.prepare-source__head)")).toMatch(/margin-inline:\s*var\(--space-lg\)/);
  });

  it("keeps the Suggestions toolbar band inside the table's frame, never past it (item 7)", () => {
    const bar = rule(".prepare-source > .prepare-source__controls");
    // The panel's margin (not the bar's own padding) sets the edge, so the bar adds none.
    expect(bar).toMatch(/padding-inline:\s*0/);
    expect(bar).not.toMatch(/calc\(-1/);
  });

  it("ends the entry buttons left of the time columns when those come last (option 3A)", () => {
    expect(rule(".track-table__row > .track-table__end:has(> .prepare-row-buttons)")).toMatch(
      /margin-right:\s*var\(--entry-buttons-clear, 0px\)/,
    );
  });

  it("gives the entry buttons an end cell with a gap and a hairline edge, so the data they cover is cut cleanly (D21, M192)", () => {
    const end = rule(".track-table__row > .track-table__end:has(> .prepare-row-buttons)");
    expect(end).toMatch(/padding-inline-start:\s*var\(--space-lg\)/);
    expect(end).toMatch(/box-shadow:\s*inset var\(--hairline\) 0 0 0 var\(--row-line\)/);
    expect(end).not.toMatch(/background:\s*transparent/);
  });

  it("leaves the source panel's sub-tab slab as the shared one (D21, M191)", () => {
    expect(css).not.toMatch(/\.prepare-source\s+\.cp-tabs/);
  });

  it("colours the divider's hover with the shared resizer token", () => {
    const hover = /\.prepare-layout__divider:hover,[^{]*\{([^}]*)\}/.exec(css)![1]!;
    expect(hover).toMatch(/background:\s*var\(--resizer-hover\)/);
  });

  it("draws the divider as nothing until it is reached, and the lane names as labels (P8, P18)", () => {
    expect(rule(".prepare-layout__divider")).toMatch(/background:\s*transparent/);
    expect(rule(".prepare-lanes__name")).toMatch(/font-size:\s*var\(--font-size-label\)/);
    expect(rule(".prepare-lanes__name")).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(rule(".prepare-source__point")).toMatch(/color:\s*var\(--fg-muted\)/);
  });

  it("puts buttons in a row --space-md apart", () => {
    expect(rule(".prepare-source__sides")).toMatch(/gap:\s*var\(--space-md\)/);
  });
});

describe("round 3 (M46, M191, M333, M339, M80, M488)", () => {
  it("gives the source panel's fields the input tone, so they show on the panel (M46, D8 A)", () => {
    // The page ground's --field-fill is the panel tone (index.css); the panel is that tone itself.
    expect(rule(".prepare-source")).toMatch(/--field-fill:\s*var\(--bg-input\)/);
  });

  it("draws the source tabs' slab in the input tone and the picked part lighter than slab and ground (M191)", () => {
    expect(rule(".prepare-source__head .cp-tabs--sub")).toMatch(/background:\s*var\(--bg-input\)/);
    expect(rule(".prepare-source__head .cp-tabs--sub .cp-tabs__tab--active")).toMatch(/background:\s*var\(--bg-panel-alt\)/);
  });

  it("fills the drag chip with the accent and its own ink (M333)", () => {
    expect(rule(".drag-chip")).toMatch(/background:\s*var\(--accent-fill\)/);
    expect(rule(".drag-chip")).toMatch(/color:\s*var\(--fg-on-accent\)/);
  });

  it("uses the arrow pointer everywhere on the page (M339)", () => {
    expect(css).not.toMatch(/cursor:\s*pointer/);
  });

  it("rounds the small scaled lengths to whole pixels, and the Fit dot takes the label size (M80)", () => {
    expect(css).not.toMatch(/:\s*calc\((?:2|10|12)px \* var\(--scale\)\);/);
    expect(rule(".prepare-fit")).toMatch(/font-size:\s*var\(--font-size-label\)/);
  });

  it("has no visually-hidden rule of its own: the app's cp-visually-hidden serves (M488)", () => {
    expect(css).not.toMatch(/\.prepare-visually-hidden/);
  });
});

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
    expect(rule(".prepare-set")).toMatch(/--prepare-strip-pad:\s*calc\(2px \* var\(--scale\)\)/);
  });

  it("never cuts the top of the BPM name when its two lines are taller than the lane (C251)", () => {
    // At 1.25 the tempo lane is 20 px and "BPM" over its range is about 28: centred and clipped,
    // the top half of "BPM" was cut. Safe centring starts it at the top when it does not fit, and
    // the gap and the Key lane below leave room for the range.
    const name = rule(".prepare-lanes__name");
    expect(name).toMatch(/justify-content:\s*safe center/);
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
  it("is the panel-alt band in the pixel face with no row divider, so it does not read as a data row", () => {
    const band = rule(".track-table__row.prepare-heading");
    expect(band).toMatch(/background:\s*var\(--bg-panel-alt\)/);
    expect(band).toMatch(/box-shadow:\s*none/);
    // The pixel face is the chapter's label only, not the whole row.
    expect(band).not.toMatch(/font-family/);
    expect(rule(".prepare-heading__name")).toMatch(/font-family:\s*var\(--font-pixel\)/);
  });
});

describe("the source panel and its divider (C48, C149, C28)", () => {
  it("starts its content one --space-lg down in every state, level with the Set table's first row", () => {
    expect(rule(".prepare-source")).toMatch(/padding:\s*var\(--space-lg\) var\(--space-md\) var\(--space-md\)/);
  });

  it("keeps the Suggestions toolbar band inside the table's frame, never past it (item 7)", () => {
    const bar = rule(".prepare-source > .prepare-source__controls");
    expect(bar).toMatch(/margin-inline:\s*0/);
    expect(bar).not.toMatch(/calc\(-1/);
  });

  it("ends the entry buttons left of the time columns when those come last (option 3A)", () => {
    expect(rule(".track-table__row > .track-table__end:has(> .prepare-row-buttons)")).toMatch(
      /margin-right:\s*var\(--entry-buttons-clear, 0px\)/,
    );
  });

  it("colours the divider's hover with the shared resizer token", () => {
    const hover = /\.prepare-layout__divider:hover,[^{]*\{([^}]*)\}/.exec(css)![1]!;
    expect(hover).toMatch(/background:\s*var\(--resizer-hover\)/);
  });

  it("puts buttons in a row --space-md apart", () => {
    expect(rule(".prepare-source__sides")).toMatch(/gap:\s*var\(--space-md\)/);
    expect(rule(".prepare-heading__buttons")).toMatch(/gap:\s*var\(--space-md\)/);
  });
});

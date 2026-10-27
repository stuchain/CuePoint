import { describe, expect, it } from "vitest";
import css from "./TrackDetailPanel.css?raw";
import tsx from "./TrackDetailPanel.tsx?raw";
import section from "./DisclosureSection.tsx?raw";

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("Track details tabs share Overview's flat look (round 8)", () => {
  it("the Beatport tab has no framed box", () => {
    expect(rule(".cp-track-beatport")).not.toMatch(/border|padding|background/);
  });

  it("the Yours tab has no filled panel", () => {
    expect(rule(".cp-track-yours")).not.toMatch(/border|padding|background/);
  });

  it("has no action row: Play, Queue and Similar went with D16 (M122, M123)", () => {
    expect(css).not.toMatch(/cp-track-actions/);
    expect(tsx).not.toMatch(/cp-track-actions|Actions for this track/);
  });
});

describe("Track details sub-tabs (C260)", () => {
  it("are one strip as wide as the panel, its parts sharing the width, not a short squeezed box", () => {
    expect(rule(".cp-track-detail > .cp-tabs")).toMatch(/width:\s*100%/);
    expect(rule(".cp-track-detail > .cp-tabs")).not.toMatch(/gap/);
    expect(rule(".cp-track-detail > .cp-tabs .cp-tabs__tab")).toMatch(/flex:\s*1 1 auto/);
  });
});

describe("Track details chrome (round 3)", () => {
  it("gives the same room either side of the divider under the words (M64)", () => {
    const head = rule(".cp-track-detail .cp-track-detail__head");
    expect(head).toMatch(/padding-bottom:\s*var\(--space-lg\)/);
    // The column's gap (--space-md) and this margin make --space-lg above the tabs, not more.
    expect(head).toMatch(/margin-bottom:\s*calc\(var\(--space-lg\) - var\(--space-md\)\)/);
  });

  it("draws the folding section heads on the shared Disclosure, in the control face (M12, M60)", () => {
    expect(section).toMatch(/from "..\/..\/components\/Disclosure"/);
    expect(css).not.toMatch(/\.cp-track-section__(toggle|title|summary|chevron|heading)/);
  });

  it("gives every fact row at least a chip's height, so the Key row is no taller than BPM (M131)", () => {
    expect(css).toMatch(/\.cp-track-detail__facts \.cp-track-detail__factvalue \{[^}]*min-height:\s*var\(--chip-height\)/s);
  });

  it("insets the waveform by half a cue marker, so the last marker is not cut (M128)", () => {
    expect(rule(".cp-track-waveform")).toMatch(/padding-inline:\s*var\(--space-xs\)/);
  });
});

describe("Track details round 3 gap fixes (P3)", () => {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("draws the Yours labels in the label look: control face, label size, control weight, muted (M1)", () => {
    const label = rule(".cp-track-yours__label");
    expect(label).toMatch(/font-family:\s*var\(--font-control\)/);
    expect(label).toMatch(/font-size:\s*var\(--font-size-label\)/);
    expect(label).toMatch(/font-weight:\s*var\(--control-font-weight\)/);
    expect(label).toMatch(/color:\s*var\(--fg-muted\)/);
  });

  it("scales nothing to a fraction of a pixel: 2 px gaps are --space-2xs, the rest rounded (M80)", () => {
    const unrounded = plain.replace(/round\([a-z]+, calc\(\d+(?:\.\d+)?px \* var\(--scale\)\), 1px\)/g, "").match(/calc\(\d+(?:\.\d+)?px \* var\(--scale\)\)/g);
    expect(unrounded).toBeNull();
  });

  it("draws the history's writes bar in the write accent (M336)", () => {
    expect(rule(".cp-track-history__writes")).toMatch(/solid var\(--accent-write\)/);
  });

  it("shows no hand cursor anywhere in the panel (M339)", () => {
    expect(plain).not.toMatch(/cursor:\s*pointer/);
  });

  it("keeps a line of room for Saved, so it never moves the fields (M387)", () => {
    expect(rule(".cp-track-yours__state")).toMatch(/min-height:\s*1lh/);
  });

  it("makes each star a whole hit target (M477)", () => {
    const star = rule(".cp-track-yours__star");
    expect(star).toMatch(/min-inline-size:\s*var\(--hit-target\)/);
    expect(star).toMatch(/min-block-size:\s*var\(--hit-target\)/);
  });

  it("names its views for a screen reader and drops the … from a spoken name (M474, M405)", () => {
    expect(tsx).toMatch(/label="Track details views"/);
    expect(tsx).not.toMatch(/aria-label=\{`[^`]*…`\}/);
  });

  it("shows the file's name first and the whole path in its hint (M500)", () => {
    expect(tsx).toMatch(/displayPathNameFirst\(track\.file_path\)/);
    expect(tsx).toMatch(/displayPath\(track\.file_path, \{ keepHome: true \}\)/);
  });
});

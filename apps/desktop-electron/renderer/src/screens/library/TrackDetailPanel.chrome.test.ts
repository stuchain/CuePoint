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

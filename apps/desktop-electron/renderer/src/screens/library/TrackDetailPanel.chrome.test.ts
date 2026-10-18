import { describe, expect, it } from "vitest";
import css from "./TrackDetailPanel.css?raw";
import tsx from "./TrackDetailPanel.tsx?raw";

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

  it("Play, Queue and Similar are the standard Buttons in one row, not full-width outlines", () => {
    expect(css).not.toMatch(/cp-track-actions__button/);
    expect(tsx).not.toMatch(/cp-track-actions__button/);
    expect(rule(".cp-track-actions")).not.toMatch(/width:\s*100%/);
  });
});

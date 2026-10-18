/**
 * index.css draws the app's own checkbox, radio and fold arrow. jsdom has no layout, so these
 * hold the rules themselves: a percentage-sized ::before needs a definite grid track to resolve
 * against, and a native <summary> marker is replaced by the pixel chevron.
 */
import { describe, expect, it } from "vitest";
import { pixelRunsFor } from "./components/pixelIcons";
import css from "./index.css?raw";

function ruleBody(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, "m").exec(css);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1]!;
}

describe("checkbox and radio marks", () => {
  const box = ruleBody(':where(input[type="checkbox"], input[type="radio"])');

  it("gives the grid explicit tracks, so the percent-sized mark has a size to resolve against", () => {
    // `inline-grid` with auto tracks sizes the track to the (empty) content, and 100% / 40% of 0 is 0.
    expect(box).toMatch(/display:\s*inline-grid/);
    expect(box).toMatch(/grid-template(?:-columns)?:[^;]*100%/);
    expect(box).toMatch(/grid-template(?:-rows)?:[^;]*100%|grid-template:\s*100%\s*\/\s*100%/);
  });

  it("sizes the tick and the radio square as a share of that track", () => {
    expect(ruleBody(':where(input[type="checkbox"])::before')).toMatch(/width:\s*100%[\s\S]*height:\s*100%/);
    expect(ruleBody(':where(input[type="radio"])::before')).toMatch(/width:\s*40%[\s\S]*height:\s*40%/);
  });
});

describe("one fold arrow", () => {
  it("hides the native marker, WebKit's included", () => {
    expect(css).toMatch(/summary::-webkit-details-marker\s*\{[^}]*display:\s*none/);
    expect(ruleBody("summary")).toMatch(/list-style:\s*none/);
  });

  it("draws the chevron right when closed and down when open, from the PixelIcon art", () => {
    const path = (name: "chevron-right" | "chevron-down") =>
      pixelRunsFor(name)
        .map((r) => `M${r.x} ${r.y}h${r.width}v1h-${r.width}z`)
        .join("");
    const closed = ruleBody("details > summary::before");
    const open = ruleBody("details[open] > summary::before");
    expect(decodeURIComponent(/url\("([^"]*)"\)/.exec(closed)![1]!)).toContain(path("chevron-right"));
    expect(decodeURIComponent(/url\("([^"]*)"\)/.exec(open)![1]!)).toContain(path("chevron-down"));
    expect(closed).toMatch(/background:\s*currentColor/);
  });

  it("draws no second arrow in a summary that already holds a DisclosureArrow", () => {
    expect(ruleBody("details > summary:has(.cp-disclosure)::before")).toMatch(/display:\s*none/);
  });
});

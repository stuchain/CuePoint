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

  it("centres what is drawn in the box on both axes (D6)", () => {
    expect(box).toMatch(/place-items:\s*center/);
  });

  // P29: the box is one --check-size (14 at 1x), the tick is 60% of it and the radio dot is a round 50%
  // (this amends D6's 7px square dot).
  it("sizes the box as --check-size, the tick at 60% of the track and the radio dot round at 50% (P29)", () => {
    expect(box).toMatch(/width:\s*var\(--check-size\)/);
    expect(box).toMatch(/height:\s*var\(--check-size\)/);
    expect(ruleBody(':where(input[type="checkbox"])::before')).toMatch(/width:\s*60%[\s\S]*height:\s*60%/);
    const dot = ruleBody(':where(input[type="radio"])::before');
    expect(dot).toMatch(/width:\s*50%/);
    expect(dot).toMatch(/height:\s*50%/);
    expect(dot).toMatch(/border-radius:\s*50%/);
    expect(ruleBody(':where(input[type="radio"])')).toMatch(/border-radius:\s*50%/);
  });

  it("draws a selected radio as an --accent-primary dot in a 1px --accent-primary ring, and an unselected one in --border-control", () => {
    const checked = ruleBody(':where(input[type="radio"]):checked');
    expect(checked).toMatch(/color:\s*var\(--accent-primary\)/);
    expect(checked).toMatch(/border-color:\s*var\(--accent-primary\)/);
    expect(box).toMatch(/border:\s*var\(--hairline\)\s+solid\s+var\(--border-control\)/);
  });
});

describe("a checked radio keeps its own border on hover", () => {
  // Every selector here is wrapped in :where(), so none has any specificity and the later rule
  // wins. The radio's rule must come after the generic checked-hover rule, which paints --accent-fill.
  it("puts the radio's checked-hover rule after the checkbox-and-radio one", () => {
    const generic = css.indexOf(':where(input[type="checkbox"], input[type="radio"]):checked:hover:not(:disabled) {');
    const radio = css.indexOf(':where(input[type="radio"]):checked:hover:not(:disabled) {');
    expect(generic).toBeGreaterThan(-1);
    expect(radio).toBeGreaterThan(generic);
    expect(ruleBody(':where(input[type="radio"]):checked:hover:not(:disabled)')).toMatch(
      /border-color:\s*var\(--accent-primary\)/,
    );
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

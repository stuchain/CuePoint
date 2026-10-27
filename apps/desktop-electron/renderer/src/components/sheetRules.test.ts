/** G6 step 3 sweep: the individual rules the divider, focus, link and type-role sweep set. */
import { describe, expect, it } from "vitest";
import tokens from "../tokens/tokens.css?raw";
import layout from "../tokens/layout.css?raw";
import motionSettings from "../screens/motion-settings.css?raw";
import settings from "../screens/settings.css?raw";
import motion from "../motion.css?raw";
import card from "./Card.css?raw";
import emptyState from "./EmptyState.css?raw";
import inspector from "./shell/TrackInspector.css?raw";
import library from "../screens/library/library.css?raw";
import logViewer from "./LogViewerDialog.css?raw";
import cleanDialogs from "../screens/library/cleanDialogs.css?raw";
import rekordboxExport from "../screens/library/rekordboxExport.css?raw";
import prepare from "../screens/prepare/prepare.css?raw";
import credit from "../screens/library/CreditLinks.css?raw";
import privacy from "./PrivacyDialog.css?raw";
import tabs from "./Tabs.css?raw";

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} exists`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("type roles (T1, N2)", () => {
  it("sets the body to the body role", () => {
    expect(rule(tokens, "body")).toContain("font-size: var(--text-body);");
  });
  it("sets the statistics title to the heading role", () => {
    expect(rule(card, ".cp-card__title")).toContain("font-size: var(--font-size-section);");
  });
  it("gives both empty states the body role", () => {
    expect(rule(inspector, ".cp-inspector__empty")).toContain("font-size: var(--text-body);");
    // Round 3 (M18): the empty state's sentence is the body size too, like the rows around it.
    expect(rule(emptyState, ".cp-empty-state__description")).toContain("font-size: var(--text-body);");
  });
});

describe("one link colour (T13)", () => {
  it.each([
    ["library", library, ".library-screen__scope-link"],
    ["prepare", prepare, ".prepare-link"],
    ["credit", credit, ".cp-credit-link"],
    ["privacy", privacy, ".privacy-dialog__link"],
  ])("%s link uses --link", (_n, css, selector) => {
    expect(rule(css, selector)).toContain("color: var(--link);");
  });
});

describe("settings current section (T15)", () => {
  it("highlights the current link and never moves it (L5: was a sideways step with scroll motion)", () => {
    const current = rule(settings, ".settings-page__nav a[data-current]");
    expect(current).toContain("color: var(--fg-primary);");
    expect(current).toContain("background: var(--selected-row-background);");
    expect(motion).not.toMatch(/settings-page__nav a\[data-current\]\s*\{[^}]*transform/);
  });
});

describe("motion preview swatch (N1)", () => {
  it("is outlined at rest and fills only while playing", () => {
    const rest = rule(motionSettings, ".motion-settings__preview");
    expect(rest).toContain("border: var(--divider);");
    expect(rest).toContain("background: transparent;");
    // No static fill: data-play stays set after the first play, so the fill lives in the animation.
    expect(motionSettings).not.toMatch(/\.motion-settings__preview\[data-play\] \{/);
    expect(motionSettings).toMatch(/motion-preview-fill var\(--motion-slow\) var\(--motion-fade\) 1/);
    expect(motionSettings).toMatch(/\.motion-settings__preview::before \{[^}]*background: var\(--accent-primary\);[^}]*opacity: 0;/);
    expect(motionSettings).toMatch(/@keyframes motion-preview-fill \{[^}]*\{[^}]*opacity: 1;/);
  });
});

describe("frames (T2, N7)", () => {
  it("draws the classed fieldsets with the divider", () => {
    expect(rule(cleanDialogs, ".clean-dialog__group")).toContain("border: var(--divider);");
    expect(rule(rekordboxExport, ".rekordbox-export__choose")).toContain("border: var(--divider);");
  });
  it("has no stray colours in the log viewer or tabs", () => {
    expect(rule(logViewer, ".log-viewer-dialog__output")).not.toMatch(/rgba\(/);
    expect(tabs).not.toMatch(/rgba\(255, ?255, ?255/);
  });
});

describe("screen padding (N2-2, C41)", () => {
  it("is one page margin on every side, with no stepped padding and no media query", () => {
    expect(layout).not.toMatch(/@media/);
    expect(layout).not.toMatch(/--screen-padding/);
    // The four --safe-* are declared once on .screen. The bottom margin is the same 12px * scale
    // as the sides and the top (pageGutter.test.ts), on every page.
    expect(layout).toMatch(/\n\.screen \{[^}]*--safe-bottom: var\(--page-gutter-bottom\)/);
    expect(layout).toMatch(/\n\.screen \{[^}]*--safe-left: var\(--page-gutter-x\)/);
    expect(layout.match(/--safe-left:/g)).toHaveLength(1);
    expect(rule(layout, ":root")).not.toContain("--safe-");
  });

  it("writes every layout breakpoint as a container query in em, never px (C206)", () => {
    expect(layout).not.toMatch(/@container[^{]*\d+px/);
    expect(layout).toMatch(/Breakpoints \(C206\)/);
  });
});

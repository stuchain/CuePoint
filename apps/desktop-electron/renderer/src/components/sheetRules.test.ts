/** G6 step 3 sweep: the individual rules the divider, focus, link and type-role sweep set. */
import { describe, expect, it } from "vitest";
import tokens from "../tokens/tokens.css?raw";
import layout from "../tokens/layout.css?raw";
import motionSettings from "../screens/motion-settings.css?raw";
import settings from "../screens/settings.css?raw";
import motion from "../motion.css?raw";
import plays from "../screens/statistics/PlaysSection.css?raw";
import inspector from "./shell/TrackInspector.css?raw";
import library from "../screens/library/library.css?raw";
import logViewer from "./LogViewerDialog.css?raw";
import cleanDialogs from "../screens/library/cleanDialogs.css?raw";
import rekordboxExport from "../screens/library/rekordboxExport.css?raw";
import prepare from "../screens/prepare/prepare.css?raw";
import credit from "../screens/library/CreditLinks.css?raw";
import keys from "../screens/keys/keys.css?raw";
import privacy from "./PrivacyDialog.css?raw";
import errorReporting from "../screens/error-reporting-settings.css?raw";
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
    expect(rule(plays, ".plays__title")).toContain("font-size: var(--text-heading);");
  });
  it("gives both empty states the body role", () => {
    expect(rule(inspector, ".cp-inspector__empty")).toContain("font-size: var(--text-body);");
    expect(rule(library, ".library-screen__empty-state")).toContain("font-size: var(--text-body);");
  });
});

describe("one link colour (T13)", () => {
  it.each([
    ["library", library, ".library-screen__scope-link"],
    ["plays", plays, ".plays__link"],
    ["prepare", prepare, ".prepare-link"],
    ["credit", credit, ".cp-credit-link"],
    ["keys", keys, ".keys-link"],
    ["privacy", privacy, ".privacy-dialog__link"],
    ["error reporting", errorReporting, ".cp-error-reporting__link"],
  ])("%s link uses --link", (_n, css, selector) => {
    expect(rule(css, selector)).toContain("color: var(--link);");
  });
});

describe("settings current section (T15)", () => {
  it("highlights the current link without motion, and motion keeps only the slide", () => {
    const current = rule(settings, ".settings-page__nav a[data-current]");
    expect(current).toContain("color: var(--fg-primary);");
    expect(current).toContain("background: var(--selected-row-background);");
    const slide = rule(motion, ":root[data-motion-scroll] .settings-page__nav a[data-current]");
    expect(slide).toContain("transform:");
    expect(slide).not.toContain("color:");
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

describe("screen padding (N2-2)", () => {
  it("steps down by the content region's width, not the window's", () => {
    expect(layout).not.toMatch(/@media/);
    expect(layout).toMatch(
      /@container content \(max-width: 900px\) \{\s*\.screen \{[^}]*--screen-padding: var\(--space-lg\)/,
    );
    expect(layout).toMatch(
      /@container content \(max-width: 600px\) \{\s*\.screen \{[^}]*--screen-padding: var\(--space-md\)/,
    );
    // The four --safe-* are declared once on .screen; the queries set only --screen-padding.
    // The sides and the top are the page margin (pageGutter.test.ts); the bottom is the stepped padding.
    expect(layout).toMatch(/\n\.screen \{[^}]*--safe-bottom: var\(--screen-padding\)/);
    expect(layout).toMatch(/\n\.screen \{[^}]*--safe-left: var\(--page-gutter-x\)/);
    expect(layout.match(/--safe-left:/g)).toHaveLength(1);
    expect(rule(layout, ":root")).not.toContain("--safe-");
  });
});

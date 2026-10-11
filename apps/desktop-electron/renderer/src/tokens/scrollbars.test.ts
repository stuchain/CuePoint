/**
 * One themed scrollbar for the whole app. Since Chromium 121 an element with the standard
 * `scrollbar-color` or `scrollbar-width` (or one inheriting `scrollbar-color`) ignores every
 * `::-webkit-scrollbar*` rule, so a single component setting them quietly brings the system's
 * grey bar back. This reads the stylesheets as text: a small parser, not a browser.
 */
import { describe, expect, it } from "vitest";
import { declarations, parseRules, selectorList, stripComments } from "../test/cssRules";

const STYLESHEETS = import.meta.glob<string>("../**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

const SCROLLBARS = Object.entries(STYLESHEETS).find(([file]) => file.endsWith("/scrollbars.css"));
const rules = parseRules(stripComments(SCROLLBARS?.[1] ?? ""));

function decls(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (selectorList(rule.selector).includes(selector)) {
      for (const [name, value] of declarations(rule.body)) out[name] = value;
    }
  }
  return out;
}

describe("themed scrollbar", () => {
  it("no stylesheet sets scrollbar-color or a scrollbar-width other than none", () => {
    const offenders: string[] = [];
    for (const [file, css] of Object.entries(STYLESHEETS)) {
      for (const rule of parseRules(stripComments(css))) {
        for (const [name, value] of declarations(rule.body)) {
          if (name === "scrollbar-color") offenders.push(`${file}: ${rule.selector} { ${name}: ${value} }`);
          if (name === "scrollbar-width" && value !== "none") {
            offenders.push(`${file}: ${rule.selector} { ${name}: ${value} }`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each([
    "*::-webkit-scrollbar",
    "*::-webkit-scrollbar-track",
    "*::-webkit-scrollbar-thumb",
    "*::-webkit-scrollbar-thumb:hover",
    "*::-webkit-scrollbar-thumb:active",
    "*::-webkit-scrollbar-corner",
  ])("has a global %s rule", (selector) => {
    expect(Object.keys(decls(selector)).length).toBeGreaterThan(0);
  });

  it("colours the bar with theme tokens only", () => {
    const colourDecls = rules.flatMap((rule) =>
      declarations(rule.body).filter(([name]) => /^(background|background-color|border|border-color)$/.test(name)),
    );
    expect(colourDecls.length).toBeGreaterThan(0);
    for (const [name, value] of colourDecls) {
      expect(value, name).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    }
    for (const selector of ["*::-webkit-scrollbar-track", "*::-webkit-scrollbar-thumb", "*::-webkit-scrollbar-thumb:hover", "*::-webkit-scrollbar-thumb:active"]) {
      expect(decls(selector).background, selector).toMatch(/^var\(--[\w-]+\)$/);
    }
  });

  it("hides the arrow buttons and keeps the thumb grabbable", () => {
    expect(decls("*::-webkit-scrollbar-button").display).toBe("none");
    expect(decls("*::-webkit-scrollbar-thumb")["min-height"]).toContain("var(--scale)");
  });
});

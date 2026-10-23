/**
 * C2 / T6 guard: nothing is greyed by opacity. A disabled control (`:disabled`, `[aria-disabled]`)
 * is drawn in `--fg-disabled` on the quiet panel look and keeps full opacity, so the text keeps
 * its contrast and a disabled control never looks like a fading one.
 */
import { describe, expect, it } from "vitest";
import { parseRules, selectorList, stripComments } from "../test/cssRules";
import button from "./Button.css?raw";
import playButton from "./PlayButton.css?raw";
import searchField from "./SearchField.css?raw";
import select from "./Select.css?raw";
import textField from "./TextField.css?raw";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const DISABLED_SELECTOR = /:disabled|\[aria-disabled|\[disabled|:is\(\[disabled\]/;

function offenders(css: string): string[] {
  return parseRules(stripComments(css))
    .filter((rule) => selectorList(rule.selector).some((s) => DISABLED_SELECTOR.test(s)))
    .filter((rule) => /(^|[;\s])opacity\s*:/.test(rule.body))
    .map((rule) => rule.selector.replace(/\s+/g, " ").slice(0, 80));
}

describe("disabled look guard (C2)", () => {
  it("has no opacity inside a disabled rule", () => {
    const bad = Object.entries(sheets).flatMap(([path, css]) =>
      offenders(css).map((selector) => `${path.replace(/^\/src\//, "")}: ${selector}`),
    );
    expect(bad).toEqual([]);
    expect(Object.keys(sheets).length).toBeGreaterThan(40);
  });

  it("still sees an opacity in a disabled rule", () => {
    expect(offenders('a[aria-disabled="true"] { opacity: .5; }')).toHaveLength(1);
    expect(offenders("button:disabled { opacity: .5; }")).toHaveLength(1);
    expect(offenders("button:disabled { color: gray; }")).toHaveLength(0);
    expect(offenders(".fade { opacity: .5; }")).toHaveLength(0);
  });
});

describe("one disabled look for every control (C2)", () => {
  const controls: Array<[string, string]> = [
    ["Button", button],
    ["TextField", textField],
    ["SearchField", searchField],
    ["Select", select],
    ["PlayButton", playButton],
  ];

  it.each(controls)("%s greys :disabled and [aria-disabled] with --fg-disabled and a default cursor", (_name, css) => {
    const rules = parseRules(stripComments(css)).filter((r) => /color:\s*var\(--fg-disabled\)/.test(r.body));
    const forDisabled = rules.some((r) => /:disabled/.test(r.selector));
    const forAria = rules.some((r) => /\[aria-disabled="true"\]/.test(r.selector));
    expect(forDisabled, ":disabled is greyed").toBe(true);
    expect(forAria, "[aria-disabled] is greyed").toBe(true);
    const cursor = parseRules(stripComments(css)).filter((r) => /:disabled|aria-disabled/.test(r.selector) && /cursor/.test(r.body));
    for (const rule of cursor) expect(rule.body).toMatch(/cursor:\s*default/);
  });

  it.each(controls)("%s changes nothing on hover or press of a disabled control", (_name, css) => {
    const hoverRules = parseRules(stripComments(css)).filter((r) => /:hover|:active/.test(r.selector) && !/--quiet|clear|--playing/.test(r.selector));
    for (const rule of hoverRules) {
      expect(rule.selector, rule.selector).toMatch(/:not\(:disabled\)|:not\(:disabled\):/);
    }
  });
});

// P38: a disabled control keeps its shape in a faint line and grey words. The one exception to
// "words are --fg-disabled" is the disabled primary, whose fill and words are colour mixes of the
// accent (T6: greyed by colour, never by opacity). Nothing else may state its own disabled colour.
describe("disabled colours (P38)", () => {
  const rules = parseRules(stripComments(button)).filter((r) => selectorList(r.selector).some((s) => /:disabled|\[aria-disabled/.test(s)));

  it("greys every secondary, quiet, write and danger button the same way: transparent, the faint line, grey words", () => {
    const base = rules.find((r) => /^\.cp-btn:disabled/.test(r.selector.trim()));
    expect(base?.body).toMatch(/background:\s*transparent/);
    expect(base?.body).toMatch(/border-color:\s*var\(--border-disabled\)/);
    expect(base?.body).toMatch(/color:\s*var\(--fg-disabled\)/);
  });

  it("allows one exception: the disabled primary is an accent mix on the panel, with mixed words", () => {
    const exceptions = rules.filter((r) => /color:\s*color-mix\(/.test(r.body.replace(/background:[^;]*;/g, "").replace(/border-color:[^;]*;/g, "")));
    expect(exceptions).toHaveLength(1);
    const primary = exceptions[0]!;
    expect(primary.selector).toContain(".cp-btn--primary:disabled");
    expect(primary.body).toMatch(/background:\s*color-mix\(in srgb, var\(--accent-fill\) 22%, var\(--bg-panel\)\)/);
    expect(primary.body).toMatch(/color:\s*color-mix\(in srgb, var\(--fg-on-accent\) 55%, var\(--bg-panel\)\)/);
    expect(primary.body).not.toMatch(/opacity/);
  });

  it("defines the faint line as the control line at 60%, once", () => {
    const tokens = stripComments(sheets["/src/tokens/tokens.css"] ?? "");
    expect(tokens).toMatch(/--border-disabled:\s*color-mix\(in srgb, var\(--border-control\) 60%, transparent\)/);
  });

  it.each([["TextField", textField], ["Select", select], ["SearchField", searchField]])(
    "%s follows the secondary rule when disabled: transparent with the faint line",
    (_name, css) => {
      const disabled = parseRules(stripComments(css)).filter(
        (r) => /:disabled/.test(r.selector) && /color:\s*var\(--fg-disabled\)/.test(r.body) && /border-color/.test(r.body),
      );
      expect(disabled.length).toBeGreaterThan(0);
      for (const rule of disabled) {
        expect(rule.body).toMatch(/background:\s*transparent/);
        expect(rule.body).toMatch(/border-color:\s*var\(--border-disabled\)/);
      }
    },
  );
});


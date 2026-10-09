import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The site's motion: crisp, fast, answered. These read the stylesheets themselves;
 * e2e/inner-pages.spec.ts checks what the browser does with them.
 */
const css = readFileSync(new URL("./global.css", import.meta.url), "utf8");
const button = readFileSync(new URL("../components/Button.astro", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/Header.astro", import.meta.url), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");

/** The body of the block that starts with `head` (balanced braces). */
function block(source: string, head: string): string {
  const start = source.indexOf(head);
  if (start === -1) throw new Error(`no ${head}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${head}`);
}
/** Every duration in a declaration list, in ms. */
const durations = (s: string) => [...s.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map((m) => Number(m[1]) * (m[2] === "s" ? 1000 : 1));

describe("motion", () => {
  it("pages cross-fade with the browser's own view transition, about 200 ms, and the header stays still", () => {
    expect(flat(css)).toMatch(/@view-transition \{ navigation: auto; \}/);
    expect(flat(block(css, "::view-transition-old(root)"))).toContain("animation-duration: 200ms");
    expect(flat(block(css, "::view-transition-group(site-header)"))).toContain("animation: none");
    expect(header).toContain("view-transition-name: site-header");
  });

  it("reduced motion turns the page transition off, and every transition and reveal with it", () => {
    const reduced = flat(block(css, "@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/@view-transition \{ navigation: none; \}/);
    expect(reduced).toContain("transition: none !important");
    expect(reduced).toMatch(/\[data-reveal\] \{ opacity: 1 !important; translate: none !important; \}/);
    const reducedButton = flat(block(button, "@media (prefers-reduced-motion: reduce)"));
    expect(reducedButton).toMatch(/\.btn:hover \{ translate: none; \}/);
  });

  it("a text link answers the pointer with a pixel bar stepping in from the left, in 150 ms or less", () => {
    const link = flat(block(css, ":where(a:not([class])) {"));
    expect(link).toContain("background-position: 0 100%");
    expect(link).toContain("background-size: 0 var(--border-width)");
    expect(link).toMatch(/background-size \d+ms steps\(/);
    for (const d of durations(link)) expect(d).toBeLessThanOrEqual(150);
    expect(flat(block(css, ":where(a:not([class])):hover"))).toContain("background-size: 100% var(--border-width)");
  });

  it("a button lifts 2px with a bigger shadow on hover and presses down with no shadow, in steps, fast", () => {
    const transition = flat(block(button, "  .btn {\n    transition"));
    expect(transition).toMatch(/steps\(/);
    for (const d of durations(transition)) expect(d).toBeLessThanOrEqual(150);
    expect(transition).toContain("var(--motion-quick)");
    const hover = flat(block(button, ".btn:hover {"));
    expect(hover).toContain("translate: -2px -2px");
    expect(hover).toContain("4px 4px 0");
    const active = flat(block(button, ".btn:active {"));
    expect(active).toContain("translate: 2px 2px");
    expect(active).toContain("--shadow-bevel-pressed");
    expect(active).not.toContain("--shadow-badge");
  });

  it("every interactive element keeps a visible focus ring", () => {
    const focus = flat(block(css, ":focus-visible {"));
    expect(focus).toContain("outline: var(--focus-ring-width) solid var(--accent-primary)");
  });
});

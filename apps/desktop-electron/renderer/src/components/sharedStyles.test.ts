/**
 * The consistency build's style rules, held by a test (areas 1, 4, 5, 10, 11, 22, 53): the
 * spacing and icon tokens, the one focus ring, the one link, the text roles, no opacity on a
 * control, no hover nudge, and no native `title=` tooltip in a component.
 */
import { describe, expect, it } from "vitest";
import { declarations, parseRules, selectorList, stripComments } from "../test/cssRules";

import indexCss from "../index.css?raw";
import motionCss from "../motion.css?raw";
import tokens from "../tokens/tokens.css?raw";

const sheets = import.meta.glob("./**/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const sources = import.meta.glob(["./**/*.tsx", "!./**/*.test.tsx", "!./**/*.stories.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function rootDecl(css: string, name: string): string | undefined {
  for (const rule of parseRules(stripComments(css))) {
    if (!selectorList(rule.selector).includes(":root")) continue;
    for (const [prop, value] of declarations(rule.body)) if (prop === name) return value;
  }
  return undefined;
}

describe("the spacing scale (area 'spacing')", () => {
  it("adds 2xs and 2xl to xs, sm, md, lg and xl", () => {
    for (const step of ["2xs", "xs", "sm", "md", "lg", "xl", "2xl"]) {
      expect(rootDecl(tokens, `--space-${step}`), step).toBeDefined();
    }
    expect(rootDecl(tokens, "--space-2xl")).toBe("calc(var(--unit) * 6)");
  });

  it("never lets the smallest step fall under one pixel", () => {
    expect(rootDecl(tokens, "--space-2xs")).toMatch(/^max\(1px,/);
  });

  it("has a toolbar 32 high with 6 x 8 padding", () => {
    expect(rootDecl(tokens, "--toolbar-height")).toContain("32px");
    expect(rootDecl(tokens, "--toolbar-padding")).toContain("6px");
    expect(rootDecl(tokens, "--toolbar-padding")).toContain("var(--space-md)");
  });
});

describe("pixel icons come in two sizes (area 10, M28)", () => {
  it("has sm and lg, each a whole multiple of the 12-unit grid, and md only as an alias of lg", () => {
    expect(rootDecl(tokens, "--icon-size-sm")).toContain("16px");
    expect(rootDecl(tokens, "--icon-size-lg")).toContain("24px");
    for (const size of ["sm", "lg"]) expect(rootDecl(tokens, `--icon-size-${size}`)).toContain("12px)");
    expect(rootDecl(tokens, "--icon-size-md")).toBe("var(--icon-size-lg)");
    expect(rootDecl(tokens, "--icon-size")).toBe("var(--icon-size-lg)");
  });

  it("scales them pixelated, and no component draws an icon at 0.6 or 14.4", () => {
    expect(sheets["./PixelIcon.css"]).toMatch(/image-rendering:\s*pixelated/);
    for (const [file, css] of Object.entries(sheets)) {
      // The one exception, picked by eye (10-20): the sidebar Search field's magnifier at three quarters.
      const checked = file.endsWith("shell/Sidebar.css") ? css.replaceAll("calc(var(--icon-size) * 0.75)", "") : css;
      expect(checked, file).not.toMatch(/--icon-size\)\s*\*\s*0?\.[0-46-9]/);
      expect(css, file).not.toContain("14.4");
    }
  });
});

describe("one focus ring (area 22)", () => {
  it("is declared once for every focusable control, with no specificity of its own", () => {
    const rule = parseRules(stripComments(indexCss)).find((r) => r.selector === ":where(:focus-visible)");
    expect(rule, ":where(:focus-visible)").toBeDefined();
    const decls = Object.fromEntries(declarations(rule!.body));
    expect(decls["outline"]).toBe("var(--focus-ring-width) solid var(--focus-ring)");
    expect(decls["outline-offset"]).toBe("var(--focus-ring-offset)");
  });

  it("uses one offset in every component, inside the box only where a clipping parent needs it", () => {
    for (const [file, css] of Object.entries(sheets)) {
      for (const match of stripComments(css).matchAll(/outline-offset\s*:\s*([^;}]+)/g)) {
        // The table's keyboard row is a dashed line one ring in from its edge, so it shows on a selected row.
        // A filled button keeps its ring off its own fill (round 3, P2): --focus-ring-offset-filled.
        expect(["var(--focus-ring-offset)", "var(--focus-ring-offset-inset)", "var(--focus-ring-offset-filled)", "calc(-2 * var(--focus-ring-width))"], `${file}: ${match[1]}`).toContain(
          match[1]!.trim(),
        );
      }
    }
  });
});

describe("one link (area 5)", () => {
  it("is the --link colour, underlined on hover and focus only", () => {
    const link = parseRules(stripComments(indexCss)).find((r) => r.selector === ".cp-link")!;
    const decls = Object.fromEntries(declarations(link.body));
    expect(decls["color"]).toBe("var(--link)");
    expect(decls["text-decoration"]).toBe("none");
    const hover = parseRules(stripComments(indexCss)).find((r) => r.selector.startsWith(".cp-link:hover"))!;
    expect(declarations(hover.body)).toContainEqual(["text-decoration", "underline"]);
  });
});

describe("text roles and the one legend (area 4)", () => {
  it("has page 24, dialog 18, section 14 and label 10.5 medium muted (P2)", () => {
    // P47 with answer 1 (23 Oct 2026): the page title is 22 and the dialog title 16, each rounded to a whole pixel.
    expect(rootDecl(tokens, "--font-size-page")).toBe("round(nearest, calc(22px * var(--scale)), 1px)");
    expect(rootDecl(tokens, "--font-size-dialog")).toBe("round(nearest, calc(16px * var(--scale)), 1px)");
    expect(rootDecl(tokens, "--font-size-section")).toBe("var(--font-size-md)");
    // P2: 10.5 rounded to the nearest pixel like every data size (M27).
    expect(rootDecl(tokens, "--font-size-label")).toBe("round(nearest, calc(10.5px * var(--scale)), 1px)");
    expect(rootDecl(tokens, "--font-size-chip")).toBe("var(--font-size-label)");
    expect(rootDecl(tokens, "--weight-strong")).toBe("var(--font-weight-bold)");
    expect(rootDecl(tokens, "--font-weight-bold")).toBe("700");
    const label = parseRules(stripComments(indexCss)).find((r) => r.selector === ".cp-text-label")!;
    expect(Object.fromEntries(declarations(label.body))).toMatchObject({
      "font-weight": "var(--control-font-weight)", // round 3 (M19, P2): the control face at its weight
      "font-family": "var(--font-control)",
      color: "var(--fg-muted)",
    });
  });

  it("draws every legend as the label role", () => {
    const legend = parseRules(stripComments(indexCss)).find((r) => selectorList(r.selector).includes("legend"))!;
    expect(Object.fromEntries(declarations(legend.body))).toMatchObject({
      "font-size": "var(--font-size-label)",
      "font-weight": "var(--control-font-weight)", // round 3 (M19, P2): the label role, in the control face
      "font-family": "var(--font-control)",
      color: "var(--fg-muted)",
    });
  });

  it("uses no weight but the named ones in a component", () => {
    for (const [file, css] of Object.entries(sheets)) {
      for (const match of stripComments(css).matchAll(/font-weight\s*:\s*([^;}]+)/g)) {
        expect([
            "var(--font-weight-bold)",
            "var(--font-weight-regular)",
            "var(--font-weight-medium)",
            "var(--font-weight-semibold)",
            "var(--weight-strong)",
            "var(--weight-normal)",
            "var(--control-font-weight)",
            "inherit",
          ], `${file}: ${match[1]}`).toContain(
          match[1]!.trim(),
        );
      }
    }
  });
});

describe("greyed means unavailable, by colour (area 11)", () => {
  /** Components whose opacity is not a control's state: a transparent overlay, a paused picture, a
   *  loading line that holds its room unseen for its first 300 ms (M371). */
  const NOT_A_STATE = new Set(["./player/PlayerBar.css", "./waveform/WaveformDetailStrip.css", "./charts/PixelBars.css", "./Loading.css"]);

  it("dims no control with opacity", () => {
    const found: string[] = [];
    for (const [file, css] of Object.entries(sheets)) {
      if (NOT_A_STATE.has(file)) continue;
      for (const rule of parseRules(stripComments(css))) {
        if (rule.selector.startsWith("@")) continue;
        if (declarations(rule.body).some(([prop]) => prop === "opacity")) found.push(`${file}: ${rule.selector}`);
      }
    }
    expect(found).toEqual([]);
  });
});

describe("no hover nudge and one panel motion (area 53)", () => {
  it("moves no button, sidebar entry or Settings link when the pointer is over it", () => {
    for (const rule of parseRules(stripComments(motionCss))) {
      if (!rule.selector.includes(":hover")) continue;
      if (rule.selector.includes(".track-table__row") || rule.selector.includes("col-resizer")) continue;
      expect(declarations(rule.body).some(([prop]) => prop === "transform"), rule.selector).toBe(false);
    }
  });

  it("slides every side panel in the same way and fades every popover in the same way", () => {
    const side = parseRules(stripComments(motionCss)).find((r) => r.selector.includes(".cp-inspector[data-entering]"))!;
    expect(side.selector).toContain(".cp-queue");
    expect(side.selector).toContain(".cp-inspector[data-entering]");
    expect(side.body).toMatch(/cp-from-edge/);
    const popover = parseRules(stripComments(motionCss)).find((r) => r.selector.includes(".cp-popover"))!;
    expect(popover.selector).toContain(".cp-wheel-pop");
    expect(popover.selector).toContain(".cp-track-menu");
    expect(popover.body).toMatch(/cp-drop-in/);
    expect(popover.body).toMatch(/cp-fade-in/);
  });
});

describe("the app hint, not a native tooltip (area 27)", () => {
  /** Where a native `title` stays: a clipped wedge or a per-row chip that cannot take a wrapper. */
  const KEPT = new Set(["./wheel/CamelotWheel.tsx", "./wheel/KeyChip.tsx", "./Hint.tsx"]);

  it("sets no title on an element in a component, outside the named exceptions", () => {
    const found: string[] = [];
    for (const [file, source] of Object.entries(sources)) {
      if (KEPT.has(file)) continue;
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
      // title={...} on a DOM element: a component's `title` prop (Modal, Panel, SaveToFilesDialog) is a heading.
      for (const match of code.matchAll(/<(span|div|button|a|p|li|svg|img|label|section|input)\b[^>]*\stitle=/g)) {
        found.push(`${file}: ${match[0].slice(0, 60)}`);
      }
    }
    expect(found).toEqual([]);
  });
});

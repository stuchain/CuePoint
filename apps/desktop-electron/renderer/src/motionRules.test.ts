/**
 * The two rules every motion obeys (DEC-134, PAGES-02), held by a test rather
 * than by review: it is gated on a `[data-motion-*]` attribute, and it animates
 * only `transform` and `opacity`. The check reads the renderer's CSS as text (`import.meta.glob`)
 * and parses declarations, not words: `prepare.css` has class names containing
 * "transition". Motion written in TypeScript escapes it (PAGES-12 adds that scan).
 */
import { describe, expect, it } from "vitest";

/** Every stylesheet under `src`, as text, by path. */
const STYLESHEETS = import.meta.glob<string>("./**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});
const ALLOWED_PROPERTIES = new Set(["transform", "opacity"]);

interface Rule {
  selector: string;
  body: string;
  /** The at-rule the rule sits inside, if any: "@media (...)". */
  context: string;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Splits CSS into rules, descending into @media/@supports; @keyframes come back whole. */
function parseRules(css: string, context = ""): Rule[] {
  const rules: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (/^@(media|supports|layer|container)/i.test(prelude)) {
      rules.push(...parseRules(body, prelude));
    } else {
      rules.push({ selector: prelude, body, context });
    }
    i = j;
  }
  return rules;
}

function declarations(body: string): [string, string][] {
  return body
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const colon = d.indexOf(":");
      return [d.slice(0, colon).trim().toLowerCase(), d.slice(colon + 1).trim()] as [string, string];
    })
    .filter(([name]) => name.length > 0);
}

const isMotionProperty = (name: string) =>
  name === "transition" || name.startsWith("transition-") || name === "animation" || name.startsWith("animation-");

/** The properties a `transition` shorthand or `transition-property` value names. */
function transitionProperties(name: string, value: string): string[] {
  if (name === "transition-property") return value.split(",").map((p) => p.trim().toLowerCase());
  if (name !== "transition") return [];
  return value.split(",").map((part) => part.trim().split(/\s+/)[0]?.toLowerCase() ?? "");
}

/** Splits on commas outside parentheses. */
function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < value.length; k++) {
    if (value[k] === "(") depth++;
    else if (value[k] === ")") depth--;
    else if (value[k] === "," && depth === 0) {
      parts.push(value.slice(start, k).trim());
      start = k + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

/** Returns one message per broken rule in a piece of CSS text. */
export function checkMotionCss(cssText: string, file = "css"): string[] {
  const rules = parseRules(stripComments(cssText));
  const problems: string[] = [];
  const keyframes = new Map<string, Rule>();
  for (const rule of rules) {
    const match = /^@(?:-webkit-)?keyframes\s+([\w-]+)/i.exec(rule.selector);
    if (match) keyframes.set(match[1], rule);
  }

  // Keyframes: every frame animates only transform and opacity.
  for (const [name, rule] of keyframes) {
    for (const frame of parseRules(rule.body)) {
      for (const [prop] of declarations(frame.body)) {
        if (!ALLOWED_PROPERTIES.has(prop) && prop !== "animation-timing-function") {
          problems.push(`${file}: @keyframes ${name} animates ${prop}`);
        }
      }
    }
  }

  // A stepped animation must not carry opacity: fades stay smooth (DEC-135).
  const opacityKeyframes = new Set(
    [...keyframes].filter(([, rule]) => parseRules(rule.body).some((f) => declarations(f.body).some(([p]) => p === "opacity"))).map(([n]) => n),
  );
  for (const rule of rules) {
    if (/^@/.test(rule.selector)) continue;
    for (const [prop, value] of declarations(rule.body)) {
      if (prop !== "animation" && prop !== "animation-name") continue;
      for (const part of splitTopLevel(value)) {
        if (!/steps\(|step-(start|end)/i.test(part) && prop === "animation") continue;
        for (const word of part.split(/\s+/)) {
          if (opacityKeyframes.has(word)) problems.push(`${file}: "${rule.selector}" steps ${word}, which animates opacity`);
        }
      }
    }
    const motion = declarations(rule.body).filter(([prop]) => isMotionProperty(prop));
    if (motion.length === 0) continue;
    const selectors = rule.selector.split(",").map((s) => s.trim());
    const ungated = selectors.filter((s) => !s.includes("[data-motion-"));
    if (ungated.length > 0) {
      problems.push(`${file}: "${ungated.join(", ")}" has ${motion.map(([p]) => p).join(", ")} without a [data-motion-*] gate`);
    }
    for (const [prop, value] of motion) {
      for (const p of transitionProperties(prop, value)) {
        if (p && p !== "none" && !ALLOWED_PROPERTIES.has(p)) {
          problems.push(`${file}: "${rule.selector}" transitions ${p}`);
        }
      }
    }
  }
  return problems;
}

describe("the motion rules", () => {
  it("find no ungated or non-compositor motion in the renderer's CSS", () => {
    const files = Object.entries(STYLESHEETS);
    expect(files.length).toBeGreaterThan(10);
    const problems = files.flatMap(([file, css]) => checkMotionCss(css, file));
    expect(problems).toEqual([]);
  });

  it("do not trip on class names that contain 'transition'", () => {
    expect(checkMotionCss(".prepare-transition { padding: 2px; }\n.prepare-transition__name { color: red; }")).toEqual([]);
  });
});

describe("the checker (self-test)", () => {
  it("fails on a deliberately ungated rule", () => {
    const problems = checkMotionCss(".x { transition: transform 50ms; }");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/without a \[data-motion-\*\] gate/);
  });

  it("fails when only one of several selectors is gated", () => {
    expect(
      checkMotionCss(":root[data-motion-micro] .a, .b { transition: transform 1ms; }"),
    ).toHaveLength(1);
  });

  it("fails on an ungated animation", () => {
    expect(checkMotionCss(".x { animation: spin 1s; }")).toHaveLength(1);
    expect(checkMotionCss(".x { animation-name: spin; }")).toHaveLength(1);
  });

  it("accepts a gated transform or opacity motion", () => {
    expect(
      checkMotionCss(
        ":root[data-motion-micro] .x { transition: transform 1ms steps(1), opacity 1ms linear; }",
      ),
    ).toEqual([]);
  });

  it("fails on a gated transition of another property, and on 'all'", () => {
    expect(checkMotionCss(":root[data-motion-micro] .x { transition: box-shadow 1ms; }")).toHaveLength(1);
    expect(checkMotionCss(":root[data-motion-micro] .x { transition: all 1ms; }")).toHaveLength(1);
    expect(
      checkMotionCss(":root[data-motion-micro] .x { transition-property: transform, color; }"),
    ).toHaveLength(1);
  });

  it("fails on keyframes that animate anything but transform and opacity", () => {
    const css = `@keyframes bad { from { width: 0; } to { width: 10px; } }
      :root[data-motion-micro] .x { animation: bad 1s; }`;
    expect(checkMotionCss(css).some((p) => p.includes("animates width"))).toBe(true);
  });

  it("accepts keyframes of transform and opacity", () => {
    const css = `@keyframes ok { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
      :root[data-motion-entrance] .x { animation: ok 1s; }`;
    expect(checkMotionCss(css)).toEqual([]);
  });

  it("fails when a stepped animation animates opacity, and accepts a split one", () => {
    const kf = "@keyframes m { from { transform: none; opacity: 1; } to { transform: none; opacity: 0; } }";
    expect(checkMotionCss(`${kf} :root[data-motion-hover] .x { animation: m 1s steps(4); }`)).toHaveLength(1);
    const split = `@keyframes m { from { transform: none; } to { transform: none; } }
      @keyframes f { from { opacity: 1; } to { opacity: 0; } }
      :root[data-motion-hover] .x { animation: m 1s steps(4), f 1s linear; }`;
    expect(checkMotionCss(split)).toEqual([]);
  });

  it("looks inside @media", () => {
    expect(checkMotionCss("@media (min-width: 1px) { .x { transition: transform 1ms; } }")).toHaveLength(1);
  });
});

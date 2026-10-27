/**
 * The two rules every motion obeys (DEC-134, PAGES-02), held by a test rather
 * than by review: it is gated on a `[data-motion-*]` attribute, and it animates
 * only `transform` and `opacity`. The check reads the renderer's CSS as text (`import.meta.glob`)
 * and parses declarations, not words: `prepare.css` has class names containing
 * "transition". Motion written in TypeScript escapes the CSS check, so a second check reads the
 * renderer's sources for inline `transition`/`animation` styles, `element.animate(` and
 * `startViewTransition`, and requires each to sit behind `useMotion(kind)` (PAGES-12).
 */
import { describe, expect, it } from "vitest";
import { declarations, parseRules, selectorList, stripComments, type Rule } from "./test/cssRules";

/** Every stylesheet under `src`, as text, by path. */
const STYLESHEETS = import.meta.glob<string>("./**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});
const ALLOWED_PROPERTIES = new Set(["transform", "opacity"]);

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

/** Every renderer source, as text, by path: tests, stories and fixtures are not the app. */
const SOURCES = import.meta.glob<string>(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx", "!./**/*.stories.tsx", "!./test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Code only: a comment saying "no animation:" is not an animation. */
function stripCodeComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** An inline style key (`transition:`, `animationName:`) in a component; not `row.transition :`. */
const STYLE_KEY =
  /(?<![.\w])(?:transition|animation)(?:Property|Duration|Delay|Name|TimingFunction|IterationCount|Direction|FillMode)?\s*:/;
/** Motion in any source: `element.animate(` and the View Transitions API. */
const SCRIPT_CALL = /\.animate\(|\bstartViewTransition\b/;

/**
 * What a source file that moves things in script is held to: it asks `useMotion("<kind>")`, or it
 * reads the `data-motion-<kind>` attribute the provider writes. Returns one message per file
 * that does neither.
 */
export function checkScriptMotion(sources: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [file, raw] of Object.entries(sources)) {
    const code = stripCodeComments(raw);
    if (!(file.endsWith(".tsx") && STYLE_KEY.test(code)) && !SCRIPT_CALL.test(code)) continue;
    const gated = /\buseMotion\(\s*["'`][a-z]+["'`]\s*\)/.test(code) || /data-motion-[a-z]+/.test(code);
    if (!gated) problems.push(`${file}: moves in script without useMotion(kind)`);
  }
  return problems;
}

describe("motion written in script", () => {
  it("sits behind useMotion(kind) everywhere in the renderer", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(checkScriptMotion(SOURCES)).toEqual([]);
  });

  it("fails an inline transition, an animation key, element.animate( and startViewTransition", () => {
    for (const code of [
      "const a = <div style={{ transition: 'transform 1s' }} />;",
      "const a = <div style={{ animationName: 'x' }} />;",
      "node.animate([{ opacity: 0 }], 100);",
      "document.startViewTransition(() => {});",
    ]) {
      expect(checkScriptMotion({ "x.tsx": code })).toHaveLength(1);
    }
  });

  it("accepts the same code behind useMotion(kind) or the kind's attribute", () => {
    expect(checkScriptMotion({ "x.tsx": "const on = useMotion('state'); node.animate([], 1);" })).toEqual([]);
    expect(checkScriptMotion({ "x.ts": "if (root.hasAttribute('data-motion-shared')) document.startViewTransition(f);" })).toEqual([]);
  });

  it("does not trip on a comment that says animation", () => {
    expect(checkScriptMotion({ "x.tsx": "// No animation: a line.\n/* transition: none */ const a = 1;" })).toEqual([]);
  });

  it("does not take a bare useMotion() as a kind", () => {
    expect(checkScriptMotion({ "x.tsx": "const m = useMotion(); node.animate([], 1);" })).toHaveLength(1);
  });
});

/**
 * The split (DEC-134, amended): interface motion (what opens, closes or changes page) moves
 * smoothly on an ease; decoration keeps its whole-pixel steps. Interface motion is named by the
 * element it moves, decoration by the keyframes that draw it.
 */
const INTERFACE_ELEMENTS: RegExp[] = [
  /\.app-main\[data-page-phase/,
  /\.cp-modal(__backdrop)?(?![\w-])/,
  /\.cp-toast(?![\w-])/,
  /\.cp-track-menu(__submenu)?(?![\w-])/,
  /\.cp-global-search__panel/,
  /\.cp-status__running/,
  /\.cp-wheel-pop(?![\w-])/,
  /\.cp-suggest__list/,
  /\.cp-hint__tip/,
  /\.cp-popover/,
  /\.cp-quick__panel/,
  /\.first-steps-note__popover/,
  /\.cp-inspector/,
  /\.cp-queue(?![\w-])/,
  /\.cp-side-panel/,
  /\[data-ghost\]/,
  /\.cp-tabs__tab--active/,
  /\.cp-track-section__body/,
];
const DECORATIVE_KEYFRAMES = ["cp-spinner-hop", "cp-shake", "cp-pixel-bars-grow-up", "cp-pixel-bars-grow-right", "cp-wheel-light"];
const EASES = /var\(--motion-ease-(out|in)\)/;

/** The compound selector an element rule lands on: the part after the last combinator. */
function subject(selector: string): string {
  const text = selector.trim();
  let depth = 0;
  let start = 0;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) start = k + 1;
  }
  return text.slice(start);
}
const isInterface = (selector: string) =>
  /\.app-main\[data-page-phase/.test(selector) || INTERFACE_ELEMENTS.some((re) => re.test(subject(selector)));

/** One message per interface motion that steps or is not eased, and per decoration that does not step. */
export function checkMotionSplit(cssText: string, file = "css"): { problems: string[]; interfaceRules: number } {
  const problems: string[] = [];
  let interfaceRules = 0;
  for (const rule of parseRules(stripComments(cssText))) {
    if (/^@/.test(rule.selector)) continue;
    const motion = declarations(rule.body).filter(([prop]) => prop === "animation" || prop === "transition");
    if (motion.length === 0) continue;
    const ui = selectorList(rule.selector).some((s) => isInterface(s));
    if (ui) interfaceRules += 1;
    for (const [prop, value] of motion) {
      for (const part of splitTopLevel(value)) {
        if (part === "none") continue;
        if (ui && /steps\(|step-(start|end)/.test(part)) problems.push(`${file}: "${rule.selector}" steps: ${part}`);
        if (ui && !EASES.test(part)) problems.push(`${file}: "${rule.selector}" ${prop} is not eased: ${part}`);
        const name = part.split(/\s+/)[0];
        if (DECORATIVE_KEYFRAMES.includes(name) && !/steps\(/.test(part)) {
          problems.push(`${file}: "${rule.selector}" plays ${name} without its pixel steps`);
        }
      }
    }
  }
  return { problems, interfaceRules };
}

describe("interface motion is smooth, decoration keeps its pixel steps", () => {
  it("eases every page, dialog, menu, popover, panel, toast and tab underline, and never steps them", () => {
    const results = Object.entries(STYLESHEETS).map(([file, css]) => checkMotionSplit(css, file));
    expect(results.flatMap((r) => r.problems)).toEqual([]);
    // The list above still names what the stylesheets move.
    expect(results.reduce((n, r) => n + r.interfaceRules, 0)).toBeGreaterThanOrEqual(14);
  });

  it("keeps the spinner, the shake, the bars and the wheel's light stepped", () => {
    const all = Object.values(STYLESHEETS).join("\n");
    for (const name of DECORATIVE_KEYFRAMES) expect(all, name).toMatch(new RegExp(`${name} [^,;]*steps\\(`));
  });

  it("fails a stepped or linear interface motion, and a smooth decoration (self-test)", () => {
    const gate = ":root[data-motion-entrance]";
    expect(checkMotionSplit(`${gate} .cp-popover { animation: cp-drop-in 1ms steps(2); }`).problems).toHaveLength(2);
    expect(checkMotionSplit(`${gate} .cp-modal { animation: cp-rise 1ms linear; }`).problems).toHaveLength(1);
    expect(checkMotionSplit(`${gate} .cp-modal { animation: cp-rise 1ms var(--motion-ease-out); }`).problems).toEqual([]);
    expect(checkMotionSplit(`:root[data-motion-loading] .x { animation: cp-spinner-hop 1ms linear; }`).problems).toHaveLength(1);
    // A descendant of an interface element is not the element.
    expect(checkMotionSplit(`${gate} .cp-wheel-pop .cp-wheel__seg { animation: cp-wheel-light 1ms steps(2); }`).problems).toEqual([]);
  });
});

/** The controls a press reaches: the press is a look, drawn on the first frame, with nothing timed. */
const PRESSABLE = [/\.cp-btn(?![\w-])/, /input\[type="checkbox"\]/, /input\[type="radio"\]/, /\.cp-track-yours__star(?![\w-])/, /\.cp-player-bar__button(?![\w-])/];

describe("a press", () => {
  it("has no transition on any pressable control, so it shows on the first frame", () => {
    const problems = Object.entries(STYLESHEETS).flatMap(([file, css]) =>
      parseRules(stripComments(css))
        .filter((rule) => selectorList(rule.selector).some((s) => PRESSABLE.some((re) => re.test(subject(s)))))
        .filter((rule) => declarations(rule.body).some(([prop]) => prop === "transition" || prop.startsWith("transition-")))
        .map((rule) => `${file}: ${rule.selector}`),
    );
    expect(problems).toEqual([]);
  });

  it("changes the fill as well as moving, on buttons, checkboxes, radios and the player's buttons", () => {
    const all = Object.values(STYLESHEETS).join("\n");
    const rules = parseRules(stripComments(all)).filter((r) => r.selector.includes(":active"));
    for (const re of PRESSABLE.filter((p) => !String(p).includes("star"))) {
      const hit = rules.find((r) => selectorList(r.selector).some((s) => re.test(subject(s)) && s.includes(":active")) && /--press-shade/.test(r.body));
      expect(hit, String(re)).toBeDefined();
    }
  });
});

describe("the scroll kind", () => {
  it("is never used on the track tables", () => {
    const problems = Object.entries(STYLESHEETS).flatMap(([file, css]) =>
      parseRules(stripComments(css))
        .filter((rule) => rule.selector.includes("data-motion-scroll") && rule.selector.includes("track-table"))
        .map((rule) => `${file}: ${rule.selector}`),
    );
    expect(problems).toEqual([]);
  });

  it("is used for the Settings headings, and never moves the Settings links (L5)", () => {
    const all = Object.values(STYLESHEETS).join("\n");
    expect(all).toMatch(/data-motion-scroll\][^{]*settings-page__section/);
    expect(all).not.toMatch(/data-motion-scroll\][^{]*settings-page__nav/);
  });
});

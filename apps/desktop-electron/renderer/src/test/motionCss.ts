/**
 * What the stylesheets say an element does, read as text (PAGES-12).
 *
 * jsdom does not load a component's CSS and has no animations, so a test of "off: no animation,
 * on: the stepped one, reduced: none" asks the real stylesheets which motion rules reach an element
 * given the attributes `MotionProvider` has written on `<html>`. Pseudo-classes that need a pointer
 * or focus (`:hover`, `:active`, `:focus-visible`) are taken as true; a rule with a pseudo-element
 * is read for that pseudo-element only.
 */
import { declarations, moreSpecific, parseRules, selectorList, specificity, stripComments } from "./cssRules";

const STYLESHEETS = import.meta.glob<string>("../**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

interface MotionRule {
  selector: string;
  /** The selector with the interaction pseudo-classes and the pseudo-element taken off. */
  matchable: string;
  pseudo: string | null;
  spec: [number, number, number];
  order: number;
  props: Record<string, string>;
}

function matchableOf(selector: string): { matchable: string; pseudo: string | null } {
  let pseudo: string | null = null;
  let sel = selector.replace(/::[\w-]+(\([^)]*\))?\s*$/, (m) => {
    pseudo = m.trim();
    return "";
  });
  sel = sel.replace(/:not\(\s*:(?:hover|active|focus-visible|focus|focus-within)\s*\)/g, "");
  sel = sel.replace(/:(?:hover|active|focus-visible|focus-within|focus)\b/g, "");
  return { matchable: sel.trim(), pseudo };
}

const RULES: MotionRule[] = (() => {
  const out: MotionRule[] = [];
  let order = 0;
  for (const css of Object.values(STYLESHEETS)) {
    for (const rule of parseRules(stripComments(css))) {
      if (rule.selector.startsWith("@")) continue;
      const props: Record<string, string> = {};
      for (const [name, value] of declarations(rule.body)) {
        if (name === "transition" || name === "animation") props[name] = value.replace(/\s+/g, " ").trim();
      }
      if (Object.keys(props).length === 0) continue;
      for (const selector of selectorList(rule.selector)) {
        const { matchable, pseudo } = matchableOf(selector);
        out.push({ selector, matchable, pseudo, spec: specificity(selector), order: order++, props });
      }
    }
  }
  return out;
})();

export interface Motion {
  animation: string | null;
  transition: string | null;
}

/**
 * The `animation` and `transition` that reach `element` (or its `pseudo`, such as "::before"):
 * the winning declaration of each, by specificity and then order. `none` reads as null. With a
 * `kind`, only the rules gated on that kind count. `--motion-fade` reads as `linear`.
 */
export function motionOf(element: Element, pseudo: string | null = null, kind: string | null = null): Motion {
  const best: Record<string, { spec: [number, number, number]; order: number; value: string } | undefined> = {};
  for (const rule of RULES) {
    if (rule.pseudo !== pseudo) continue;
    // Only the rules this kind gates: the other kinds are on too, and are another test's.
    if (kind !== null && !rule.selector.includes(`[data-motion-${kind}]`)) continue;
    let matches = false;
    try {
      matches = element.matches(rule.matchable || "*");
    } catch {
      matches = false;
    }
    if (!matches) continue;
    for (const [name, value] of Object.entries(rule.props)) {
      const current = best[name];
      if (!current || moreSpecific(rule.spec, current.spec)) best[name] = { spec: rule.spec, order: rule.order, value };
    }
  }
  const read = (name: string) => {
    const value = best[name]?.value ?? null;
    return value === null || value === "none" ? null : value.replace(/var\(--motion-fade\)/g, "linear");
  };
  return { animation: read("animation"), transition: read("transition") };
}

/** True when the motion steps (a `steps(` timing) and is not just a fade. */
export const steps = (value: string | null): boolean => value !== null && /steps\(/.test(value);

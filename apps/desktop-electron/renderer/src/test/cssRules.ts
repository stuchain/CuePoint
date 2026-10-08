/**
 * Reading CSS as text, for the tests that hold the stylesheets to a rule
 * (`motionRules.test.ts`, `motionKinds.test.tsx`): a small parser, not a browser.
 */

export interface Rule {
  selector: string;
  body: string;
  /** The at-rule the rule sits inside, if any: "@media (...)". */
  context: string;
}

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Splits CSS into rules, descending into @media/@supports; @keyframes come back whole. */
export function parseRules(css: string, context = ""): Rule[] {
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

export function declarations(body: string): [string, string][] {
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


/** Splits a selector list on commas outside brackets. */
export function selectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < selector.length; k++) {
    const ch = selector[k];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(selector.slice(start, k).trim());
      start = k + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

/** (ids, classes/attributes/pseudo-classes, types), compared in that order. */
export function specificity(selector: string): [number, number, number] {
  const bare = selector.replace(/::?[\w-]+\(([^()]*)\)/g, (m, inner: string) => (/^:?:?not|^:?:?is/.test(m) ? ` ${inner} ` : " :x "));
  const ids = (bare.match(/#[\w-]+/g) ?? []).length;
  const classes = (bare.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (bare.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length + (bare.match(/::[\w-]+/g) ?? []).length;
  return [ids, classes, types];
}

export function moreSpecific(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return true; // a tie goes to the later rule
}

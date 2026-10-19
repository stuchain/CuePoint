/**
 * C5 guard: every `<Button>` names its role. The default is `secondary`, so a bare `<Button>` is a
 * grey button; the violet fill is asked for as `variant="primary"` and only where it is the one
 * main action of the area.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob(
  ["/src/**/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.stories.tsx"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** Drops the text inside braces so an attribute inside an expression is not counted. */
function topLevel(tag: string): string {
  let out = "";
  let depth = 0;
  for (const ch of tag) {
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (depth === 0) out += ch;
  }
  return out;
}

/** The opening tags of every `<Button …>` in a source (braces and strings respected). */
function buttonTags(source: string): string[] {
  const tags: string[] = [];
  const open = /<Button(?=[\s>/])/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(source))) {
    let depth = 0;
    let quote: string | null = null;
    let end = match.index + 7;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (quote) {
        if (ch === quote && source[end - 1] !== "\\") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

describe("button variant guard (C5)", () => {
  it("has no <Button> without a variant", () => {
    const bad: string[] = [];
    for (const [path, source] of Object.entries(sources)) {
      for (const tag of buttonTags(source)) {
        if (!/(^|\s)variant=/.test(topLevel(tag))) bad.push(`${path.replace(/^\/src\//, "")}: ${tag.slice(0, 60)}`);
      }
    }
    expect(bad, `name the variant on: ${bad.join(" | ")}`).toEqual([]);
  });

  it("still sees a bare button", () => {
    expect(buttonTags("<Button onClick={go}>Go</Button>")).toHaveLength(1);
    expect(topLevel(buttonTags("<Button onClick={() => x({ variant: 1 })}>Go</Button>")[0])).not.toMatch(/variant=/);
    expect(topLevel(buttonTags('<Button variant="quiet">Go</Button>')[0])).toMatch(/variant=/);
  });
});

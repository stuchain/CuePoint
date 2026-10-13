/**
 * G6 T3 guard: a dropdown is the shared `Select`, not a raw `<select>`.
 *
 * `Select` hides the native arrow (`appearance: none`) and draws a pixel chevron, so a raw
 * `<select>` is the one control that still looks different. There is no allowlist: no file
 * outside Select.tsx may draw one.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob(
  ["/src/**/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.stories.tsx"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

function usesRawSelect(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
  return /<select[\s>]/.test(code);
}

function offenders(): string[] {
  return Object.entries(sources)
    .filter(([path, source]) => !path.endsWith("/src/components/Select.tsx") && usesRawSelect(source))
    .map(([path]) => path.replace(/^\/src\//, ""))
    .sort();
}

describe("raw select guard (T3)", () => {
  it("has no <select> outside Select.tsx", () => {
    const found = offenders();
    expect(found, `use components/Select in: ${found.join(", ")}`).toEqual([]);
  });

  it("still finds the shared Select, which does draw one", () => {
    expect(Object.keys(sources)).toContain("/src/components/Select.tsx");
    expect(usesRawSelect(sources["/src/components/Select.tsx"])).toBe(true);
  });
});

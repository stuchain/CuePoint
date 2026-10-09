/**
 * The update screens never say "channel", "feed" or "pre-release" (DIST-07, DEC-155/158): a test
 * build is a "test version". The wider words guard (`userWords.test.ts`) covers "engine" and "job".
 */
import { describe, expect, it } from "vitest";

const SOURCES = import.meta.glob<string>(
  ["./*.{ts,tsx}", "!./*.test.{ts,tsx}", "../../screens/AboutUpdatesSection.tsx"],
  { query: "?raw", import: "default", eager: true },
);

const REFUSED = /\b(channel|feed|pre-?release)\b/i;

/** Quoted text and JSX text, without comments, which developers read and users do not. */
function visibleText(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const strings = [...code.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? "");
  const jsx = [...code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1] ?? "");
  return [...strings, ...jsx].filter((text) => /\s/.test(text.trim()) || /^[A-Z]/.test(text.trim()));
}

describe("the update screens' words", () => {
  const files = Object.entries(SOURCES);

  it("reads the files it is meant to", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.some(([name]) => name.endsWith("AboutUpdatesSection.tsx"))).toBe(true);
    expect(files.some(([name]) => name.endsWith("UpdateReadyPanel.tsx"))).toBe(true);
  });

  it.each(files)("%s says none of them", (_name, source) => {
    expect(visibleText(source).filter((text) => REFUSED.test(text))).toEqual([]);
  });

  it("would notice one", () => {
    expect(visibleText('const a = "The update channel is stable"; const b = <p>A pre-release build</p>;')
      .filter((text) => REFUSED.test(text))).toHaveLength(2);
  });
});

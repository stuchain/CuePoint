import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "../lib/themes";
import { OUTLINE_TOKEN, PALETTE_SIZE, PALETTE_TOKENS, parseColor, paletteUniforms, tokensFromCss } from "./palette";

const css = readFileSync(new URL("../styles/tokens.generated.css", import.meta.url), "utf8");

/** One theme's tokens, straight from the generated file: the block with that theme's own selector. */
function themeBlock(id: string): Record<string, string> {
  const m = css.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no block for ${id}`);
  const out: Record<string, string> = {};
  for (const line of m[1]!.split(";")) {
    const kv = line.match(/^\s*--([\w-]+):\s*(.+?)\s*$/);
    if (kv) out[kv[1]!] = kv[2]!;
  }
  return out;
}

const hexToUnit = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

describe("the palette uniforms", () => {
  it("has as many tokens as the shader has slots", () => {
    expect(PALETTE_TOKENS).toHaveLength(PALETTE_SIZE);
  });

  for (const theme of THEMES) {
    it(`equal the tokens of ${theme.id}`, () => {
      const tokens = themeBlock(theme.id);
      const u = paletteUniforms(tokens);
      expect(u.colors).toHaveLength(PALETTE_SIZE);
      PALETTE_TOKENS.forEach((name, i) => {
        expect(u.colors[i], `${theme.id} ${name}`).toEqual(hexToUnit(tokens[name]!));
      });
      expect(u.outline).toEqual(hexToUnit(tokens[OUTLINE_TOKEN]!));
      expect(u.background).toEqual(hexToUnit(tokens["bg-app"]!));
    });
  }

  it("differs between themes", () => {
    const a = paletteUniforms(themeBlock("neoDark"));
    const b = paletteUniforms(themeBlock("clubNeon"));
    expect(a.colors).not.toEqual(b.colors);
  });

  it("names the missing token", () => {
    expect(() => paletteUniforms({})).toThrow(/bg-app/);
  });
});

describe("parseColor", () => {
  it("reads long and short hex", () => {
    expect(parseColor("#ff0000")).toEqual([1, 0, 0]);
    expect(parseColor("#0f0")).toEqual([0, 1, 0]);
    expect(parseColor(" #000000 ")).toEqual([0, 0, 0]);
  });
  it("reads rgb()", () => {
    expect(parseColor("rgb(255, 0, 255)")).toEqual([1, 0, 1]);
  });
  it("rejects what it cannot read", () => {
    expect(() => parseColor("banana")).toThrow();
  });
});

describe("tokensFromCss", () => {
  it("reads the listed tokens through a getter", () => {
    const tokens = tokensFromCss((name) => (name === "--bg-app" ? " #123456 " : ""));
    expect(tokens["bg-app"]).toBe("#123456");
    expect(tokens["fg-primary"]).toBe("");
  });
});

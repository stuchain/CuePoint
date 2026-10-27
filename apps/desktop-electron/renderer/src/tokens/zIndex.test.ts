/**
 * One stacking scale (M84): the --z-* tokens in tokens.css rise strictly, so no two layers tie
 * (the track menu and the Activity running list both sat at 60), and the sheets that name a layer
 * through a token use one that exists.
 */
import { describe, expect, it } from "vitest";
import { exitLimitFor } from "./usePresence";
import tokens from "./tokens.css?raw";

const ORDER = ["sticky", "banner", "activity", "menu", "submenu", "popover", "modal", "toast", "ghost", "hint"];

const value = (name: string): number => Number(new RegExp(`--z-${name}:\\s*(\\d+);`).exec(tokens)?.[1]);

describe("the z-index scale", () => {
  it("declares every layer, and each is above the one before", () => {
    const values = ORDER.map(value);
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i], `${ORDER[i]} above ${ORDER[i - 1]}`).toBeGreaterThan(values[i - 1]!);
    }
  });

  it("puts the track menu above the Activity running list, which it tied with", () => {
    expect(value("menu")).toBeGreaterThan(value("activity"));
  });

  it("names a layer that exists wherever a sheet uses a token", () => {
    const sheets = import.meta.glob<string>("../**/*.css", { query: "?raw", import: "default", eager: true });
    for (const [file, css] of Object.entries(sheets)) {
      for (const match of css.matchAll(/z-index:\s*var\(--z-([a-z-]+)\)/g)) {
        expect(ORDER, `${file}: --z-${match[1]}`).toContain(match[1]);
      }
    }
  });
});

describe("how long an exit may hold its element (M387)", () => {
  const nodeWith = (duration: string) => {
    const node = document.createElement("div");
    node.style.animationDuration = duration;
    document.body.append(node);
    return node;
  };

  it("reads the CSS duration, in ms or s, with room for a late frame", () => {
    expect(exitLimitFor(nodeWith("80ms"))).toBe(200);
    expect(exitLimitFor(nodeWith("0.08s, 0.16s"))).toBe(280);
  });

  it("falls back to 400 ms when the CSS names none", () => {
    expect(exitLimitFor(document.createElement("div"))).toBe(400);
  });
});

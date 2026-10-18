import { describe, expect, it } from "vitest";

import clubNeon from "../../tokens/themes/clubNeon.css?raw";
import mutedPro from "../../tokens/themes/mutedPro.css?raw";
import neoDark from "../../tokens/themes/neoDark.css?raw";
import qtEvolved from "../../tokens/themes/qtEvolved.css?raw";
import retro16 from "../../tokens/themes/retro16.css?raw";
import { contrastRatio } from "../../tokens/themeDerivation";
import wheelCss from "./CamelotWheel.css?raw";
import { COUNT_COLOUR_MIX, COUNT_LEVEL_MIX } from "./camelot";

/**
 * The wheel's colors in every built-in theme (PAGES-10): each label at 4.5:1 or
 * more on the fill it sits on, and each wedge's rim at 3:1 or more against the panel,
 * so an unlit key never vanishes (clubNeon's panel and unlit fill are 1.06:1 apart).
 */
const THEMES: Record<string, string> = { clubNeon, mutedPro, neoDark, qtEvolved, retro16 };

function tokens(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    found[match[1]!] = match[2]!;
  }
  return found;
}

describe.each(Object.entries(THEMES))("the wheel in %s", (_name, css) => {
  const t = tokens(css);

  it("reads its labels at 4.5:1 on every state's fill", () => {
    expect(contrastRatio(t["fg-primary"]!, t["bg-panel-alt"]!), "unlit").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t["border-outline"]!, t["accent-success"]!), "compatible").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t["border-outline"]!, t["accent-primary"]!), "the track's key").toBeGreaterThanOrEqual(4.5);
    // A hovered or focused label sits on the panel.
    expect(contrastRatio(t["fg-primary"]!, t["bg-panel"]!), "marked label").toBeGreaterThanOrEqual(4.5);
  });

  it("outlines every wedge against the panel at 3:1", () => {
    expect(contrastRatio(t["fg-muted"]!, t["bg-panel"]!)).toBeGreaterThanOrEqual(3);
  });
});

/** `color-mix(in srgb, <top> <percent>%, <base>)` in sRGB, as the stylesheet writes it. */
function mix(top: string, base: string, percent: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16);
  const out = [0, 1, 2].map((at) =>
    Math.round((channel(top, at) * percent + channel(base, at) * (100 - percent)) / 100)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${out.join("")}`;
}

describe.each(Object.entries(THEMES))("the counts mode in %s (PAGES-16)", (_name, css) => {
  const t = tokens(css);

  it("reads each count at 4.5:1 on the fill its level mixes", () => {
    COUNT_LEVEL_MIX.forEach((percent, level) => {
      const fill = mix(t["accent-primary"]!, t["bg-panel-alt"]!, percent);
      expect(contrastRatio(t["fg-primary"]!, fill), `level ${level} (${percent}%)`).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("tells a chosen key from a counted one: its label sits on the track's-key fill", () => {
    expect(contrastRatio(t["border-outline"]!, t["accent-primary"]!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the counts mode's styles", () => {
  it("writes each level's mix into the stylesheet, from the same numbers", () => {
    COUNT_LEVEL_MIX.forEach((percent, level) => {
      if (level === 0) return;
      expect(wheelCss).toMatch(
        new RegExp(`data-level="${level}"\\][^{]*\\{[^}]*accent-primary\\)\\s*${percent}%`),
      );
    });
  });
});

describe("the wheel's styles", () => {
  const rules = [...wheelCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];

  it("never change a wedge's fill on hover or focus, and give no label a background", () => {
    for (const [, selector, body] of rules) {
      if (/:hover|:focus/.test(selector!)) expect(body, selector!.trim()).not.toMatch(/fill|background/);
      if (/__label/.test(selector!)) expect(body, selector!.trim()).not.toMatch(/background/);
    }
  });

  it("mark hover and focus with an outline on the wedge", () => {
    const mark = rules.find(([, selector]) => /__mark\[data-mark="focus"\]/.test(selector!));
    expect(mark?.[2]).toMatch(/stroke:\s*var\(--fg-primary\)/);
  });

  it("draws the art smoothly", () => {
    const art = rules.find(([, selector]) => /\.cp-wheel__art\b/.test(selector!));
    expect(art?.[2]).not.toMatch(/crispEdges/);
    const shape = rules.find(([, selector]) => selector!.trim() === ".cp-wheel__shape");
    expect(shape?.[2]).toMatch(/stroke:\s*var\(--fg-muted\)/);
  });
});

/**
 * The popover's wheel is drawn in the 24 key colours (area 44): an unlit key is a tint of its own
 * colour, a key that mixes with the track's is its full colour. Each label keeps 4.5:1 on its fill
 * in every built-in theme; the colours are the ones the key chips use (tokens/keyColours.css).
 */
const keyColourSheet = (await import("../../tokens/keyColours.css?raw")).default;

function keyColoursOf(theme: string): Record<string, string> {
  const block = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`).exec(keyColourSheet)![1]!;
  return Object.fromEntries([...block.matchAll(/--key-(\w+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

describe.each(Object.entries(THEMES))("the key-coloured wheel in %s", (name, css) => {
  const t = tokens(css);
  const keys = keyColoursOf(name);

  it("has all 24 key colours", () => {
    expect(Object.keys(keys)).toHaveLength(24);
  });

  it("reads each unlit label at 4.5:1 on its key's tint", () => {
    for (const [code, colour] of Object.entries(keys)) {
      const fill = mix(colour, t["bg-panel-alt"]!, 22);
      expect(contrastRatio(t["fg-primary"]!, fill), code).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("reads each lit label (the dark outline colour) at 4.5:1 on its key's full colour", () => {
    for (const [code, colour] of Object.entries(keys)) {
      expect(contrastRatio(t["border-outline"]!, colour), code).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("styles the wedges from the key colour, not the green and violet of old", () => {
    expect(wheelCss).toMatch(/\.cp-wheel--coloured \.cp-wheel__shape\s*\{[^}]*var\(--wheel-key\) 22%/);
    expect(wheelCss).toMatch(/\.cp-wheel--coloured \.cp-wheel__shape\[data-lit\]\s*\{[^}]*fill:\s*var\(--wheel-key\)/);
  });

  it("colours the counts by how much of the key's own colour each level mixes, from the same numbers", () => {
    COUNT_COLOUR_MIX.forEach((percent, level) => {
      if (level === 0) {
        expect(wheelCss).toMatch(
          new RegExp(`\\.cp-wheel--coloured\\.cp-wheel--counts \\.cp-wheel__shape\\s*\\{[^}]*--wheel-key\\)\\s*${percent}%`),
        );
        return;
      }
      expect(wheelCss).toMatch(
        new RegExp(`\\.cp-wheel--coloured \\.cp-wheel__shape\\[data-level="${level}"\\]\\s*\\{[^}]*--wheel-key\\)\\s*${percent}%`),
      );
    });
  });

  it("reads each count at 4.5:1 on every key's level fill: the text colour while light, the dark colour on the fullest", () => {
    COUNT_COLOUR_MIX.forEach((percent, level) => {
      const label = level === COUNT_COLOUR_MIX.length - 1 ? t["border-outline"]! : t["fg-primary"]!;
      for (const [code, colour] of Object.entries(keys)) {
        const fill = mix(colour, t["bg-panel-alt"]!, percent);
        expect(contrastRatio(label, fill), `${code} at level ${level}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});

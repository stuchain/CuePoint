import { describe, expect, it } from "vitest";

import clubNeon from "../../tokens/themes/clubNeon.css?raw";
import mutedPro from "../../tokens/themes/mutedPro.css?raw";
import neoDark from "../../tokens/themes/neoDark.css?raw";
import qtEvolved from "../../tokens/themes/qtEvolved.css?raw";
import retro16 from "../../tokens/themes/retro16.css?raw";
import { contrastRatio } from "../../tokens/themeDerivation";
import wheelCss from "./CamelotWheel.css?raw";

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
});

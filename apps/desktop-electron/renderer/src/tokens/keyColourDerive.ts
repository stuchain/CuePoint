/**
 * The 24 key colours (R4-2), moved to read on each theme.
 *
 * Mixed In Key's convention: twelve hues round the wheel (1 teal, 2 green, 3
 * lime, 4 yellow, 5 orange, 6 red-orange, 7 red-pink, 8 magenta, 9 purple, 10
 * violet, 11 blue, 12 cyan), the A ring deeper and the B ring lighter. A chip
 * writes the key's code in that colour on a tint of it, so the colour is moved
 * (`holdContrast`) until the code reads on the tint over every background a
 * chip sits on. `keyColours.css` is this function's output for the five
 * built-in themes; `deriveThemeTokens` calls it for a custom one.
 */
// This file and themeDerivation.ts import each other (it calls keyTokens, this calls holdContrast).
// That is safe because neither uses the other's exports at the top level, only inside functions
// that run later; the key names live in keyTokenKeys.ts so the one top-level use is a leaf.
import { holdContrast, normalizeHex } from "./themeDerivation";
import { KEY_TOKEN_KEYS } from "./keyTokenKeys";

export { KEY_TOKEN_KEYS };

/** How much of the key colour the chip's background is: the one chip fill, `--chip-fill-mix` (M3, D2). */
export const KEY_CHIP_TINT = 16;

/** The least contrast the code keeps on its own tint over the input background and the panel. */
const KEY_TEXT_CONTRAST = 4.5;
/** The least contrast it keeps on its tint over a selected row's fill. */
const KEY_SELECTED_CONTRAST = 3;

/** Each Camelot number's hue in degrees, 1 teal round to 12 cyan, roughly 30 degrees apart. */
const NUMBER_HUES = [172, 140, 100, 58, 32, 10, 345, 315, 280, 255, 222, 192];

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Relative luminance (WCAG) of an `#rrggbb` colour. */
function luminanceOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** How bright a key colour is, by ring (M332, D28): every A is one luminance and every B another, so no hue shouts. */
export const KEY_LUMINANCE = { A: 0.4, B: 0.55 } as const;

/** The lightness (HSL) at which a hue and saturation reach `target` luminance, found by bisection. */
function hslAtLuminance(hue: number, saturation: number, target: number): string {
  let low = 0;
  let high = 100;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (luminanceOf(hslToHex(hue, saturation, mid)) < target) low = mid;
    else high = mid;
  }
  return hslToHex(hue, saturation, (low + high) / 2);
}

/** The 24 base colours before any theme moves them, by token name: A deeper, B lighter, each ring at one luminance. */
export const KEY_BASE_HUES: Readonly<Record<string, string>> = Object.fromEntries(
  KEY_TOKEN_KEYS.map((token) => {
    const number = Number(/\d+/.exec(token)![0]);
    const deep = token.endsWith("A");
    return [token, hslAtLuminance(NUMBER_HUES[number - 1]!, deep ? 85 : 72, deep ? KEY_LUMINANCE.A : KEY_LUMINANCE.B)];
  }),
);

/** `top` at `percent` over an opaque `base`: `color-mix(in srgb, top N%, base)` in sRGB. */
export function mixHex(top: string, base: string, percent: number): string {
  const a = normalizeHex(top).slice(1);
  const b = normalizeHex(base).slice(1);
  const channel = (hex: string, at: number) => parseInt(hex.slice(at * 2, at * 2 + 2), 16);
  return `#${[0, 1, 2]
    .map((at) =>
      Math.round((channel(a, at) * percent + channel(b, at) * (100 - percent)) / 100)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export interface KeyBackgrounds {
  /** The panel, the input background and the selected row's fill, as opaque hex. */
  panel: string;
  input: string;
  selected: string;
}

/**
 * One colour, moved until its code reads on its own tint over each background. The tint is made
 * of the colour, so moving it moves the tint: repeat until it stops (a step or two).
 */
function holdKey(base: string, { panel, input, selected }: KeyBackgrounds): string {
  let colour = normalizeHex(base);
  for (let round = 0; round < 6; round += 1) {
    const tint = (background: string) => mixHex(colour, background, KEY_CHIP_TINT);
    const onText = holdContrast(colour, [tint(input), tint(panel)], KEY_TEXT_CONTRAST);
    const next = holdContrast(onText, [tint(selected)], KEY_SELECTED_CONTRAST);
    if (next === colour) break;
    colour = next;
  }
  return colour;
}

/** The 24 tokens (`key-1A` ... `key-12B`) for a theme with these backgrounds. */
export function keyTokens(backgrounds: KeyBackgrounds): Record<string, string> {
  return Object.fromEntries(
    KEY_TOKEN_KEYS.map((token) => [token, holdKey(KEY_BASE_HUES[token]!, backgrounds)]),
  );
}

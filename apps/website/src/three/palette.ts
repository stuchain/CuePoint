/**
 * The palette pass's data (SITE-05, DEC-190): a pure function from a token map (CSS custom property
 * names without the dashes, to their values) to the shader's uniforms. Tests feed it each theme's
 * tokens from tokens.generated.css; the browser feeds it getComputedStyle of the active theme.
 *
 * Colors stay in sRGB 0..1 and the renderer does no color management, so a snapped pixel is exactly
 * the token's color.
 */

export type RGB = [number, number, number];

/** The shader's palette slots (uniform vec3 uPalette[16]), in this order. */
export const PALETTE_TOKENS = [
  "bg-app",
  "bg-panel",
  "bg-panel-alt",
  "border-muted",
  "border-highlight",
  "border-light",
  "fg-muted",
  "fg-primary",
  "accent-primary",
  "accent-primary-hover",
  "accent-primary-pressed",
  "accent-secondary",
  "accent-success",
  "accent-warning",
  "accent-danger",
  "accent-info",
] as const;

export const PALETTE_SIZE = PALETTE_TOKENS.length;
export const OUTLINE_TOKEN = "border-outline";
export const BACKGROUND_TOKEN = "bg-app";

export type PaletteToken = (typeof PALETTE_TOKENS)[number];

export interface PaletteUniforms {
  colors: RGB[];
  outline: RGB;
  background: RGB;
}

const unit = (n: number): number => n / 255;

/** #rgb, #rrggbb, rgb() or rgba() to 0..1 channels. */
export function parseColor(value: string): RGB {
  const v = value.trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
    return [unit(parseInt(h.slice(0, 2), 16)), unit(parseInt(h.slice(2, 4), 16)), unit(parseInt(h.slice(4, 6), 16))];
  }
  const fn = v.match(/^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/);
  if (fn) return [unit(Number(fn[1])), unit(Number(fn[2])), unit(Number(fn[3]))];
  throw new Error(`Cannot read "${value}" as a color`);
}

/** Token map to the shader's uniforms. Throws, naming the token, when one is missing. */
export function paletteUniforms(tokens: Readonly<Record<string, string>>): PaletteUniforms {
  const read = (name: string): RGB => {
    const raw = tokens[name];
    if (raw === undefined || raw.trim() === "") throw new Error(`Palette: the token --${name} is missing`);
    return parseColor(raw);
  };
  return {
    colors: PALETTE_TOKENS.map(read),
    outline: read(OUTLINE_TOKEN),
    background: read(BACKGROUND_TOKEN),
  };
}

/** Reads the palette's tokens through a getter such as `(n) => style.getPropertyValue(n)`. */
export function tokensFromCss(get: (cssName: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [...PALETTE_TOKENS, OUTLINE_TOKEN]) out[name] = get(`--${name}`).trim();
  return out;
}

/** The active theme's palette, read from the document element's computed style. */
export function readPalette(el: Element = document.documentElement): PaletteUniforms {
  const style = getComputedStyle(el);
  return paletteUniforms(tokensFromCss((n) => style.getPropertyValue(n)));
}

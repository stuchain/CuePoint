/**
 * Reads one theme's color tokens out of src/styles/tokens.generated.css (written by sync-tokens from
 * the app's own theme file), so the favicon canvas, the web manifest and the sharing pictures use the
 * app's colors and not copies of them.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BESIDE_SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "styles", "tokens.generated.css");
/**
 * Beside this file when run from scripts/; from the project folder (where every npm script runs) when
 * Astro has bundled this module into dist/.prerender, where "beside this file" no longer exists.
 */
export const TOKENS_CSS = existsSync(BESIDE_SCRIPTS) ? BESIDE_SCRIPTS : join(process.cwd(), "src", "styles", "tokens.generated.css");

/** `{ "--bg-panel": "#27272a", ... }` for `[data-theme="<theme>"]` in the CSS text. */
export function themeTokens(css, theme = "neoDark") {
  const block = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (!block) throw new Error(`theme-colors: no [data-theme="${theme}"] block in the tokens`);
  const tokens = {};
  for (const [, name, value] of block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)) tokens[name] = value.trim();
  return tokens;
}

/** Neo Dark's tokens, read from the generated file. */
export function neoDarkTokens() {
  return themeTokens(readFileSync(TOKENS_CSS, "utf8"), "neoDark");
}

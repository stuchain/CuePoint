/**
 * The site's languages, read as text from src/i18n/locales.ts (DEC-312). Node 22.12 cannot import .ts, and
 * the scripts (check-site, i18n-stale) must not need a build to know the languages, so they read the
 * registry the way check-site reads site.config.ts. `src/i18n/locales.test.ts` holds this reader and the
 * real registry to the same answer.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_LOCALE = "en";

/** The pages that exist in every language, as English paths: the same list as TRANSLATED_FIXED_PATHS in locales.ts. */
export const TRANSLATED_FIXED_PATHS = ["", "features/", "compare/", "download/", "faq/"];

/** Whether an English page path (relative to the base) is one that is translated: the fixed pages, and one for each feature and comparison. */
export function isTranslatedPath(path) {
  return TRANSLATED_FIXED_PATHS.includes(path) || /^(features|compare)\/[^/]+\/$/.test(path);
}

/** { code, hreflang, ogLocale }[] from the text of locales.ts; throws when it finds none. */
export function readLocales(source) {
  const entries = [...source.matchAll(/\{\s*code:\s*"([a-z]{2,3}(?:-[a-z0-9]{2,8})*)",\s*hreflang:\s*"([^"]+)",\s*ogLocale:\s*"([^"]+)"/g)].map((m) => ({
    code: m[1],
    hreflang: m[2],
    ogLocale: m[3],
  }));
  if (entries.length === 0 || entries[0].code !== DEFAULT_LOCALE) {
    throw new Error(`i18n-locales: could not read the locales from locales.ts (the first must be "${DEFAULT_LOCALE}")`);
  }
  return entries;
}

export function readLocalesFile(path = join(HERE, "..", "src", "i18n", "locales.ts")) {
  return readLocales(readFileSync(path, "utf8"));
}

/** The path of an English page in a language, relative to the base: "features/" -> "de/features/". */
export function localizedPath(code, path) {
  return code === DEFAULT_LOCALE ? path : `${code}/${path}`;
}

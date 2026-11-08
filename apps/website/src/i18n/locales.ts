import { COMPARE_TOOLS, compareHref } from "../data/compare";
import { FEATURE_PAGES, featureHref } from "../data/features";

/**
 * The site's languages (DEC-311). English lives at the root of the site; every other language lives under
 * `/<code>/`, at the same path as the English page (the slugs stay English).
 *
 * ADDING A LANGUAGE is exactly this: one entry below, plus the translation files (docs/translation.md):
 *   src/i18n/ui/<code>.ts, src/data/i18n/<code>/{home,features,compare}.ts, src/content/faq.<code>.yaml and a
 *   sources.json entry. Routes, the sitemap, the language switch, the checks and the tests pick it up by themselves.
 *
 * Keep each entry's `code:` and `hreflang:` on one line pair like these: scripts/i18n-locales.mjs reads this
 * file as text (Node cannot import .ts), and a test holds the two readers to the same answer.
 */
export interface LocaleInfo {
  /** The URL segment, lower case: `de`, `pt-br`. */
  readonly code: string;
  /** The BCP 47 tag for `<html lang>`, hreflang and `inLanguage`. */
  readonly hreflang: string;
  /** Open Graph's `og:locale`. */
  readonly ogLocale: string;
  /** The language's own name, as the switch lists it. */
  readonly name: string;
  /** The short label on the switch button. */
  readonly short: string;
}

export const LOCALES = [
  { code: "en", hreflang: "en", ogLocale: "en_US", name: "English", short: "EN" },
  { code: "de", hreflang: "de", ogLocale: "de_DE", name: "Deutsch", short: "DE" },
] as const satisfies readonly LocaleInfo[];

export type LocaleCode = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: LocaleCode = "en";

/** The languages other than English: the ones that have a folder in the URL. */
export const OTHER_LOCALES = LOCALES.filter((l) => l.code !== DEFAULT_LOCALE);

export function localeInfo(code: string): LocaleInfo {
  const info = LOCALES.find((l) => l.code === code);
  if (!info) throw new Error(`Unknown locale "${code}"`);
  return info;
}

export const isLocaleCode = (value: string): value is LocaleCode => LOCALES.some((l) => l.code === value);

/** The pages that exist in every language, as English paths relative to the base. The rest of the site is English only. */
export const TRANSLATED_FIXED_PATHS = ["", "features/", "compare/", "download/", "faq/"] as const;

/**
 * Every translated page's English path: the fixed pages, and a page for each feature and each comparison.
 * Computed from the data, so a new feature page is translated-by-requirement the day it is added.
 */
export const TRANSLATED_PATHS: readonly string[] = [
  ...TRANSLATED_FIXED_PATHS,
  ...FEATURE_PAGES.map((p) => featureHref(p.slug)),
  ...COMPARE_TOOLS.map((t) => compareHref(t.slug)),
];

import { DEFAULT_LOCALE, LOCALES, OTHER_LOCALES, TRANSLATED_PATHS, type LocaleCode } from "./locales";

/**
 * Paths and languages (DEC-311). A "path" is relative to the base, no leading slash, "" for the home page,
 * the way the rest of the site writes them. Every function here takes and returns the ENGLISH path unless it
 * says otherwise, so a page has one name whatever language it is shown in.
 */

const TRANSLATED = new Set(TRANSLATED_PATHS);

const normalize = (path: string): string => {
  const clean = path.replace(/^\/+/, "");
  return clean === "" || clean.endsWith("/") || /\.[a-z0-9]+$/i.test(clean.slice(clean.lastIndexOf("/") + 1)) ? clean : `${clean}/`;
};

/** Whether the page exists in every language. */
export function isTranslated(path: string): boolean {
  return TRANSLATED.has(normalize(path));
}

/**
 * The path to use for a link in `locale` to the page with English path `path`: the page in that language
 * when it has one, else the English page (guide, blog, changelog, ...).
 */
export function localePath(locale: LocaleCode, path: string): string {
  const clean = normalize(path);
  if (locale === DEFAULT_LOCALE || !isTranslated(clean)) return clean;
  return `${locale}/${clean}`;
}

/** Whether a link from a page in `locale` to `path` leaves that language (so the link says `hreflang="en"`). */
export function leavesLanguage(locale: LocaleCode, path: string): boolean {
  return locale !== DEFAULT_LOCALE && !isTranslated(path);
}

export interface Alternate {
  /** `en`, `de`, `pt-BR`, or `x-default`. */
  readonly hreflang: string;
  /** The page's path in that language, relative to the base. */
  readonly path: string;
}

/**
 * Every version of a page, for `<link rel="alternate" hreflang>`: one for each language and `x-default`, which
 * is English. A page that is not translated has none.
 */
export function alternatesFor(path: string): Alternate[] {
  const clean = normalize(path);
  if (!isTranslated(clean)) return [];
  return [
    ...LOCALES.map((l) => ({ hreflang: l.hreflang, path: localePath(l.code, clean) })),
    { hreflang: "x-default", path: clean },
  ];
}

/** Splits a path (relative to the base) into its language and the English path: "de/features/" -> de, "features/". */
export function splitLocalePath(path: string): { locale: LocaleCode; path: string } {
  const clean = path.replace(/^\/+/, "");
  const [first = "", ...rest] = clean.split("/");
  if (OTHER_LOCALES.some((l) => l.code === first)) return { locale: first as LocaleCode, path: rest.join("/") };
  return { locale: DEFAULT_LOCALE, path: clean };
}

/** The language a URL is in, from its path after the base: English unless the first segment is a language's code. */
export function localeFromUrl(url: URL | string, base: string = import.meta.env.BASE_URL): LocaleCode {
  const pathname = typeof url === "string" ? url : url.pathname;
  const b = base.endsWith("/") ? base : `${base}/`;
  const rest = pathname.startsWith(b) ? pathname.slice(b.length) : pathname.replace(/^\/+/, "");
  const first = rest.split("/")[0] ?? "";
  // "de" alone (no trailing slash) is not a page, but is still the German home: be generous
  return OTHER_LOCALES.some((l) => l.code === first) ? (first as LocaleCode) : DEFAULT_LOCALE;
}

/**
 * Where each language's link in the switch goes from the page with English path `path`: the same page in that
 * language, or that language's home page when the page has no translation.
 */
export function switchTargets(path: string): { code: LocaleCode; path: string }[] {
  const clean = normalize(path);
  const translated = isTranslated(clean);
  return LOCALES.map((l) => ({ code: l.code, path: l.code === DEFAULT_LOCALE ? clean : translated ? localePath(l.code, clean) : localePath(l.code, "") }));
}

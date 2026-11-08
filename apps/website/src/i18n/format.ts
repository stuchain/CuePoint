import { formatDate } from "../lib/dates";
import { DEFAULT_LOCALE, localeInfo, type LocaleCode } from "./locales";

/** Fills `{name}` placeholders. A placeholder with no value throws, so a typo fails the build and not the page. */
export function fmt(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`fmt: no value for {${name}} in "${template}"`);
    return String(value);
  });
}

/** The placeholder names a template uses, sorted and without repeats: what a translation must keep. */
export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
}

/**
 * A YYYY-MM-DD day as the page's language writes it ("8. Oktober 2026"). English keeps the ISO form its comparison
 * pages have always shown; the `<time datetime>` next to it stays ISO in every language.
 */
export function dayFor(iso: string, locale: LocaleCode): string {
  return locale === DEFAULT_LOCALE ? iso : formatDate(iso, localeInfo(locale).hreflang);
}

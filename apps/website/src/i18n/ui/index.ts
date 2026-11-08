import type { LocaleCode } from "../locales";
import { en, type UiStrings } from "./en";

/**
 * The UI strings of every language. A language's file is found by its name (`ui/de.ts`, `ui/pt-br.ts`): adding
 * a language needs no edit here. A language that is registered in locales.ts but has no file fails the build.
 */
const modules = import.meta.glob<{ default: UiStrings }>(["./*.ts", "!./index.ts", "!./en.ts", "!./*.test.ts"], { eager: true });

const byCode: Record<string, UiStrings> = { en };
for (const [file, mod] of Object.entries(modules)) {
  const code = /\.\/([\w-]+)\.ts$/.exec(file)?.[1];
  if (code) byCode[code] = mod.default;
}

export function ui(locale: LocaleCode): UiStrings {
  const strings = byCode[locale];
  if (!strings) throw new Error(`No UI strings for "${locale}": add src/i18n/ui/${locale}.ts (docs/translation.md)`);
  return strings;
}

export { en, type UiStrings };
export const uiLocales = (): string[] => Object.keys(byCode);

/** The key of `nav` for a page's English path (src/data/nav.ts). */
export const NAV_KEYS: Readonly<Record<string, keyof UiStrings["nav"]>> = {
  "": "home",
  "features/": "features",
  "guide/": "guide",
  "faq/": "faq",
  "download/": "download",
  "blog/": "blog",
  "compare/": "compare",
  "changelog/": "changelog",
  "contact/": "contact",
  "report-a-bug/": "reportBug",
  "privacy/": "privacy",
  "terms/": "terms",
};

export function navLabel(locale: LocaleCode, path: string, fallback: string): string {
  const key = NAV_KEYS[path];
  return key ? ui(locale).nav[key] : fallback;
}

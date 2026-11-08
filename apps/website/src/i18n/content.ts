import * as enCompare from "../data/compare";
import * as enFeatures from "../data/features";
import * as enHome from "../data/home";
import { DEFAULT_LOCALE, type LocaleCode } from "./locales";

/**
 * The page content of every language (DEC-311). English is where it always was (src/data/home.ts, features.ts,
 * compare.ts); another language's is `src/data/i18n/<code>/{home,features,compare}.ts`, found by name, so adding a
 * language needs no edit here. A language with a missing file fails the build.
 */
type Home = Pick<typeof enHome, "OPENING_STEPS" | "APP_SHOTS" | "FEATURES" | "TRUST" | "HERO">;
type Features = Pick<typeof enFeatures, "OVERVIEW" | "FEATURE_PAGES">;
type Compare = Pick<typeof enCompare, "COMPARE_TOOLS">;

const homeModules = import.meta.glob<Home>("../data/i18n/*/home.ts", { eager: true });
const featureModules = import.meta.glob<Features>("../data/i18n/*/features.ts", { eager: true });
const compareModules = import.meta.glob<Compare>("../data/i18n/*/compare.ts", { eager: true });

const codeOf = (file: string): string => /\/i18n\/([\w-]+)\//.exec(file)?.[1] ?? "";
const byCode = <T>(modules: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(modules).map(([file, mod]) => [codeOf(file), mod]));

const homes = byCode(homeModules);
const features = byCode(featureModules);
const compares = byCode(compareModules);

function pick<T>(table: Record<string, T>, english: T, locale: LocaleCode, file: string): T {
  if (locale === DEFAULT_LOCALE) return english;
  const found = table[locale];
  if (!found) throw new Error(`No ${file} for "${locale}": add src/data/i18n/${locale}/${file} (docs/translation.md)`);
  return found;
}

export const homeFor = (locale: LocaleCode): Home => pick(homes, enHome, locale, "home.ts");
export const featuresFor = (locale: LocaleCode): Features => pick(features, enFeatures, locale, "features.ts");
export const compareFor = (locale: LocaleCode): Compare => pick(compares, enCompare, locale, "compare.ts");

export function featureBySlugFor(locale: LocaleCode, slug: string): enFeatures.FeaturePage | undefined {
  return featuresFor(locale).FEATURE_PAGES.find((p) => p.slug === slug);
}

/** The language folders that hold a given file, for the tests and the stale script. */
export const translatedFolders = (): string[] => Object.keys(homes);

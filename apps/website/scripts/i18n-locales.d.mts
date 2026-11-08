export interface ReadLocale {
  code: string;
  hreflang: string;
  ogLocale: string;
}
export const DEFAULT_LOCALE: string;
export const TRANSLATED_FIXED_PATHS: readonly string[];
export function isTranslatedPath(path: string): boolean;
export function readLocales(source: string): ReadLocale[];
export function readLocalesFile(path?: string): ReadLocale[];
export function localizedPath(code: string, path: string): string;

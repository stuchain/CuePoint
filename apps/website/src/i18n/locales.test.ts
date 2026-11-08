import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMPARE_TOOLS } from "../data/compare";
import { FEATURE_PAGES } from "../data/features";
import { isTranslatedPath, readLocales, TRANSLATED_FIXED_PATHS as SCRIPT_FIXED } from "../../scripts/i18n-locales.mjs";
import { DEFAULT_LOCALE, LOCALES, OTHER_LOCALES, TRANSLATED_FIXED_PATHS, TRANSLATED_PATHS, localeInfo } from "./locales";

const SOURCE = readFileSync(resolve(fileURLToPath(new URL(".", import.meta.url)), "locales.ts"), "utf8");

describe("the registry", () => {
  it("starts with English, which is the default and has no folder", () => {
    expect(LOCALES[0]?.code).toBe("en");
    expect(DEFAULT_LOCALE).toBe("en");
    expect(OTHER_LOCALES.map((l) => l.code)).not.toContain("en");
  });

  it("gives every language the fields the pages and the switch need", () => {
    for (const l of LOCALES) {
      expect(l.code, "code").toMatch(/^[a-z]{2}(-[a-z]{2})?$/);
      expect(l.hreflang, "hreflang").toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
      expect(l.ogLocale, "og:locale").toMatch(/^[a-z]{2}_[A-Z]{2}$/);
      expect(l.name.length, "name").toBeGreaterThan(1);
      expect(l.short, "short").toMatch(/^[A-Z]{2}$/);
    }
    expect(new Set(LOCALES.map((l) => l.code)).size).toBe(LOCALES.length);
    expect(new Set(LOCALES.map((l) => l.short)).size).toBe(LOCALES.length);
  });

  it("uses the tags the owner chose, for the languages it has", () => {
    expect(localeInfo("en")).toMatchObject({ hreflang: "en", ogLocale: "en_US", name: "English", short: "EN" });
    expect(localeInfo("de")).toMatchObject({ hreflang: "de", ogLocale: "de_DE", name: "Deutsch", short: "DE" });
  });

  it("throws for a language that is not registered", () => {
    expect(() => localeInfo("xx")).toThrow(/Unknown locale/);
  });
});

describe("the translated pages", () => {
  it("are the fixed pages and one for each feature and each comparison, computed from the data", () => {
    expect(TRANSLATED_PATHS).toEqual([
      ...TRANSLATED_FIXED_PATHS,
      ...FEATURE_PAGES.map((p) => `features/${p.slug}/`),
      ...COMPARE_TOOLS.map((t) => `compare/${t.slug}/`),
    ]);
    expect(TRANSLATED_FIXED_PATHS).toEqual(["", "features/", "compare/", "download/", "faq/"]);
  });

  it("are exactly what the scripts' reader says is translated", () => {
    expect([...SCRIPT_FIXED]).toEqual([...TRANSLATED_FIXED_PATHS]);
    for (const path of TRANSLATED_PATHS) expect(isTranslatedPath(path), path).toBe(true);
    for (const path of ["guide/", "blog/", "changelog/", "contact/", "features/a/b/", "de/"]) expect(isTranslatedPath(path), path).toBe(false);
  });
});

describe("the scripts' reader of locales.ts", () => {
  it("finds the same languages as the registry", () => {
    expect(readLocales(SOURCE)).toEqual(LOCALES.map((l) => ({ code: l.code, hreflang: l.hreflang, ogLocale: l.ogLocale })));
  });

  it("throws when it finds none, or English is not first", () => {
    expect(() => readLocales("export const LOCALES = [];")).toThrow();
    expect(() => readLocales('{ code: "de", hreflang: "de", ogLocale: "de_DE" }')).toThrow();
  });

  it("reads a language with a region, so pt-br and pt-BR agree", () => {
    const text = '{ code: "en", hreflang: "en", ogLocale: "en_US" },\n{ code: "pt-br", hreflang: "pt-BR", ogLocale: "pt_BR" }';
    expect(readLocales(text)).toEqual([
      { code: "en", hreflang: "en", ogLocale: "en_US" },
      { code: "pt-br", hreflang: "pt-BR", ogLocale: "pt_BR" },
    ]);
  });
});

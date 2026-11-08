import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMPARE_TOOLS } from "../data/compare";
import { FEATURE_PAGES } from "../data/features";
import { isTranslatedPath, readLocales, TRANSLATED_FIXED_PATHS as SCRIPT_FIXED } from "../../scripts/i18n-locales.mjs";
import { isTranslated } from "./paths";
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
      expect(l.code, "code").toMatch(/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/);
      expect(l.hreflang, "hreflang").toMatch(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);
      expect(l.ogLocale, "og:locale").toMatch(/^[a-z]{2,3}_[A-Z]{2}$/);
      expect(l.name.length, "name").toBeGreaterThan(1);
      expect(l.short, "short").toMatch(/^[A-Z]{2,3}$/);
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

  it("agrees with isTranslated on every page the site has, both ways", () => {
    // The script cannot read the slugs (it reads no .ts), so it accepts any features/<x>/ and compare/<x>/; check-site's
    // "language page with no English page" rule covers the gap. Over the pages that exist the two must say the same.
    const known = [...TRANSLATED_PATHS, "guide/", "guide/clean/", "blog/", "blog/introducing-cuepoint/", "changelog/", "contact/", "report-a-bug/", "privacy/", "terms/", "404.html"];
    for (const path of known) expect(isTranslatedPath(path), path).toBe(isTranslated(path));
    // and every path the script calls translated, among those, the registry calls translated too
    expect(known.filter((p) => isTranslatedPath(p)).sort()).toEqual([...TRANSLATED_PATHS].sort());
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

  it("reads the BCP 47 shapes the registry may use: a three-letter language, a script, a long region", () => {
    const text = '{ code: "fil", hreflang: "fil", ogLocale: "fil_PH" },\n{ code: "zh-hant-tw", hreflang: "zh-Hant-TW", ogLocale: "zh_TW" }';
    expect(readLocales(`{ code: "en", hreflang: "en", ogLocale: "en_US" },\n${text}`).map((l) => l.code)).toEqual(["en", "fil", "zh-hant-tw"]);
  });

  it("reads a language with a region, so pt-br and pt-BR agree", () => {
    const text = '{ code: "en", hreflang: "en", ogLocale: "en_US" },\n{ code: "pt-br", hreflang: "pt-BR", ogLocale: "pt_BR" }';
    expect(readLocales(text)).toEqual([
      { code: "en", hreflang: "en", ogLocale: "en_US" },
      { code: "pt-br", hreflang: "pt-BR", ogLocale: "pt_BR" },
    ]);
  });
});

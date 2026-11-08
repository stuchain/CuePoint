import { describe, expect, it } from "vitest";
import { LOCALES, OTHER_LOCALES } from "./locales";
import { alternatesFor, isTranslated, leavesLanguage, localeFromUrl, localePath, splitLocalePath, switchTargets } from "./paths";

describe("localePath", () => {
  it("leaves English at the root", () => {
    expect(localePath("en", "")).toBe("");
    expect(localePath("en", "features/")).toBe("features/");
    expect(localePath("en", "guide/clean/")).toBe("guide/clean/");
  });

  it("puts a translated page in the language's folder, with the English slug", () => {
    expect(localePath("de", "")).toBe("de/");
    expect(localePath("de", "features/")).toBe("de/features/");
    expect(localePath("de", "features/clean/")).toBe("de/features/clean/");
    expect(localePath("de", "compare/lexicon/")).toBe("de/compare/lexicon/");
    expect(localePath("de", "download/")).toBe("de/download/");
    expect(localePath("de", "faq/")).toBe("de/faq/");
  });

  it("gives the English page for a page that is not translated", () => {
    for (const path of ["guide/", "guide/clean/", "blog/", "blog/introducing-cuepoint/", "changelog/", "contact/", "report-a-bug/", "privacy/", "terms/", "404.html"]) {
      expect(localePath("de", path), path).toBe(path);
    }
  });

  it("accepts a leading slash and a missing trailing one", () => {
    expect(localePath("de", "/features/")).toBe("de/features/");
    expect(localePath("de", "features")).toBe("de/features/");
  });

  it("does not translate a page that merely starts like a translated one", () => {
    expect(localePath("de", "features/not-a-feature/")).toBe("features/not-a-feature/");
    expect(localePath("de", "compare/nobody/")).toBe("compare/nobody/");
  });
});

describe("isTranslated and leavesLanguage", () => {
  it("knows the translated pages", () => {
    expect(isTranslated("")).toBe(true);
    expect(isTranslated("features/keys/")).toBe(true);
    expect(isTranslated("blog/")).toBe(false);
  });

  it("says a link from a translated page to an English-only page leaves the language", () => {
    expect(leavesLanguage("de", "guide/")).toBe(true);
    expect(leavesLanguage("de", "features/")).toBe(false);
    expect(leavesLanguage("en", "guide/")).toBe(false);
  });
});

describe("alternatesFor", () => {
  it("lists every language and x-default (English) for a translated page", () => {
    expect(alternatesFor("features/")).toEqual([
      ...LOCALES.map((l) => ({ hreflang: l.hreflang, path: l.code === "en" ? "features/" : `${l.code}/features/` })),
      { hreflang: "x-default", path: "features/" },
    ]);
    expect(alternatesFor("")).toContainEqual({ hreflang: "de", path: "de/" });
  });

  it("lists none for a page that is not translated", () => {
    expect(alternatesFor("guide/")).toEqual([]);
    expect(alternatesFor("blog/introducing-cuepoint/")).toEqual([]);
  });

  it("has one entry for each registered language, so a new language needs no edit here", () => {
    const tags = alternatesFor("faq/").map((a) => a.hreflang);
    expect(tags).toHaveLength(OTHER_LOCALES.length + 2);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("splitLocalePath", () => {
  it("takes the language's folder off", () => {
    expect(splitLocalePath("de/features/clean/")).toEqual({ locale: "de", path: "features/clean/" });
    expect(splitLocalePath("de/")).toEqual({ locale: "de", path: "" });
    expect(splitLocalePath("features/")).toEqual({ locale: "en", path: "features/" });
    expect(splitLocalePath("")).toEqual({ locale: "en", path: "" });
  });

  it("does not take a folder that is not a language", () => {
    expect(splitLocalePath("deploy/")).toEqual({ locale: "en", path: "deploy/" });
  });
});

describe("localeFromUrl", () => {
  it("reads the language from the first segment after the base", () => {
    expect(localeFromUrl("/de/features/", "/")).toBe("de");
    expect(localeFromUrl("/de/", "/")).toBe("de");
    expect(localeFromUrl("/features/", "/")).toBe("en");
    expect(localeFromUrl("/", "/")).toBe("en");
    expect(localeFromUrl(new URL("https://usecuepoint.com/de/faq/"), "/")).toBe("de");
  });

  it("honors a base path", () => {
    expect(localeFromUrl("/CuePoint/de/features/", "/CuePoint/")).toBe("de");
    expect(localeFromUrl("/CuePoint/features/", "/CuePoint/")).toBe("en");
  });

  it("reads English for a page whose path only begins with letters like a language", () => {
    expect(localeFromUrl("/deploy/", "/")).toBe("en");
  });
});

describe("switchTargets", () => {
  it("links the same page in each language when the page is translated", () => {
    expect(switchTargets("features/keys/")).toEqual(
      LOCALES.map((l) => ({ code: l.code, path: l.code === "en" ? "features/keys/" : `${l.code}/features/keys/` })),
    );
  });

  it("links each language's home when the page is English only, and the page itself in English", () => {
    expect(switchTargets("guide/clean/")).toEqual(
      LOCALES.map((l) => ({ code: l.code, path: l.code === "en" ? "guide/clean/" : `${l.code}/` })),
    );
    expect(switchTargets("blog/")).toContainEqual({ code: "en", path: "blog/" });
  });

  it("points English at the home page from the 404 page, which is not an address of its own", () => {
    expect(switchTargets("404.html")).toContainEqual({ code: "en", path: "" });
    expect(switchTargets("404.html")).toContainEqual({ code: "de", path: "de/" });
  });
});

describe("a path with a query or a fragment", () => {
  it("keeps it, and still finds the page", () => {
    expect(localePath("de", "features/#top")).toBe("de/features/#top");
    expect(localePath("de", "/download?x=1")).toBe("de/download/?x=1");
    expect(localePath("de", "guide/clean/#steps")).toBe("guide/clean/#steps");
    expect(localePath("en", "faq#q-free")).toBe("faq/#q-free");
    expect(isTranslated("faq/#q-free")).toBe(true);
  });
});

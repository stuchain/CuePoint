import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { COMPARE_TOOLS as EN_COMPARE } from "../data/compare";
import { FEATURE_PAGES as EN_FEATURES, OVERVIEW as EN_OVERVIEW } from "../data/features";
import { APP_SHOTS as EN_SHOTS, FEATURES as EN_HOME_FEATURES, HERO as EN_HERO, OPENING_STEPS as EN_STEPS, TRUST as EN_TRUST } from "../data/home";
import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "../content/guide";
import { compareFor, featuresFor, homeFor } from "./content";
import { placeholdersOf } from "./format";
import { OTHER_LOCALES } from "./locales";
import { EXTERNAL_NAV, NAV } from "../data/nav";
import { PRIMARY_ACTION } from "../data/site";
import { LOCKED_WORDS, NOT_TEXT_KEYS, hasLocked, lostWords, sameOnPurpose } from "./locked";
import { en, NAV_KEYS, ui } from "./ui";

/**
 * Every translation has exactly the English structure (DEC-311), and nothing is left untranslated. The tests run
 * for every language in src/i18n/locales.ts, so a language added there is held to the same rules with no edit here.
 */

const SITE = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const TITLE_MAX = 60;

/** Every string leaf of a value, with its path: "download.notes.windows" -> text. Numbers and booleans are not strings. */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}

/** Every key path of a value, with the kind of its leaf: the shape a translation must keep. */
function shape(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return [`${path}: list of ${value.length}`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  return [`${path}: ${typeof value}`];
}

/** The markup a string carries besides its words: its link keys and how many bold runs it has. */
const markup = (text: string) => ({
  links: [...text.matchAll(/\]\(([\w-]+)\)/g)].map((m) => m[1]).sort(),
  bold: (text.match(/\*\*/g) ?? []).length,
});

const englishFaq = yaml.load(readFileSync(resolve(SITE, "src/content/faq.yaml"), "utf8")) as { id: string; order: number; question: string; answer: string; links: { page: string; heading?: string; label: string }[] }[];

for (const locale of OTHER_LOCALES) {
  const code = locale.code;
  const faqFile = resolve(SITE, `src/content/faq.${code}.yaml`);

  describe(`${code}: the UI strings`, () => {
    const t = ui(code);

    // a language's plural words: `other` always, `one` as English has it, and any of the CLDR forms its rule needs
    const EXTRA_PLURALS = /^downloadedTimes\.(zero|two|few|many): string$/;
    const english = new Map(leaves(en));
    const englishFor = (path: string) => english.get(path) ?? english.get(path.replace(/\.(zero|two|few|many)$/, ".other"));

    it("have exactly the English keys, in the same shape (a plural may add the CLDR forms its language needs)", () => {
      expect(shape(t).filter((line) => !EXTRA_PLURALS.test(line))).toEqual(shape(en));
    });

    it("keep every placeholder and every link and bold marker of the English string", () => {
      for (const [path, text] of leaves(t)) {
        const source = englishFor(path)!;
        expect(placeholdersOf(text), `${path} placeholders`).toEqual(placeholdersOf(source));
        expect(markup(text), `${path} markup`).toEqual(markup(source));
      }
    });

    it("say the count in every plural form", () => {
      for (const [path, text] of leaves(t.downloadedTimes)) expect(text, path).toContain("{count}");
    });
  });

  describe(`${code}: the page content`, () => {
    const home = homeFor(code);
    const features = featuresFor(code);
    const compare = compareFor(code);

    it("home: the same steps, pictures, features and trust claims, with the same non-text fields", () => {
      expect(home.OPENING_STEPS.map((s) => s.id)).toEqual(EN_STEPS.map((s) => s.id));
      expect(Object.keys(home.APP_SHOTS)).toEqual(Object.keys(EN_SHOTS));
      for (const [id, shot] of Object.entries(home.APP_SHOTS)) {
        expect({ width: shot.width, height: shot.height }, id).toEqual({ width: EN_SHOTS[id as keyof typeof EN_SHOTS].width, height: EN_SHOTS[id as keyof typeof EN_SHOTS].height });
      }
      expect(home.FEATURES.map((f) => [f.id, f.learnMore.path])).toEqual(EN_HOME_FEATURES.map((f) => [f.id, f.learnMore.path]));
      expect(home.TRUST.map((c) => [c.id, c.evidence])).toEqual(EN_TRUST.map((c) => [c.id, c.evidence]));
      expect(shape(home.HERO)).toEqual(shape(EN_HERO));
    });

    it("features: the same slugs in the same order, and the same non-text fields", () => {
      expect(features.FEATURE_PAGES.map((p) => p.slug)).toEqual(EN_FEATURES.map((p) => p.slug));
      for (const [i, page] of features.FEATURE_PAGES.entries()) {
        const english = EN_FEATURES[i]!;
        const label = page.slug;
        expect(page.shot, label).toBe(english.shot);
        expect(page.related, label).toEqual(english.related);
        expect(page.guide?.page, label).toBe(english.guide?.page);
        expect(page.unshipped, label).toEqual(english.unshipped);
        expect(page.fromDecisions, label).toEqual(english.fromDecisions);
        expect(page.problem.length, `${label} problem`).toBe(english.problem.length);
        expect(page.doesNot.length, `${label} doesNot`).toBe(english.doesNot.length);
        expect(page.how.map((h) => [h.paragraphs.length, h.unshipped]), `${label} sections`).toEqual(english.how.map((h) => [h.paragraphs.length, h.unshipped]));
      }
      expect(shape(features.OVERVIEW)).toEqual(shape(EN_OVERVIEW));
    });

    it("compare: the same tools, rows, sources and dates", () => {
      expect(compare.COMPARE_TOOLS.map((t) => t.slug)).toEqual(EN_COMPARE.map((t) => t.slug));
      for (const [i, tool] of compare.COMPARE_TOOLS.entries()) {
        const english = EN_COMPARE[i]!;
        const label = tool.slug;
        expect([tool.name, tool.maker, tool.hosts], label).toEqual([english.name, english.maker, english.hosts]);
        expect(tool.rows.map((r) => [r.other.source.url, r.other.checked]), `${label} rows`).toEqual(english.rows.map((r) => [r.other.source.url, r.other.checked]));
        expect(tool.cuepointDoesNot.length, `${label} cuepointDoesNot`).toBe(english.cuepointDoesNot.length);
      }
    });

    it("keeps the English limits: a title of 60 characters or fewer, a description of 70 to 160", () => {
      const pairs: [string, string, string][] = [
        ["home", home.HERO.title, home.HERO.description],
        ["features", features.OVERVIEW.title, features.OVERVIEW.description],
        ...features.FEATURE_PAGES.map((p): [string, string, string] => [p.slug, p.title, p.description]),
        ...compare.COMPARE_TOOLS.map((t): [string, string, string] => [t.slug, t.title, t.description]),
        ["compare index", ui(code).compare.pageTitle, ui(code).compare.pageDescription],
        ["faq", ui(code).faq.title, ui(code).faq.description],
        ["download", ui(code).download.titleWithVersion.replace("{version}", "1.0.0"), ui(code).download.descriptionRelease.replace("{version}", "1.0.0")],
        ["download (no release)", ui(code).download.title, ui(code).download.descriptionNone],
      ];
      for (const [label, title, description] of pairs) {
        expect(title.length, `${label} title`).toBeLessThanOrEqual(TITLE_MAX);
        expect(description.length, `${label} description`).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
        expect(description.length, `${label} description`).toBeLessThanOrEqual(DESCRIPTION_MAX);
      }
    });

    it("gives every page its own title and description", () => {
      const all = [
        home.HERO,
        features.OVERVIEW,
        ...features.FEATURE_PAGES,
        ...compare.COMPARE_TOOLS,
      ];
      expect(new Set(all.map((p) => p.title)).size).toBe(all.length);
      expect(new Set(all.map((p) => p.description)).size).toBe(all.length);
    });
  });

  describe(`${code}: the FAQ`, () => {
    const translated = yaml.load(readFileSync(faqFile, "utf8")) as typeof englishFaq;

    it("has the same questions in the same order, with the same guide links", () => {
      expect(translated.map((q) => [q.id, q.order])).toEqual(englishFaq.map((q) => [q.id, q.order]));
      for (const [i, q] of translated.entries()) {
        const english = englishFaq[i]!;
        expect(q.links.map((l) => [l.page, l.heading]), q.id).toEqual(english.links.map((l) => [l.page, l.heading]));
        expect(q.answer.split(/\n\s*\n/).length, `${q.id} paragraphs`).toBe(english.answer.split(/\n\s*\n/).length);
        expect(q.question.length, q.id).toBeGreaterThanOrEqual(8);
        expect(q.answer.length, q.id).toBeGreaterThanOrEqual(20);
      }
    });
  });

  describe(`${code}: nothing is left untranslated`, () => {
    /** Every [path, English, translation] where the two are the same string. */
    function same(english: unknown, translated: unknown): [string, string][] {
      const en = new Map(leaves(english));
      const allowed = sameOnPurpose(code);
      return leaves(translated).filter(
        ([path, text]) =>
          en.get(path) === text &&
          /\p{L}{2}/u.test(text) &&
          !allowed.has(text) &&
          !NOT_TEXT_KEYS.has(path.replace(/\[\d+\]$/, "").split(".").pop()!),
      );
    }

    it("the UI strings", () => {
      expect(same(en, ui(code))).toEqual([]);
    });

    it("the home page", () => {
      const h = homeFor(code);
      const strip = (x: { OPENING_STEPS: unknown; APP_SHOTS: unknown; FEATURES: unknown; TRUST: unknown; HERO: unknown }) => ({
        steps: x.OPENING_STEPS,
        shots: x.APP_SHOTS,
        features: x.FEATURES,
        trust: (x.TRUST as { id: string; title: string; text: string }[]).map(({ id, title, text }) => ({ id, title, text })),
        hero: x.HERO,
      });
      expect(same(strip({ OPENING_STEPS: EN_STEPS, APP_SHOTS: EN_SHOTS, FEATURES: EN_HOME_FEATURES, TRUST: EN_TRUST, HERO: EN_HERO }), strip(h))).toEqual([]);
    });

    it("the feature pages", () => {
      const f = featuresFor(code);
      expect(same({ o: EN_OVERVIEW, p: EN_FEATURES }, { o: f.OVERVIEW, p: f.FEATURE_PAGES })).toEqual([]);
    });

    it("the comparison pages", () => {
      const strip = (tools: readonly (typeof EN_COMPARE)[number][]) =>
        tools.map((t) => ({ ...t, hosts: [], rows: t.rows.map((r) => ({ topic: r.topic, other: r.other.text, label: r.other.source.label, cuepoint: r.cuepoint })) }));
      expect(same(strip(EN_COMPARE), strip(compareFor(code).COMPARE_TOOLS))).toEqual([]);
    });

    it("the FAQ", () => {
      const translated = yaml.load(readFileSync(faqFile, "utf8")) as typeof englishFaq;
      const text = (q: typeof englishFaq) => q.map((e) => ({ question: e.question, answer: e.answer, labels: e.links.map((l) => l.label) }));
      expect(same(text(englishFaq), text(translated))).toEqual([]);
    });
  });

  describe(`${code}: the locked words survive`, () => {
    /** [path, English, translation] for every string both languages have at the same path. */
    function pairs(english: unknown, translated: unknown): [string, string, string][] {
      const en = new Map(leaves(english));
      return leaves(translated).map(([path, text]) => [path, en.get(path) ?? "", text]);
    }

    function expectLocked(label: string, list: [string, string, string][]) {
      const lost: string[] = [];
      for (const [path, english, translated] of list) {
        for (const word of lostWords(english, translated)) lost.push(`${path}: "${word}" in "${translated}"`);
      }
      expect(lost, label).toEqual([]);
    }

    const trust = (list: readonly { id: string; title: string; text: string }[]) => list.map(({ id, title, text }) => ({ id, title, text }));
    const toolText = (tools: readonly (typeof EN_COMPARE)[number][]) =>
      tools.map((t) => ({ ...t, hosts: [], rows: t.rows.map((r) => ({ topic: r.topic, other: r.other.text, label: r.other.source.label, cuepoint: r.cuepoint })) }));

    it("in the UI strings", () => expectLocked("ui", pairs(en, ui(code))));
    it("in the page content", () => {
      const f = featuresFor(code);
      const c = compareFor(code);
      const h = homeFor(code);
      expectLocked("features", pairs({ p: EN_FEATURES, o: EN_OVERVIEW }, { p: f.FEATURE_PAGES, o: f.OVERVIEW }));
      expectLocked("compare", pairs(toolText(EN_COMPARE), toolText(c.COMPARE_TOOLS)));
      expectLocked(
        "home",
        pairs(
          { s: EN_STEPS, f: EN_HOME_FEATURES, h: EN_HERO, t: trust(EN_TRUST), a: EN_SHOTS },
          { s: h.OPENING_STEPS, f: h.FEATURES, h: h.HERO, t: trust(h.TRUST), a: h.APP_SHOTS },
        ),
      );
    });
    it("in the FAQ, its link labels included", () => {
      const translated = yaml.load(readFileSync(faqFile, "utf8")) as typeof englishFaq;
      const text = (q: typeof englishFaq) => q.map((e) => ({ question: e.question, answer: e.answer, labels: e.links.map((l) => l.label) }));
      expectLocked("faq", pairs(text(englishFaq), text(translated)));
    });
  });

  describe(`${code}: no email address anywhere`, () => {
    it("in any translated string", () => {
      const all = [
        ...leaves(ui(code)),
        ...leaves(homeFor(code)),
        ...leaves(featuresFor(code)),
        ...leaves(compareFor(code)),
        ["faq", readFileSync(faqFile, "utf8")] as [string, string],
      ];
      const found = all.filter(([, text]) => /[\w.+-]+@[\w-]+\.[a-z]{2,}|mailto:/i.test(text)).map(([path]) => path);
      expect(found).toEqual([]);
    });
  });
}

describe("the English UI strings", () => {
  it("say what the site always said", () => {
    expect(en.primaryAction).toBe("Get notified of 1.0");
    expect(en.footer.legalLine).toBe("© {year} {publisher}. {site} is free software for DJs.");
  });
});

describe("the lists the tests are held to (src/i18n/locked.ts)", () => {
  /** Every English string a translation is made from. */
  const english = () => [
    ...leaves(en),
    ...leaves({ o: EN_OVERVIEW, p: EN_FEATURES }),
    ...leaves({ s: EN_STEPS, f: EN_HOME_FEATURES, h: EN_HERO, t: EN_TRUST, a: EN_SHOTS }),
    ...leaves(EN_COMPARE.map((t) => ({ ...t, rows: t.rows.map((r) => ({ topic: r.topic, other: r.other.text, label: r.other.source.label, cuepoint: r.cuepoint })) }))),
    ...leaves(englishFaq.map((e) => ({ question: e.question, answer: e.answer, labels: e.links.map((l) => l.label) }))),
  ];

  it("hold only words the English sources use: a dead entry is dropped, and a new name is added first", () => {
    const text = english();
    const unused = LOCKED_WORDS.filter((l) => !text.some(([, t]) => hasLocked(l, t))).map((l) => l.word);
    expect(unused).toEqual([]);
  });

  it("match the forms the English really has, in any case where the word is a DJ word", () => {
    const find = (w: string) => LOCKED_WORDS.find((l) => l.word === w)!;
    expect(hasLocked(find("hot cue"), "Set Hot Cues and memory cues")).toBe(true);
    expect(hasLocked(find("hot cue"), "hotcues")).toBe(true);
    expect(hasLocked(find("beat grid"), "the Beatgrid is off")).toBe(true);
    expect(hasLocked(find("playlist"), "Your Playlists")).toBe(true);
    expect(hasLocked(find("playlist"), "Spielliste")).toBe(false);
    // an area name is the capitalized word only: the general noun is translated
    expect(hasLocked(find("Library"), "your library")).toBe(false);
    expect(hasLocked(find("Library"), "the Library tab")).toBe(true);
    expect(lostWords("Open Track details and a Smart Collection", "Öffne die Titeldetails")).toEqual(["Smart Collection", "Track details"]);
  });

  it("keep a real English phrase out of every language's allow-list", () => {
    for (const code of ["de", "es", "pt-br", "xx"]) {
      for (const phrase of ["The Library", "Waveforms and the player", "Export to Rekordbox", "Legal"]) expect(sameOnPurpose(code).has(phrase), `${code}: ${phrase}`).toBe(false);
    }
  });
});

describe("the English strings the site data also holds", () => {
  it("every link that leaves the site has its name in the UI strings", () => {
    for (const link of EXTERNAL_NAV) expect(en.external[link.id], link.id).toBe(link.label);
  });

  it("the English primary action is the one in data/site.ts", () => {
    expect(en.primaryAction).toBe(PRIMARY_ACTION.label);
  });

  it("every page in the nav has a UI string", () => {
    for (const item of NAV) {
      expect(NAV_KEYS[item.path], item.path).toBeDefined();
      expect(en.nav[NAV_KEYS[item.path] as keyof typeof en.nav], item.label).toBe(item.label);
    }
  });
});

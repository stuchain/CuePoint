import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ENGLISH_SOURCES, SOURCES_FILE, findStale, hashFile, main, readSources, recordSources } from "./i18n-stale.mjs";
import { readLocalesFile } from "./i18n-locales.mjs";

const made = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function put(root, file, text) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

/** A site folder with every English source and a German file for each. */
function site(withGerman = true) {
  const root = mkdtempSync(join(tmpdir(), "i18n-stale-"));
  made.push(root);
  for (const { source, translation } of ENGLISH_SOURCES) {
    put(root, source, `english of ${source}\n`);
    if (withGerman) put(root, translation("de"), `german of ${source}\n`);
  }
  return root;
}

const ALL = ENGLISH_SOURCES.map((s) => s.source);
const commitOf = (_root, source) => `commit-of-${source}`;
/** The sources object with every source recorded for the language. */
const recordedAll = (root, language = "de", sources) => recordSources(root, language, ALL, { today: "2026-11-08", commitOf, ...(sources ? { sources } : {}) }).sources;

describe("hashFile", () => {
  it("hashes the same text the same on every line-end style", () => {
    const root = site(false);
    put(root, "a.txt", "one\ntwo\n");
    put(root, "b.txt", "one\r\ntwo\r\n");
    expect(hashFile(join(root, "a.txt"))).toBe(hashFile(join(root, "b.txt")));
  });

  it("changes when the text changes", () => {
    const root = site(false);
    put(root, "a.txt", "one");
    put(root, "b.txt", "two");
    expect(hashFile(join(root, "a.txt"))).not.toBe(hashFile(join(root, "b.txt")));
  });
});

describe("findStale", () => {
  it("lists every source as unrecorded before anything is recorded", () => {
    const root = site();
    const found = findStale(root, ["de"]);
    expect(found).toHaveLength(ENGLISH_SOURCES.length);
    expect(found.every((f) => f.status === "unrecorded")).toBe(true);
  });

  it("is empty right after recording", () => {
    const root = site();
    expect(findStale(root, ["de"], recordedAll(root))).toEqual([]);
  });

  it("flags exactly the English file that changed", () => {
    const root = site();
    const sources = recordedAll(root);
    put(root, "src/data/features.ts", "english changed\n");
    const found = findStale(root, ["de"], sources);
    expect(found).toEqual([
      { language: "de", source: "src/data/features.ts", translation: "src/data/i18n/de/features.ts", status: "stale", commit: "commit-of-src/data/features.ts" },
    ]);
  });

  it("flags a missing translation file", () => {
    const root = site(false);
    const found = findStale(root, ["de"], { locales: {} });
    expect(found.every((f) => f.status === "no-translation")).toBe(true);
  });

  it("checks each language on its own", () => {
    const root = site();
    const sources = recordedAll(root);
    const found = findStale(root, ["de", "es"], sources);
    expect(found.filter((f) => f.language === "de")).toEqual([]);
    expect(found.filter((f) => f.language === "es").every((f) => f.status === "no-translation")).toBe(true);
  });
});

describe("recordSources", () => {
  it("records the named sources only, leaving the language's other records as they were", () => {
    const root = site();
    const first = recordedAll(root);
    put(root, "src/data/features.ts", "english changed\n");
    put(root, "src/data/home.ts", "english changed too\n");
    const { sources, cleared } = recordSources(root, "de", ["src/data/features.ts"], { today: "2026-11-09", commitOf, sources: first });
    expect(cleared).toEqual([{ source: "src/data/features.ts", was: "stale", commit: "commit-of-src/data/features.ts" }]);
    expect(sources.locales.de.files["src/data/features.ts"]).toEqual({ hash: hashFile(join(root, "src/data/features.ts")), commit: "commit-of-src/data/features.ts", recordedAt: "2026-11-09" });
    // home.ts changed too, but was not named: still stale
    expect(findStale(root, ["de"], sources).map((f) => f.source)).toEqual(["src/data/home.ts"]);
    expect(sources.locales.de.files["src/data/compare.ts"]).toEqual(first.locales.de.files["src/data/compare.ts"]);
  });

  it("says whether each named source was stale, unrecorded or already current", () => {
    const root = site();
    const first = recordSources(root, "de", ["src/data/home.ts"], { commitOf }).sources;
    put(root, "src/data/home.ts", "changed\n");
    const { cleared } = recordSources(root, "de", ["src/data/home.ts", "src/data/compare.ts", "src/data/features.ts"], { commitOf, sources: first });
    expect(cleared.map((c) => [c.source, c.was])).toEqual([
      ["src/data/home.ts", "stale"],
      ["src/data/features.ts", "unrecorded"],
      ["src/data/compare.ts", "unrecorded"],
    ]);
  });

  it("keeps other languages, sorted, and writes the commit and the day for each file", () => {
    const root = site();
    const { sources } = recordSources(root, "de", ["src/i18n/ui/en.ts"], { today: "2026-11-08", commitOf, sources: { locales: { es: { files: {} } } } });
    expect(Object.keys(sources.locales)).toEqual(["de", "es"]);
    expect(sources.locales.de.files["src/i18n/ui/en.ts"].recordedAt).toBe("2026-11-08");
  });

  it("refuses English, no source, a name that is not an English source, and a language without its file", () => {
    const root = site(false);
    expect(() => recordSources(root, "en", ALL)).toThrow(/source/);
    expect(() => recordSources(root, "de", [])).toThrow(/needs the source files/);
    expect(() => recordSources(root, "de", ["src/data/other.ts"])).toThrow(/not an English source/);
    expect(() => recordSources(root, "de", ALL, { commitOf })).toThrow(/write it before recording/);
  });

  it("names the English the commit of, in a git checkout, and refuses a source with uncommitted changes", async () => {
    const { execFileSync } = await import("node:child_process");
    const { gitCommitOf } = await import("./i18n-stale.mjs");
    const root = site();
    const git = (...a) => execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t.test", ...a], { encoding: "utf8" });
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "english");
    const head = git("rev-parse", "HEAD").trim();
    expect(gitCommitOf(root, "src/data/home.ts")).toBe(head);
    put(root, "src/data/home.ts", "edited, not committed\n");
    expect(() => gitCommitOf(root, "src/data/home.ts")).toThrow(/not committed/);
    expect(gitCommitOf(root, "src/data/compare.ts")).toBe(head);
    // outside a checkout there is nothing to name
    expect(gitCommitOf(mkdtempSync(join(tmpdir(), "no-git-")), "x.ts")).toBeNull();
  });
});

describe("main", () => {
  const run = (root, argv, extra = {}) => {
    const out = [];
    const err = [];
    const code = main(argv, { root, languages: ["en", "de", "es"], log: (l) => out.push(l), error: (l) => err.push(l), commitOf, today: "2026-11-08", ...extra });
    return { code, out: out.join("\n"), err: err.join("\n") };
  };
  const written = (root) => JSON.parse(readFileSync(join(root, SOURCES_FILE), "utf8"));

  it("lists the stale pairs with the diff to read, and exits 0; --strict exits 1", () => {
    const root = site();
    writeFileSync(join(root, SOURCES_FILE), JSON.stringify(recordedAll(root)));
    expect(run(root, []).out).toMatch(/de, es|no-translation|unrecorded/);
    put(root, "src/data/features.ts", "english changed\n");
    const listed = run(root, ["--strict"]);
    expect(listed.code).toBe(1);
    expect(listed.out).toContain("stale          de  src/data/features.ts");
    expect(listed.out).toContain("read: git diff commit-of- -- src/data/features.ts");
    expect(run(root, []).code).toBe(0);
  });

  it("exits 0 with --strict when everything is current", () => {
    const root = site();
    writeFileSync(join(root, SOURCES_FILE), JSON.stringify(recordedAll(root)));
    for (const l of ["es"]) for (const { source, translation } of ENGLISH_SOURCES) put(root, translation(l), `spanish of ${source}\n`);
    writeFileSync(join(root, SOURCES_FILE), JSON.stringify(recordedAll(root, "es", recordedAll(root))));
    const result = run(root, ["--strict"]);
    expect(result.out).toContain("up to date");
    expect(result.code).toBe(0);
  });

  it("--record writes only the named sources, prints what it cleared and exits 0", () => {
    const root = site();
    const result = run(root, ["--record", "de", "src/data/home.ts", "src/data/compare.ts"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("recorded de  src/data/home.ts  (was unrecorded");
    expect(result.out).toContain("still has 3 to look at");
    expect(Object.keys(written(root).locales.de.files).sort()).toEqual(["src/data/compare.ts", "src/data/home.ts"]);
  });

  it("--record <l> --all records every source", () => {
    const root = site();
    expect(run(root, ["--record", "de", "--all"]).code).toBe(0);
    expect(Object.keys(written(root).locales.de.files).sort()).toEqual([...ALL].sort());
  });

  it("rejects an unknown flag, a missing language, an unregistered language and an unknown source, and writes nothing", () => {
    const root = site();
    for (const argv of [["--bogus"], ["--strict", "extra"], ["--record"], ["--record", "--all"], ["--record", "fr", "src/data/home.ts"], ["--record", "de"], ["--record", "de", "nope.ts"], ["--record", "de", "--force", "src/data/home.ts"], ["--record", "en", "src/data/home.ts"], ["--record", "de", "--all", "src/data/home.ts"]]) {
      const result = run(root, argv);
      expect(result.code, argv.join(" ")).toBe(2);
      expect(result.err, argv.join(" ")).toContain("usage:");
    }
    expect(existsSync(join(root, SOURCES_FILE))).toBe(false);
  });

  it("does not record a source whose English has uncommitted changes, and writes nothing", () => {
    const root = site();
    const result = run(root, ["--record", "de", "src/data/home.ts"], { commitOf: () => { throw new Error("i18n-stale: src/data/home.ts has changes that are not committed"); } });
    expect(result.code).toBe(2);
    expect(result.err).toContain("not committed");
    expect(existsSync(join(root, SOURCES_FILE))).toBe(false);
  });
});

describe("readSources", () => {
  it("reads an absent file as no languages", () => {
    expect(readSources(site(false))).toEqual({ locales: {} });
  });

  it("reads the first format (hashes, one day per language) as files with no commit", () => {
    const root = site(false);
    put(root, SOURCES_FILE, JSON.stringify({ locales: { de: { recordedAt: "2026-11-08", hashes: { "src/data/home.ts": "abc" } } } }));
    expect(readSources(root).locales.de.files).toEqual({ "src/data/home.ts": { hash: "abc", commit: null, recordedAt: "2026-11-08" } });
  });
});

describe("the real sources.json and the loaders", () => {
  const SITE = join(import.meta.dirname, "..");
  const text = (file) => readFileSync(join(SITE, file), "utf8");

  it("records every language the site has, with every English source and a commit", () => {
    const real = readSources(SITE);
    const languages = readLocalesFile().map((l) => l.code).filter((c) => c !== "en");
    expect(Object.keys(real.locales).sort()).toEqual([...languages].sort());
    for (const language of languages) {
      expect(Object.keys(real.locales[language].files).sort(), language).toEqual([...ALL].sort());
      for (const [source, entry] of Object.entries(real.locales[language].files)) {
        expect(entry.hash, `${language} ${source}`).toMatch(/^[0-9a-f]{64}$/);
        expect(entry.commit, `${language} ${source}`).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it("lists every English file the loaders read, and only those (src/i18n/content.ts, faq-load.ts, ui/index.ts)", () => {
    const content = text("src/i18n/content.ts");
    // the English data modules content.ts imports, and the translation files it globs for
    const data = [...content.matchAll(/import \* as en\w+ from "\.\.\/data\/(\w+)"/g)].map((m) => `src/data/${m[1]}.ts`);
    const globbed = [...content.matchAll(/import\.meta\.glob<[^>]*>\("\.\.\/data\/i18n\/\*\/(\w+)\.ts"/g)].map((m) => m[1]);
    expect(data.length).toBeGreaterThan(0);
    expect(data.map((d) => d.replace(/^src\/data\/(\w+)\.ts$/, "$1")).sort()).toEqual([...globbed].sort());
    // the FAQ collection's file, and the UI strings' English module
    const faq = [...text("src/content.config.ts").matchAll(/file\("(src\/content\/faq\.yaml)"\)/g)].map((m) => m[1]);
    const ui = [...text("src/i18n/ui/index.ts").matchAll(/import \{ en[ ,][^}]*\} from "\.\/en"/g)].length > 0 ? ["src/i18n/ui/en.ts"] : [];
    const loaded = [...data, ...faq, ...ui].sort();
    expect(loaded).toEqual(ALL.slice().sort());
    // each source's translation file is the one the loader looks for
    for (const { source, translation } of ENGLISH_SOURCES) {
      const name = source.match(/src\/data\/(\w+)\.ts$/)?.[1];
      if (name) expect(translation("xx")).toBe(`src/data/i18n/xx/${name}.ts`);
    }
    expect(text("src/i18n/faq-load.ts")).toContain("../content/faq.*.yaml");
    expect(text("src/i18n/ui/index.ts")).toContain('"./*.ts"');
  });
});

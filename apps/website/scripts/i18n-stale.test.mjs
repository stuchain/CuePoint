import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ENGLISH_SOURCES, findStale, hashFile, readSources, recordLanguage } from "./i18n-stale.mjs";

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
    expect(findStale(root, ["de"], recordLanguage(root, "de", "2026-11-08"))).toEqual([]);
  });

  it("flags exactly the English file that changed", () => {
    const root = site();
    const sources = recordLanguage(root, "de", "2026-11-08");
    put(root, "src/data/features.ts", "english changed\n");
    const found = findStale(root, ["de"], sources);
    expect(found).toEqual([
      { language: "de", source: "src/data/features.ts", translation: "src/data/i18n/de/features.ts", status: "stale" },
    ]);
  });

  it("flags a missing translation file", () => {
    const root = site(false);
    const found = findStale(root, ["de"], { locales: {} });
    expect(found.every((f) => f.status === "no-translation")).toBe(true);
  });

  it("checks each language on its own", () => {
    const root = site();
    const sources = recordLanguage(root, "de", "2026-11-08");
    const found = findStale(root, ["de", "es"], sources);
    expect(found.filter((f) => f.language === "de")).toEqual([]);
    expect(found.filter((f) => f.language === "es").every((f) => f.status === "no-translation")).toBe(true);
  });
});

describe("recordLanguage", () => {
  it("writes the date and one hash per English source, keeping other languages", () => {
    const root = site();
    const first = recordLanguage(root, "de", "2026-11-08", { locales: { es: { recordedAt: "x", hashes: {} } } });
    expect(Object.keys(first.locales)).toEqual(["de", "es"]);
    expect(first.locales.de.recordedAt).toBe("2026-11-08");
    expect(Object.keys(first.locales.de.hashes).sort()).toEqual(ENGLISH_SOURCES.map((s) => s.source).sort());
  });

  it("refuses English and a language without its files", () => {
    const root = site(false);
    expect(() => recordLanguage(root, "en")).toThrow(/source/);
    expect(() => recordLanguage(root, "de")).toThrow(/write it before recording/);
  });
});

describe("readSources", () => {
  it("reads an absent file as no languages", () => {
    expect(readSources(site(false))).toEqual({ locales: {} });
  });
});

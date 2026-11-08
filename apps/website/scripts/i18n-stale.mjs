#!/usr/bin/env node
/**
 * Which translations have gone stale (DEC-311): `npm run i18n:stale`.
 *
 * src/i18n/sources.json holds, for each language, the sha256 of each English source file it was translated
 * from. This script hashes the English files as they are now and lists every language/file pair whose hash
 * differs: those translations may say something the English no longer says.
 *
 *   node scripts/i18n-stale.mjs                lists the stale pairs; always exits 0 (the build never fails on stale)
 *   node scripts/i18n-stale.mjs --strict       the same, and exits 1 when anything is stale or unrecorded
 *   node scripts/i18n-stale.mjs --record <l>   after you refreshed language <l>'s files: writes today's hashes for it
 *
 * The English sources, and the translation file each one has in a language <l>:
 *   src/data/home.ts       -> src/data/i18n/<l>/home.ts
 *   src/data/features.ts   -> src/data/i18n/<l>/features.ts
 *   src/data/compare.ts    -> src/data/i18n/<l>/compare.ts
 *   src/content/faq.yaml   -> src/content/faq.<l>.yaml
 *   src/i18n/ui/en.ts      -> src/i18n/ui/<l>.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_LOCALE, readLocalesFile } from "./i18n-locales.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/** Every English source, and where a language's translation of it lives. */
export const ENGLISH_SOURCES = [
  { source: "src/data/home.ts", translation: (l) => `src/data/i18n/${l}/home.ts` },
  { source: "src/data/features.ts", translation: (l) => `src/data/i18n/${l}/features.ts` },
  { source: "src/data/compare.ts", translation: (l) => `src/data/i18n/${l}/compare.ts` },
  { source: "src/content/faq.yaml", translation: (l) => `src/content/faq.${l}.yaml` },
  { source: "src/i18n/ui/en.ts", translation: (l) => `src/i18n/ui/${l}.ts` },
];

export const SOURCES_FILE = "src/i18n/sources.json";

/** sha256 (hex) of a file's text with its line ends made LF, so a checkout on Windows hashes the same. */
export function hashFile(path) {
  return createHash("sha256").update(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).digest("hex");
}

export function readSources(root = ROOT) {
  const path = join(root, SOURCES_FILE);
  if (!existsSync(path)) return { locales: {} };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return { ...parsed, locales: parsed.locales ?? {} };
}

/**
 * Every language/file pair that needs attention, in language then file order:
 * - `stale`: the English file's hash is not the recorded one (it changed since the translation was made);
 * - `unrecorded`: the language has no recorded hash for the file;
 * - `no-translation`: the language's translation file does not exist.
 * @param {string} root the website folder
 * @param {string[]} languages the language codes to check (English excluded)
 */
export function findStale(root, languages, sources = readSources(root)) {
  const out = [];
  for (const language of languages) {
    const recorded = sources.locales[language]?.hashes ?? {};
    for (const { source, translation } of ENGLISH_SOURCES) {
      const file = translation(language);
      if (!existsSync(join(root, file))) {
        out.push({ language, source, translation: file, status: "no-translation" });
      } else if (recorded[source] === undefined) {
        out.push({ language, source, translation: file, status: "unrecorded" });
      } else if (recorded[source] !== hashFile(join(root, source))) {
        out.push({ language, source, translation: file, status: "stale" });
      }
    }
  }
  return out;
}

/** The sources object with `language`'s hashes set to the English files' hashes now. Throws if a translation file is missing. */
export function recordLanguage(root, language, today = new Date().toISOString().slice(0, 10), sources = readSources(root)) {
  if (language === DEFAULT_LOCALE) throw new Error("i18n-stale: English is the source, there is nothing to record for it");
  const hashes = {};
  for (const { source, translation } of ENGLISH_SOURCES) {
    const file = translation(language);
    if (!existsSync(join(root, file))) throw new Error(`i18n-stale: ${language} has no ${file}; write it before recording`);
    hashes[source] = hashFile(join(root, source));
  }
  const languages = { ...sources.locales, [language]: { recordedAt: today, hashes } };
  const sorted = Object.fromEntries(Object.keys(languages).sort().map((k) => [k, languages[k]]));
  return { ...sources, locales: sorted };
}

function main(argv) {
  const strict = argv.includes("--strict");
  const recordAt = argv.indexOf("--record");
  if (recordAt !== -1) {
    const language = argv[recordAt + 1];
    if (!language || language.startsWith("--")) {
      console.error("i18n-stale: --record needs a language code, for example: --record de");
      return 2;
    }
    const known = readLocalesFile().map((l) => l.code);
    if (!known.includes(language)) {
      console.error(`i18n-stale: "${language}" is not in src/i18n/locales.ts (${known.join(", ")})`);
      return 2;
    }
    try {
      const next = recordLanguage(ROOT, language);
      writeFileSync(join(ROOT, SOURCES_FILE), `${JSON.stringify(next, null, 2)}\n`);
    } catch (error) {
      console.error(error.message);
      return 2;
    }
    console.log(`i18n-stale: recorded the English sources for ${language}.`);
    return 0;
  }
  const languages = readLocalesFile()
    .map((l) => l.code)
    .filter((c) => c !== DEFAULT_LOCALE);
  const stale = findStale(ROOT, languages);
  if (stale.length === 0) {
    console.log(`i18n-stale: ${languages.join(", ") || "no languages"} up to date.`);
    return 0;
  }
  for (const s of stale) console.log(`${s.status.padEnd(14)} ${s.language}  ${s.source}  (translation: ${s.translation})`);
  console.log(`\ni18n-stale: ${stale.length} pair${stale.length === 1 ? "" : "s"} to look at. Refresh the translation, run the checks, then: node scripts/i18n-stale.mjs --record <language>`);
  return strict ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));

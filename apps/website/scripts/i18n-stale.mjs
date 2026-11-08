#!/usr/bin/env node
/**
 * Which translations have gone stale (DEC-312): `npm run i18n:stale`.
 *
 * src/i18n/sources.json holds, for each language and each English source file it was translated from, the sha256
 * of the file, the git commit the English was at, and the day it was recorded. This script hashes the English files
 * as they are now and lists every language/file pair whose hash differs: those translations may say something the
 * English no longer says. For a stale pair it prints the diff to read: `git diff <recorded commit> -- <source>`.
 *
 *   node scripts/i18n-stale.mjs                         lists the stale pairs; always exits 0 (the build never fails on stale)
 *   node scripts/i18n-stale.mjs --strict                the same, and exits 1 when anything is stale or unrecorded
 *   node scripts/i18n-stale.mjs --record <l> <source>…  after you carried the named English files into language <l>:
 *                                                       records those files only, and prints what it cleared
 *   node scripts/i18n-stale.mjs --record <l> --all      the same for every source (a language that was just added)
 *
 * Anything else (an unknown flag, a language that is not registered, a source that is not one of the English
 * sources) exits 2 and writes nothing. A source with uncommitted changes is not recorded: the commit is what the
 * next reader diffs from, so commit the English first.
 *
 * The English sources, and the translation file each one has in a language <l>:
 *   src/data/home.ts       -> src/data/i18n/<l>/home.ts
 *   src/data/features.ts   -> src/data/i18n/<l>/features.ts
 *   src/data/compare.ts    -> src/data/i18n/<l>/compare.ts
 *   src/content/faq.yaml   -> src/content/faq.<l>.yaml
 *   src/i18n/ui/en.ts      -> src/i18n/ui/<l>.ts   (the frame, the cookie notice, the labels, the download page's words)
 * Every English string the translated pages show is in one of these files; scripts/i18n-stale.test.mjs holds the
 * list to the loaders (src/i18n/content.ts, faq-load.ts, ui/index.ts).
 */
import { execFileSync } from "node:child_process";
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

/**
 * The sources file: { locales: { <l>: { files: { <source>: { hash, commit, recordedAt } } } } }. The first format
 * (`hashes` and one `recordedAt` per language, no commit) is read as the same thing with `commit: null`.
 */
export function readSources(root = ROOT) {
  const path = join(root, SOURCES_FILE);
  if (!existsSync(path)) return { locales: {} };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const locales = {};
  for (const [language, entry] of Object.entries(parsed.locales ?? {})) {
    if (entry.files) locales[language] = { files: entry.files };
    else {
      locales[language] = {
        files: Object.fromEntries(Object.entries(entry.hashes ?? {}).map(([source, hash]) => [source, { hash, commit: null, recordedAt: entry.recordedAt ?? null }])),
      };
    }
  }
  return { ...parsed, locales };
}

/**
 * Every language/file pair that needs attention, in language then file order:
 * - `stale`: the English file's hash is not the recorded one (it changed since the translation was made);
 * - `unrecorded`: the language has no recorded hash for the file;
 * - `no-translation`: the language's translation file does not exist.
 * A pair also carries `commit`, the commit its English was recorded at (null when none is known).
 * @param {string} root the website folder
 * @param {string[]} languages the language codes to check (English excluded)
 */
export function findStale(root, languages, sources = readSources(root)) {
  const out = [];
  for (const language of languages) {
    const recorded = sources.locales[language]?.files ?? {};
    for (const { source, translation } of ENGLISH_SOURCES) {
      const file = translation(language);
      const commit = recorded[source]?.commit ?? null;
      if (!existsSync(join(root, file))) {
        out.push({ language, source, translation: file, status: "no-translation", commit });
      } else if (recorded[source] === undefined) {
        out.push({ language, source, translation: file, status: "unrecorded", commit });
      } else if (recorded[source].hash !== hashFile(join(root, source))) {
        out.push({ language, source, translation: file, status: "stale", commit });
      }
    }
  }
  return out;
}

/**
 * The commit a source is at, for the record: the last commit that touched it. Throws when the file has changes
 * that are not committed (the recorded commit would not be the English that was translated); null outside a git checkout.
 */
export function gitCommitOf(root, source) {
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    git("rev-parse", "--is-inside-work-tree");
  } catch {
    return null;
  }
  if (git("status", "--porcelain", "--", source) !== "") throw new Error(`i18n-stale: ${source} has changes that are not committed; commit the English first, so the record names the commit to diff from`);
  return git("log", "-1", "--format=%H", "--", source) || null;
}

/**
 * The sources object with the named English `names` recorded for `language`, and what that cleared. Only the named
 * files change; the language's other records stay as they were. Throws for English, a name that is not an English
 * source, and a language that has no translation file for a named source.
 * @returns {{ sources: object, cleared: { source: string, was: "stale" | "unrecorded" | "current", commit: string | null }[] }}
 */
export function recordSources(root, language, names, { today = new Date().toISOString().slice(0, 10), sources = readSources(root), commitOf = gitCommitOf } = {}) {
  if (language === DEFAULT_LOCALE) throw new Error("i18n-stale: English is the source, there is nothing to record for it");
  if (names.length === 0) throw new Error("i18n-stale: --record needs the source files you carried over (or --all), for example: --record de src/data/home.ts");
  const unknown = names.filter((n) => !ENGLISH_SOURCES.some((s) => s.source === n));
  if (unknown.length > 0) throw new Error(`i18n-stale: not an English source: ${unknown.join(", ")} (${ENGLISH_SOURCES.map((s) => s.source).join(", ")})`);
  const files = { ...(sources.locales[language]?.files ?? {}) };
  const cleared = [];
  for (const { source, translation } of ENGLISH_SOURCES.filter((s) => names.includes(s.source))) {
    const file = translation(language);
    if (!existsSync(join(root, file))) throw new Error(`i18n-stale: ${language} has no ${file}; write it before recording`);
    const hash = hashFile(join(root, source));
    const was = files[source] === undefined ? "unrecorded" : files[source].hash === hash ? "current" : "stale";
    const commit = commitOf(root, source);
    files[source] = { hash, commit, recordedAt: today };
    cleared.push({ source, was, commit });
  }
  const languages = { ...sources.locales, [language]: { files } };
  const sorted = Object.fromEntries(Object.keys(languages).sort().map((k) => [k, languages[k]]));
  return { sources: { ...sources, locales: sorted }, cleared };
}

const USAGE = "usage: i18n-stale [--strict] | --record <language> (<source>… | --all)";

/**
 * The command. Returns the exit code: 0 fine, 1 stale under --strict, 2 for a bad call (nothing is written).
 * @param {string[]} argv
 * @param {{ root?: string, languages?: string[], log?: (line: string) => void, error?: (line: string) => void, commitOf?: typeof gitCommitOf, today?: string }} [env]
 */
export function main(argv, env = {}) {
  const { root = ROOT, log = console.log, error = console.error, commitOf = gitCommitOf, today } = env;
  const known = env.languages ?? readLocalesFile().map((l) => l.code);
  const bad = (message) => {
    error(`${message}\n${USAGE}`);
    return 2;
  };
  const recordAt = argv.indexOf("--record");
  if (recordAt === -1) {
    const unknown = argv.filter((a) => a !== "--strict");
    if (unknown.length > 0) return bad(`i18n-stale: unknown argument ${unknown.map((a) => `"${a}"`).join(", ")}`);
    const strict = argv.includes("--strict");
    const languages = known.filter((c) => c !== DEFAULT_LOCALE);
    const stale = findStale(root, languages);
    if (stale.length === 0) {
      log(`i18n-stale: ${languages.join(", ") || "no languages"} up to date.`);
      return 0;
    }
    for (const s of stale) {
      const hint = s.status === "stale" && s.commit ? `  read: git diff ${s.commit.slice(0, 10)} -- ${s.source}` : "";
      log(`${s.status.padEnd(14)} ${s.language}  ${s.source}  (translation: ${s.translation})${hint}`);
    }
    log(`\ni18n-stale: ${stale.length} pair${stale.length === 1 ? "" : "s"} to look at. Refresh the translation, run the checks (docs/translation.md), then: node scripts/i18n-stale.mjs --record <language> <source>…`);
    return strict ? 1 : 0;
  }
  const rest = [...argv.slice(0, recordAt), ...argv.slice(recordAt + 1)];
  const language = rest[0];
  if (!language || language.startsWith("--")) return bad("i18n-stale: --record needs a language code, for example: --record de src/data/home.ts");
  if (!known.includes(language)) return bad(`i18n-stale: "${language}" is not in src/i18n/locales.ts (${known.join(", ")})`);
  const args = rest.slice(1);
  const flags = args.filter((a) => a.startsWith("--"));
  if (flags.some((f) => f !== "--all")) return bad(`i18n-stale: unknown argument ${flags.filter((f) => f !== "--all").map((a) => `"${a}"`).join(", ")}`);
  const all = flags.includes("--all");
  const names = all ? ENGLISH_SOURCES.map((s) => s.source) : args.filter((a) => !a.startsWith("--"));
  if (all && args.some((a) => !a.startsWith("--"))) return bad("i18n-stale: name the sources or give --all, not both");
  try {
    const { sources, cleared } = recordSources(root, language, names, { sources: readSources(root), commitOf, ...(today ? { today } : {}) });
    writeFileSync(join(root, SOURCES_FILE), `${JSON.stringify(sources, null, 2)}\n`);
    for (const c of cleared) log(`recorded ${language}  ${c.source}  (was ${c.was}${c.commit ? `, English at ${c.commit.slice(0, 10)}` : ""})`);
    const left = findStale(root, known.filter((c) => c !== DEFAULT_LOCALE)).filter((s) => s.language === language);
    log(left.length === 0 ? `i18n-stale: ${language} is up to date.` : `i18n-stale: ${language} still has ${left.length} to look at: ${left.map((s) => s.source).join(", ")}`);
    return 0;
  } catch (e) {
    return bad(e.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));

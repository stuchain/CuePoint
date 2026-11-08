/**
 * The three lists the translation tests are held to (docs/translation.md, "Words that stay English"). They are the
 * only place the lists live: the doc points here and `src/i18n/parity.test.ts` imports them. A translator or the
 * weekly routine never edits them to make a translation pass; the translation is what changes.
 */

export interface LockedWord {
  readonly word: string;
  /**
   * `exact`: a product, area or button name, written with its capital as the app writes it ("Library", the area; the
   * general noun "library" is translated). `any`: a DJ word, kept in any case and as a plural, and a space or hyphen
   * inside it may be missing ("beat grid", "Beatgrid", "Hot Cues").
   */
  readonly case: "exact" | "any";
}

const exact = (...words: string[]): LockedWord[] => words.map((word) => ({ word, case: "exact" }));
const any = (...words: string[]): LockedWord[] => words.map((word) => ({ word, case: "any" }));

/**
 * Words that stay English in every language. A translation of a string that has one in English must have it too.
 * Every entry occurs in the English sources (a test checks it), so a name the pages start to use is added here first.
 */
export const LOCKED_WORDS: readonly LockedWord[] = [
  ...exact(
    // product and file names
    "CuePoint", "Rekordbox", "Beatport", "Camelot", "GitHub", "AppImage", "XML", "M3U8", "CSV", "SHA-256", "BPM",
    // the app's areas
    "Clean", "Library", "Keys", "Discover", "Prepare", "Statistics", "Waveforms",
    // the app's views and buttons, as the page uses them ("Save to files", "Mark OK", "Undo" are added the day a page says them)
    "Smart Collection", "Track details",
  ),
  // DJ words DJs use in English
  ...any("playlist", "hot cue", "beat grid"),
];

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether `text` has the locked word as a whole word (see LockedWord.case). */
export function hasLocked(locked: LockedWord, text: string): boolean {
  const body = locked.case === "any" ? `${escape(locked.word).replace(/ /g, "[ \\u00a0-]?")}s?` : escape(locked.word);
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, locked.case === "any" ? "iu" : "u").test(text);
}

/** The locked words an English string has and its translation has lost. */
export function lostWords(english: string, translated: string): string[] {
  return LOCKED_WORDS.filter((l) => hasLocked(l, english) && !hasLocked(l, translated)).map((l) => l.word);
}

/**
 * Strings that are the same in English and in a language on purpose: names and codes a reader sees the same in
 * that language. Anything else that equals its English source is untranslated. A real English phrase never goes
 * here ("The Library", "Export to Rekordbox"): it is translated around its locked word ("Library"). Each language
 * has its own list, because the same word is a name in one language and a lazy copy in another.
 */
const EVERYWHERE = [
  // the areas that are one word
  "Clean", "Keys", "Discover", "Prepare", "Statistics",
  // names
  "Windows", "Mac", "Linux", "Lexicon", "Mixed In Key", "OpenKeyScan", "GitHub", "Open Source", "FAQ", "Blog",
  // a version label has no words
  "Version {version}",
];

export const SAME_ON_PURPOSE: Readonly<Record<string, ReadonlySet<string>>> = {
  de: new Set([...EVERYWHERE, "Download", "Mac, Intel", "Energy", "Offline"]),
  es: new Set([...EVERYWHERE, "Mac, Intel", "Energy", "Offline"]),
  "pt-br": new Set([...EVERYWHERE, "Menu", "Energy", "Offline"]),
};

/** The allow-list of a language; a language with no entry of its own gets the names every language shares. */
export const sameOnPurpose = (code: string): ReadonlySet<string> => SAME_ON_PURPOSE[code] ?? new Set(EVERYWHERE);

/** The keys that hold an id, an address or a reference and not words: they are the same in every language. */
export const NOT_TEXT_KEYS: ReadonlySet<string> = new Set([
  "id", "slug", "shot", "page", "path", "url", "file", "phrase", "step", "checked", "maker", "name", "related", "fromDecisions", "hosts",
]);

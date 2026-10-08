/**
 * Rekordbox's key is not the key (PAGES-15, DEC-201).
 *
 * A track's key is the user's correction, else its accepted Beatport match's,
 * and the engine sends it as `effective_key`. A row's plain `key` is still the
 * value Rekordbox imported, so a read of it that is drawn or used as the track's
 * key would bring the old key back. This fails on a new such read, and on any
 * `?? x.key` fallback, so one cannot arrive by mistake.
 */
import { describe, expect, it } from "vitest";

const SOURCES = import.meta.glob<string>(["./**/*.{ts,tsx}", "!./**/*.d.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Non-test sources, as `screens/library/x.ts` without the leading `./`. */
const FILES = Object.entries(SOURCES)
  .map(([path, source]) => [path.replace(/^\.\//, ""), source] as const)
  .filter(([path]) => !/\.(test|stories)\.tsx?$/.test(path));

/** `x.key` on the names a track or a table row goes by. */
const KEY_READ = /\b(?:track|tracks?\[[^\]]*\]|row|t|item|seed|entry\.track|libraryTrack|payload\.track)\??\.key\b/;
/** `?? x.key` and `x.key ??`: the imported key as a fallback or a default. */
const KEY_FALLBACK = /\?\?\s*[A-Za-z_][\w.?[\]]*\.key\b|[A-Za-z_][\w.?[\]]*\.key\s*\?\?/;

/** Files that may read a plain `.key`, and why that is not Rekordbox's key as the track's. */
const ALLOWED: Readonly<Record<string, string>> = {
  "components/player/playerFormat.ts": "the queue item's key, which the engine resolved",
  "screens/clean/comparison.ts": "Review's Rekordbox side, labeled 'not used'",
  "screens/discover/beatportKey.ts": "a Beatport track's own key, read as Camelot",
  "screens/library/CollectionsPane.tsx": "a tree row's key, not a track's",
  "screens/library/PaneTree.tsx": "a tree row's key, not a track's",
  "screens/library/TrackDetailPanel.tsx": "Rekordbox's value, labeled 'Key (not used)'",
  "screens/library/libraryClean.ts": "importedText, the value the mark's tooltip says is not used",
};

describe("keyReaders", () => {
  it("finds the sources it scans", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it("has no `?? track.key` fallback to the imported key", () => {
    const found = FILES.filter(([path, source]) => {
      return source.split("\n").some((line) => KEY_FALLBACK.test(line) && !ALLOWED[path]);
    }).map(([path]) => path);
    expect(found).toEqual([]);
  });

  it("reads a track's plain `.key` only where the allow-list says why", () => {
    const found = FILES.filter(([path, source]) => KEY_READ.test(source) && !ALLOWED[path]).map(
      ([path]) => path,
    );
    expect(found).toEqual([]);
  });

  it("keeps the allow-list honest: every entry still reads one", () => {
    const stale = Object.keys(ALLOWED).filter((path) => {
      const source = FILES.find(([name]) => name === path)?.[1];
      return source === undefined || !KEY_READ.test(source);
    });
    expect(stale).toEqual([]);
  });
});

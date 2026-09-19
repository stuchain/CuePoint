/**
 * inKey, Results and past searches are gone, and stay gone (CLEAN-14, DEC-071).
 *
 * The build already fails on an import of a deleted file. This records the
 * search the retirement was made against, so a later change that brings one of
 * these back — a copied file, a new import of an old name, a call to a bridge
 * method the engine no longer answers — fails here with the name it used.
 */
import { describe, expect, it } from "vitest";

const SOURCES = import.meta.glob<string>(["./**/*.{ts,tsx}", "!./**/*.d.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Every module the retirement removed, by file name without its extension. */
const RETIRED_MODULES = [
  "InKeyMainScreen",
  "ResultsScreen",
  "PastSearchesPanel",
  "BatchPlaylistPicker",
  "ResultsTable",
  "resultsTableLayout",
  "useResultsFrameLayout",
  "CandidateDialog",
  "ExportResultsModal",
  "SyncTagsDialog",
  "SyncCompleteDialog",
  "RunSummaryDialog",
  "PlaylistExportInstructionsDialog",
  "MatchResultsContext",
  "useMatchJob",
  "usePastSearches",
  "useSyncTags",
  "useExportResults",
  "useXmlPlaylists",
  "candidateUtils",
  "matchJobUtils",
  "reviewUtils",
  "runSummaryUtils",
  "syncTagsUtils",
  "resultsColumns",
  "fixtures",
  "types",
];

/** Bridge methods whose engine routes were removed with them. */
const RETIRED_BRIDGE_METHODS = [
  "startMatchJob",
  "exportResults",
  "getHistoryRecent",
  "loadHistoryCsv",
  "getXmlPlaylists",
  "syncTags",
  "openCsvFileDialog",
  "openM3uFileDialog",
];

const THIS_FILE = "./retiredModules.test.ts";

/** `./api/candidateUtils.test.ts` → `candidateUtils`. */
function baseName(path: string): string {
  const last = path.split("/").pop() ?? path;
  return last.replace(/\.tsx?$/, "").replace(/\.(test|stories)$/, "");
}

function importsOf(source: string): string[] {
  return [
    ...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
  ].map((match) => match[1]!);
}

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the retired match screens (CLEAN-14)", () => {
  it("found the renderer's sources to search", () => {
    // A glob that matched nothing would pass every check below.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(Object.keys(SOURCES)).toContain("./App.tsx");
  });

  it("leaves no file by a retired module's name", () => {
    const left = Object.keys(SOURCES).filter((path) => {
      // `types` and `fixtures` were only retired from `mocks/`.
      if (/\/(types|fixtures)\.tsx?$/.test(path)) return path.startsWith("./mocks/");
      return RETIRED_MODULES.includes(baseName(path));
    });
    expect(left).toEqual([]);
  });

  it("imports no retired module anywhere", () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(SOURCES)) {
      if (path === THIS_FILE) continue;
      for (const specifier of importsOf(source)) {
        const target = specifier.split("/").pop()!.replace(/\?raw$/, "").replace(/\.(tsx?|css)$/, "");
        const mocks = specifier.includes("mocks/");
        if (mocks || (RETIRED_MODULES.includes(target) && !/^(types|fixtures)$/.test(target))) {
          offenders.push(`${path} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("calls no bridge method the engine stopped answering", () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(SOURCES)) {
      if (path === THIS_FILE) continue;
      const code = codeOnly(source);
      for (const method of RETIRED_BRIDGE_METHODS) {
        if (new RegExp(`\b${method}\b`).test(code)) offenders.push(`${path}: ${method}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

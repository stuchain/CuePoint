/**
 * The desktop contract does not drift.
 *
 * A feature that crosses the engine boundary has to move six files together:
 * the Python handler, `engineClient.ts`, **`engineSupervisor.ts`**, `main.ts`,
 * the runtime `preload.cjs` and these bridge types. Forgetting one is silent —
 * the renderer type-checks against a method nothing exposes, and it fails only
 * at runtime, in the packaged app, as `undefined is not a function`.
 *
 * The supervisor is the one that actually bit: `main.ts` calls `engine.X()` on
 * an `EngineSupervisor` facade, which forwards to `EngineClient` method by
 * method. Adding the client method and the IPC channel is not enough, and
 * nothing type-checks the gap because `main.ts` compiles against whatever the
 * supervisor happens to have.
 *
 * `preload.cjs` is what actually loads.
 */
import { describe, expect, it } from "vitest";

// Read as text through Vite rather than `node:fs`: the renderer deliberately
// has no Node types, because renderer code must not reach for Node APIs, and
// adding them for one test would remove the compiler's ability to say so.
import preloadSource from "../../../electron/preload.cjs?raw";
import mainSource from "../../../electron/main.ts?raw";
import reportingSource from "../../../electron/reporting.ts?raw";
import engineClientSource from "../../../electron/engineClient.ts?raw";
import supervisorSource from "../../../electron/engineSupervisor.ts?raw";
import appMenuSource from "../../../electron/appMenu.ts?raw";
import menuCommandsSource from "./menuCommands.ts?raw";
import bridgeTypesSource from "./cuepointBridge.types.ts?raw";
import waveformsFixture from "../components/waveform/waveforms.fixture.json";

/**
 * The sources with the line endings the repository stores. A Windows checkout
 * with `core.autocrlf` writes CRLF, and every pattern here is written with a
 * bare newline: read as checked out, 74 of these failed on Windows CI and
 * passed everywhere else, about files that were right.
 */
const lf = (source: string): string => source.replace(/\r\n/g, "\n");
const preload = lf(preloadSource);
const main = lf(mainSource);
const engineClient = lf(engineClientSource);
const supervisor = lf(supervisorSource);
const bridgeTypes = lf(bridgeTypesSource);
const readReportingSource = (): string => lf(reportingSource);

/** Every channel the preload invokes. */
function invokedChannels(source: string): string[] {
  return [...source.matchAll(/ipcRenderer\.invoke\(\s*"([^"]+)"/g)].map((m) => m[1]!);
}

/**
 * Every channel the main process handles. Main registers each through its
 * `handle(channel, fn)` helper, which wraps the handler once for every channel
 * (REPORT-04); `ipcMain.handle` is called in that one place only.
 */
function handledChannels(source: string): string[] {
  return [...source.matchAll(/(?:^|[^.\w])handle\(\s*\n?\s*"([^"]+)"/gm)].map((m) => m[1]!);
}

/** Every `engine.X(...)` call main.ts makes inside an ipcMain handler. */
function supervisorMethodsCalled(source: string): string[] {
  return [...source.matchAll(/=>\s*engine\.([A-Za-z0-9_]+)\(/g)].map((m) => m[1]!);
}

/** Every method the supervisor declares. */
function supervisorMethodsDeclared(source: string): string[] {
  return [...source.matchAll(/^\s{2}(?:async\s+)?([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]!);
}

describe("desktop contract", () => {
  it("declares every supervisor method the main process calls", () => {
    // This is the failure that shipped past a passing type-check and only
    // appeared in the running app: "engine.searchLibrary is not a function".
    const declared = new Set(supervisorMethodsDeclared(supervisor));
    const missing = supervisorMethodsCalled(main).filter((name) => !declared.has(name));

    expect(missing).toEqual([]);
  });

  it("handles every channel the preload invokes", () => {
    const handled = new Set(handledChannels(main));
    const missing = invokedChannels(preload).filter((channel) => !handled.has(channel));

    expect(missing).toEqual([]);
  });

  it("exposes a preload method for every engine channel the main process handles", () => {
    const invoked = new Set(invokedChannels(preload));
    const unreachable = handledChannels(main)
      .filter((channel) => channel.startsWith("engine:"))
      .filter((channel) => !invoked.has(channel));

    expect(unreachable).toEqual([]);
  });

  describe("library search (SHELL-04)", () => {
    // Named explicitly rather than left to the generic checks above: this is
    // the first endpoint added after the contract rule was written down, and
    // it is the worked example for the ones SHELL-07 and SHELL-08 will add.
    it("is exposed by the preload", () => {
      expect(preload).toContain("searchLibrary");
      expect(invokedChannels(preload)).toContain("engine:searchLibrary");
    });

    it("is handled by the main process", () => {
      expect(handledChannels(main)).toContain("engine:searchLibrary");
    });

    it("has a typed client method", () => {
      expect(engineClient).toContain("async searchLibrary");
      expect(engineClient).toContain("/api/v1/library/search");
    });

    it("is forwarded by the supervisor", () => {
      expect(supervisorMethodsDeclared(supervisor)).toContain("searchLibrary");
    });

    it("is declared on the renderer bridge type", () => {
      expect(bridgeTypes).toContain("searchLibrary");
      expect(bridgeTypes).toContain("LibrarySearchResponse");
    });
  });

  describe("track artwork (CLEAN-09)", () => {
    // The first method that answers bytes rather than JSON. The preload turns
    // them into an object URL, so it has a release method no channel backs.
    it("is exposed by the preload, with a way to release what it made", () => {
      expect(invokedChannels(preload)).toContain("engine:getTrackArtwork");
      expect(preload).toContain("URL.createObjectURL");
      expect(preload).toContain("releaseTrackArtwork");
      expect(preload).toContain("URL.revokeObjectURL");
    });

    it("is handled by the main process", () => {
      expect(handledChannels(main)).toContain("engine:getTrackArtwork");
    });

    it("has a client method on the thumbnail route", () => {
      expect(engineClient).toContain("async getTrackArtwork");
      expect(engineClient).toContain("/artwork?");
    });

    it("is forwarded by the supervisor", () => {
      expect(supervisorMethodsDeclared(supervisor)).toContain("getTrackArtwork");
    });

    it("is declared on the renderer bridge type", () => {
      expect(bridgeTypes).toContain("getTrackArtwork");
      expect(bridgeTypes).toContain("releaseTrackArtwork");
      expect(bridgeTypes).toContain("ArtworkSize");
    });
  });

  describe("library import and summary (LIBRARY-06)", () => {
    // Named the same way library search is, for the same reason: the generic
    // checks above only compare the files against each other, so a method
    // missing from *all* of them passes every one of them. These say what has
    // to exist.
    it("exposes both methods on the preload", () => {
      expect(invokedChannels(preload)).toContain("engine:startLibraryImport");
      expect(invokedChannels(preload)).toContain("engine:getLibrarySummary");
    });

    it("handles both channels in the main process", () => {
      expect(handledChannels(main)).toContain("engine:startLibraryImport");
      expect(handledChannels(main)).toContain("engine:getLibrarySummary");
    });

    it("has typed client methods hitting the documented paths", () => {
      // The open bracket matters. `toContain("async startLibraryImport")` also
      // matches `async startLibraryImportMisspelled(`, so renaming the method
      // passed this check — which is exactly the drift it exists to catch.
      expect(engineClient).toContain("async startLibraryImport(");
      expect(engineClient).toContain("/api/v1/library/import");
      expect(engineClient).toContain("async getLibrarySummary(");
      expect(engineClient).toContain("/api/v1/library/summary");
    });

    it("forwards both through the supervisor", () => {
      const declared = supervisorMethodsDeclared(supervisor);
      expect(declared).toContain("startLibraryImport");
      expect(declared).toContain("getLibrarySummary");
    });

    it("declares both on the renderer bridge type", () => {
      // With the `?:`, for the same substring reason as above.
      expect(bridgeTypes).toContain("startLibraryImport?:");
      expect(bridgeTypes).toContain("getLibrarySummary?:");
      expect(bridgeTypes).toContain("interface LibrarySummary");
      expect(bridgeTypes).toContain("interface LibraryImportStarted");
    });

    it("starts the import with POST, not a GET", () => {
      // A GET that changes the library would be retried by anything that
      // retries GETs, and would import twice.
      const method = engineClient.slice(
        engineClient.indexOf("async startLibraryImport"),
        engineClient.indexOf("async getLibrarySummary"),
      );
      expect(method).toContain('method: "POST"');
    });
  });

  describe("browse, playlists, facets and track detail (LIBUI-03)", () => {
    // Named the same way the endpoints before them are: the generic checks
    // compare the files against each other, so a method missing from all of
    // them passes every one. These say what has to exist.
    const methods = [
      "browseLibrary",
      "getLibraryPlaylists",
      "getLibraryFacet",
      "getLibraryQuickFacets",
      "getLibraryFilterFields",
      "getLibraryTrack",
    ];

    it.each(methods)("exposes %s on the preload", (method) => {
      expect(invokedChannels(preload)).toContain(`engine:${method}`);
    });

    it.each(methods)("handles engine:%s in the main process", (method) => {
      expect(handledChannels(main)).toContain(`engine:${method}`);
    });

    it.each(methods)("forwards %s through the supervisor", (method) => {
      expect(supervisorMethodsDeclared(supervisor)).toContain(method);
    });

    it.each(methods)("declares %s on the renderer bridge type", (method) => {
      // With the `?:`, so a rename cannot pass on a substring.
      expect(bridgeTypes).toContain(`${method}?:`);
    });

    it("has typed client methods hitting the documented paths", () => {
      expect(engineClient).toContain("async browseLibrary(");
      expect(engineClient).toContain("async getLibraryPlaylists(");
      expect(engineClient).toContain("/api/v1/library/playlists");
      expect(engineClient).toContain("async getLibraryFacet(");
      expect(engineClient).toContain("/api/v1/library/facets");
      expect(engineClient).toContain("async getLibraryFilterFields(");
      expect(engineClient).toContain("/api/v1/library/filter-fields");
      expect(engineClient).toContain("async getLibraryTrack(");
      expect(engineClient).toContain("/api/v1/library/tracks/");
    });

    it("asks for the quick filters with a POST of the view (FLW-4)", () => {
      // The same path as the one-field GET, with a body: the view is a filter
      // rule set, which a query string holds badly. It still changes nothing.
      const start = engineClient.indexOf("async getLibraryQuickFacets(");
      const method = engineClient.slice(start, engineClient.indexOf("async ", start + 10));
      expect(method).toContain("postJson");
      expect(method).toContain("/api/v1/library/facets");
      for (const source of [bridgeTypes, supervisor, engineClient]) {
        const at = source.indexOf("getLibraryQuickFacets");
        const params = source.slice(at, source.indexOf("}", at));
        expect(params).toContain("scope");
        expect(params).toContain("collectionId");
      }
      expect(bridgeTypes).toContain("interface LibraryQuickFacets");
    });

    it("browses through the one search endpoint (DEC-023)", () => {
      // Not a second query path. The whole point of DEC-023 is that browsing
      // is the same endpoint with more parameters, so a filter and a search
      // can never disagree about what the library contains.
      const method = engineClient.slice(
        engineClient.indexOf("async browseLibrary("),
        engineClient.indexOf("async getLibraryPlaylists("),
      );
      expect(method).toContain("/api/v1/library/search");
      expect(method).toContain('mode: "browse"');
    });

    it("reads with GET, so a scroll can be repeated safely", () => {
      const reads = engineClient.slice(
        engineClient.indexOf("async browseLibrary("),
        engineClient.indexOf("async startLibraryImport("),
      );
      expect(reads).not.toContain('method: "POST"');
    });

    it("declares the shapes the renderer reads them as", () => {
      expect(bridgeTypes).toContain("interface LibraryPlaylistNode");
      expect(bridgeTypes).toContain("interface LibraryPlaylistTree");
      expect(bridgeTypes).toContain("interface LibraryFacet");
      expect(bridgeTypes).toContain("interface LibraryFilterVocabulary");
      expect(bridgeTypes).toContain("interface LibraryTrackDetail");
      expect(bridgeTypes).toContain("interface FilterRuleSet");
    });

    it("carries every imported field on a track row (DEC-034, DEC-047)", () => {
      // The table's columns and the Inspector read one row shape; a field the
      // engine sends and the type does not declare is a column that cannot be
      // shown without an `any`.
      const row = bridgeTypes.slice(
        bridgeTypes.indexOf("export interface LibraryTrackRow"),
        bridgeTypes.indexOf("export interface LibrarySearchResponse"),
      );
      for (const field of [
        "remixer",
        "rating",
        "play_count",
        "colour",
        "date_added",
        "comment",
        "bitrate",
      ]) {
        expect(row).toContain(field);
      }
    });

    it("keeps the engine and the renderer agreeing about that row", () => {
      // Two copies of one shape, one in each process. They are compared here
      // because nothing else does: the main process cannot import renderer
      // types, and the renderer cannot import the client's.
      const fields = (source: string) => {
        const start = source.indexOf("export interface LibraryTrackRow");
        return source
          .slice(start, source.indexOf("\n}", start))
          .split("\n")
          .map((line) => line.trim().split(":")[0]!.trim())
          .filter((name) => /^[a-z_]+$/.test(name));
      };

      expect(fields(bridgeTypes)).toEqual(fields(engineClient));
    });
  });

  describe("refresh preview and apply (LIBRARY-10)", () => {
    // Named the same way, for the same reason: the generic checks only compare
    // the files against each other, so a method missing from all of them passes
    // every one.
    it("exposes both methods on the preload", () => {
      expect(invokedChannels(preload)).toContain("engine:startLibraryRefreshPreview");
      expect(invokedChannels(preload)).toContain("engine:startLibraryRefreshApply");
    });

    it("handles both channels in the main process", () => {
      expect(handledChannels(main)).toContain("engine:startLibraryRefreshPreview");
      expect(handledChannels(main)).toContain("engine:startLibraryRefreshApply");
    });

    it("has typed client methods hitting the documented paths", () => {
      expect(engineClient).toContain("async startLibraryRefreshPreview(");
      expect(engineClient).toContain("/api/v1/library/refresh/preview");
      expect(engineClient).toContain("async startLibraryRefreshApply(");
      expect(engineClient).toContain("/api/v1/library/refresh/apply");
    });

    it("forwards both through the supervisor", () => {
      const declared = supervisorMethodsDeclared(supervisor);
      expect(declared).toContain("startLibraryRefreshPreview");
      expect(declared).toContain("startLibraryRefreshApply");
    });

    it("declares both on the renderer bridge type", () => {
      expect(bridgeTypes).toContain("startLibraryRefreshPreview?:");
      expect(bridgeTypes).toContain("startLibraryRefreshApply?:");
      expect(bridgeTypes).toContain("interface RefreshDiff");
      expect(bridgeTypes).toContain("interface RefreshApplied");
      expect(bridgeTypes).toContain("interface LibraryRefreshStarted");
    });

    it("posts both, and sends the diff id on the apply", () => {
      // A GET that applied a refresh would be retried by anything that retries
      // GETs, and DEC-003's deletions do not come back.
      const preview = engineClient.slice(
        engineClient.indexOf("async startLibraryRefreshPreview("),
        engineClient.indexOf("async startLibraryRefreshApply("),
      );
      const apply = engineClient.slice(
        engineClient.indexOf("async startLibraryRefreshApply("),
        engineClient.indexOf("async getLibrarySummary("),
      );
      expect(preview).toContain('method: "POST"');
      expect(apply).toContain('method: "POST"');
      expect(apply).toContain("diff_id");
    });

    it("carries a job result the renderer can read the diff from", () => {
      // The diff is served from the results route, not the polled status one.
      // A bridge type without `result` would type-check every consumer into
      // believing a preview job answers nothing.
      expect(bridgeTypes).toContain("result?: RefreshDiff | RefreshApplied");
    });
  });

  describe("CuePoint's own organization (ORG-08)", () => {
    // The generic checks above compare the files against each other, so a
    // method missing from *all* of them passes every one. This says what has
    // to exist — twenty-five methods across six files, which is exactly the
    // surface where "forgot one" is silent until the packaged app runs.
    const methods = [
      "getCollections",
      "getCollectionEntries",
      "createCollection",
      "renameCollection",
      "moveCollection",
      "deleteCollection",
      "previewCollectionDelete",
      "addTracksToCollection",
      "insertTrackInCollection",
      "removeCollectionEntries",
      "reorderCollectionEntry",
      "saveSmartCollection",
      "updateSmartCollection",
      "duplicateSmartCollection",
      "freezeSmartCollection",
      "getTags",
      "createTag",
      "updateTag",
      "deleteTag",
      "mergeTags",
      "assignTag",
      "unassignTag",
      "setTrackMetadata",
      "getTrackHistory",
      "applyBatch",
    ];

    it.each(methods)("exposes %s on the preload", (method) => {
      expect(invokedChannels(preload)).toContain(`engine:${method}`);
    });

    it.each(methods)("handles engine:%s in the main process", (method) => {
      expect(handledChannels(main)).toContain(`engine:${method}`);
    });

    it.each(methods)("forwards %s through the supervisor", (method) => {
      expect(supervisorMethodsDeclared(supervisor)).toContain(method);
    });

    it.each(methods)("has a typed client method for %s", (method) => {
      // The open bracket matters: `toContain("async getTags")` also matches
      // `async getTagsMisspelled(`, so a rename would pass the check that
      // exists to catch it.
      expect(engineClient).toContain(`async ${method}(`);
    });

    it.each(methods)("declares %s on the renderer bridge type", (method) => {
      expect(bridgeTypes).toContain(`${method}?:`);
    });

    it("hits the documented paths", () => {
      for (const path of [
        "/api/v1/collections",
        "/api/v1/collections/entries?",
        "/api/v1/collections/create",
        "/api/v1/collections/rename",
        "/api/v1/collections/move",
        "/api/v1/collections/delete",
        "/api/v1/collections/delete/preview",
        "/api/v1/collections/tracks/add",
        "/api/v1/collections/tracks/insert",
        "/api/v1/collections/tracks/remove",
        "/api/v1/collections/tracks/reorder",
        "/api/v1/collections/smart/save",
        "/api/v1/collections/smart/update",
        "/api/v1/collections/smart/duplicate",
        "/api/v1/collections/smart/freeze",
        "/api/v1/tags",
        "/api/v1/tags/create",
        "/api/v1/tags/update",
        "/api/v1/tags/delete",
        "/api/v1/tags/merge",
        "/api/v1/tags/assign",
        "/api/v1/tags/unassign",
        "/api/v1/library/batch",
      ]) {
        expect(engineClient).toContain(path);
      }
      // The two that carry an id in the path, built rather than literal.
      expect(engineClient).toContain("/metadata`");
      expect(engineClient).toContain("/history${query}`");
    });

    it("declares the shapes the renderer reads them as", () => {
      for (const shape of [
        "interface CollectionNode",
        "interface CollectionTree",
        "interface CollectionEntry",
        "interface CollectionEntryPage",
        "interface CollectionSubtree",
        "interface CollectionAdded",
        "interface FrozenCollection",
        "interface Tag",
        "interface TagUsage",
        "interface TagVocabulary",
        "interface TrackMetadata",
        "interface TrackFieldChange",
        "interface TrackHistory",
        "interface BatchResult",
        "interface BatchOutcome",
        "interface BatchSelection",
        "interface BatchOperation",
      ]) {
        expect(bridgeTypes).toContain(shape);
      }
    });

    it("keeps the engine and the renderer agreeing about a Collection node", () => {
      // Two copies of one shape, one in each process, compared the way the
      // track row already is: the main process cannot import renderer types,
      // and the renderer cannot import the client's.
      const fields = (source: string) => {
        const start = source.indexOf("export interface CollectionNode");
        return source
          .slice(start, source.indexOf("\n}", start))
          .split("\n")
          .map((line) => line.trim().split(":")[0]!.trim())
          .filter((name) => /^[a-z_]+$/.test(name));
      };

      expect(fields(bridgeTypes)).toEqual(fields(engineClient));
    });

    it("keeps them agreeing about a track's metadata", () => {
      const fields = (source: string) => {
        const start = source.indexOf("export interface TrackMetadata");
        return source
          .slice(start, source.indexOf("\n}", start))
          .split("\n")
          .map((line) => line.trim().split(":")[0]!.trim())
          .filter((name) => /^[a-z_]+$/.test(name));
      };

      expect(fields(bridgeTypes)).toEqual(fields(engineClient));
    });

    it("keeps them agreeing about what a batch applies to (ORG-11)", () => {
      // The selection is the one payload the desktop path forwards without
      // looking at it, so a field one side declares and the other does not is
      // a batch that silently applies to more tracks than the toolbar promised.
      //
      // Read to the next declaration rather than to the first closing brace:
      // this shape nests, and every field of it is optional, so the helper the
      // flat shapes use above would see almost none of it.
      const fields = (source: string) => {
        const start = source.indexOf("export interface BatchSelection");
        const body = source.slice(start, source.indexOf("export interface", start + 10));
        return [...body.matchAll(/^ +([a-z_]+)\??:/gm)].map((match) => match[1]!).sort();
      };

      expect(fields(bridgeTypes)).toContain("exclude_track_ids");
      expect(fields(bridgeTypes)).toEqual(fields(engineClient));
    });

    it("keeps them agreeing about a filterable field (ORG-12)", () => {
      // The filter vocabulary is what stops the bar offering a clause the
      // engine refuses (DEC-043), and one process describing a field
      // differently from the other is exactly that bug with an extra hop in
      // it. This caught one: `type` had said `"text" | "number" | "date"` in
      // the client since before ORG-05 added three more kinds.
      const fields = (source: string) => {
        const start = source.indexOf("export interface LibraryFilterField");
        const body = source.slice(start, source.indexOf("export interface", start + 10));
        return [...body.matchAll(/^ +([a-z_]+)\??:/gm)].map((match) => match[1]!).sort();
      };

      expect(fields(bridgeTypes)).toContain("unit");
      expect(fields(bridgeTypes)).toEqual(fields(engineClient));
    });

    it("declares the same field kinds on both sides (ORG-12)", () => {
      const kinds = (source: string) => {
        const start = source.indexOf("export interface LibraryFilterField");
        const body = source.slice(start, source.indexOf("export interface", start + 10));
        // The `type:` line alone. A prose comment about `"stars"` is not a
        // field kind, and reading every quoted word would make it one.
        const line = /^ +type: (.+);$/m.exec(body)?.[1] ?? "";
        return [...line.matchAll(/"([a-z]+)"/g)].map((match) => match[1]!).sort();
      };

      expect(kinds(bridgeTypes)).toEqual(
        // `name` is DISCOVER-03's artist or label compared by identity, and
        // `beatport` DISCOVER-07's artist or label by Beatport id, and `source`
        // FLW-7's "In playlist" (playlists, Collections and Sets by kind and id).
        [
          "beatport",
          "bool",
          "collection",
          "date",
          "name",
          "number",
          "source",
          "tag",
          "text",
        ].sort(),
      );
      expect(kinds(bridgeTypes)).toEqual(kinds(engineClient));
    });

    it("lets a facet be asked inside a Collection (ORG-08, used by ORG-12)", () => {
      // The engine has taken a scope since ORG-08. A bridge that cannot pass
      // one offers a filter control the library's values while the table shows
      // a Collection's — a value that empties the table the moment it is
      // chosen.
      const facet = (source: string) => {
        const start = source.indexOf("getLibraryFacet");
        return source.slice(start, source.indexOf("}", start));
      };
      for (const source of [bridgeTypes, supervisor, engineClient]) {
        expect(facet(source)).toContain("scope");
        expect(facet(source)).toContain("collectionId");
      }
    });

    it("writes with POST and reads with GET", () => {
      // A GET that changed the library would be retried by anything that
      // retries GETs, and a batch applied twice is not a batch.
      const batch = engineClient.slice(
        engineClient.indexOf("async applyBatch("),
        engineClient.indexOf("async getLibrarySummary("),
      );
      expect(batch).toContain("postJson");

      const tree = engineClient.slice(
        engineClient.indexOf("async getCollections("),
        engineClient.indexOf("async getCollectionEntries("),
      );
      expect(tree).toContain("getJson");
      expect(tree).not.toContain("postJson");
    });

    it("carries CuePoint's own values on a track row (DEC-057)", () => {
      // The table draws the effective rating and says which layer it came
      // from; a field the engine sends and the type does not declare is a
      // column that cannot be shown without an `any`.
      const row = bridgeTypes.slice(
        bridgeTypes.indexOf("export interface LibraryTrackRow"),
        bridgeTypes.indexOf("export interface LibrarySearchResponse"),
      );
      for (const field of ["effective_rating", "rating_source", "favorite"]) {
        expect(row).toContain(field);
      }
      expect(row).not.toContain("notes");
    });

    it("can scope a browse to a Collection without a second query path (ORG-08)", () => {
      // DEC-023: browsing is one endpoint with more parameters, and ORG-08's
      // scope is two more of them rather than a route of its own.
      const method = engineClient.slice(
        engineClient.indexOf("async browseLibrary("),
        engineClient.indexOf("async getLibraryPlaylists("),
      );
      expect(method).toContain("/api/v1/library/search");
      expect(method).toContain('query.set("scope"');
      expect(method).toContain('query.set("collection_id"');
    });
  });

  describe("Clean (CLEAN-11)", () => {
    // The largest single sweep of the contract so far: twenty-two methods
    // across six files. The generic checks compare the files with each other,
    // so a method missing from all of them passes every one; these name what
    // has to exist, as ORG-08's did.
    const methods = [
      "startCleanMatch",
      "resumeCleanMatch",
      "getResumableMatches",
      "getTrackMatches",
      "getMatchCandidates",
      "decideMatch",
      "applyMatch",
      "setTrackOverrides",
      "revertChange",
      "revertBatch",
      "startFileCheck",
      "startDuplicateScan",
      "getDuplicateGroups",
      "dismissDuplicateGroup",
      "restoreDuplicateGroup",
      "startArtworkScan",
      "previewTagWrite",
      "startTagWrite",
      "startTagRestore",
      "getTagWrites",
      "getLibraryHealth",
      "exportReviewList",
    ];

    /** One client method's body: from its signature to the next member. */
    const clientMethod = (name: string) => {
      const start = engineClient.indexOf(`async ${name}(`);
      const next = engineClient.indexOf("\n  async ", start + 1);
      return engineClient.slice(start, next === -1 ? undefined : next);
    };

    it.each(methods)("exposes %s on the preload", (method) => {
      expect(invokedChannels(preload)).toContain(`engine:${method}`);
    });

    it.each(methods)("handles engine:%s in the main process", (method) => {
      expect(handledChannels(main)).toContain(`engine:${method}`);
    });

    it.each(methods)("forwards %s through the supervisor", (method) => {
      expect(supervisorMethodsDeclared(supervisor)).toContain(method);
    });

    it.each(methods)("has a typed client method for %s", (method) => {
      expect(engineClient).toContain(`async ${method}(`);
    });

    it.each(methods)("declares %s on the renderer bridge type", (method) => {
      expect(bridgeTypes).toContain(`${method}?:`);
    });

    it("hits the documented paths", () => {
      for (const path of [
        "/api/v1/clean/match",
        "/api/v1/clean/match/resume",
        "/api/v1/clean/match/resumable",
        "/api/v1/clean/decide",
        "/api/v1/clean/apply",
        "/api/v1/library/revert",
        "/api/v1/library/revert/batch",
        "/api/v1/clean/files/check",
        "/api/v1/clean/duplicates/scan",
        "/api/v1/clean/duplicates",
        "/api/v1/clean/duplicates/dismiss",
        "/api/v1/clean/duplicates/restore",
        "/api/v1/clean/artwork/scan",
        "/api/v1/clean/tags/preview",
        "/api/v1/clean/tags/write",
        "/api/v1/clean/tags/restore",
        "/api/v1/clean/tags/writes",
        "/api/v1/clean/health",
        "/api/v1/clean/export",
      ]) {
        expect(engineClient).toContain(path);
      }
      // The three that carry an id in the path, built rather than literal.
      expect(clientMethod("getTrackMatches")).toContain("/matches`");
      expect(clientMethod("getMatchCandidates")).toContain("/candidates`");
      expect(clientMethod("setTrackOverrides")).toContain("/overrides`");
    });

    it("writes with POST and reads with GET", () => {
      // A GET that decided a match or wrote a file would be retried by anything
      // that retries GETs — and a tag write repeated is a second write.
      const reads = [
        "getResumableMatches",
        "getTrackMatches",
        "getMatchCandidates",
        "getDuplicateGroups",
        "getTagWrites",
        "getLibraryHealth",
      ];
      for (const name of methods) {
        const body = clientMethod(name);
        if (reads.includes(name)) {
          expect(body, name).toContain("getJson");
          expect(body, name).not.toContain("postJson");
        } else {
          expect(body, name).toContain("postJson");
        }
      }
    });

    it("writes tags by the id of a preview a person saw (DEC-070)", () => {
      expect(clientMethod("startTagWrite")).toContain("preview_id");
      expect(bridgeTypes).toContain("startTagWrite?: (params: { preview_id: string })");
    });

    it("declares the domain types the specification names", () => {
      for (const shape of [
        "interface MatchAttempt",
        "interface MatchCandidate",
        "type MatchState",
        "type FileStatus",
        "interface DuplicateGroup",
        "interface HealthCount",
        "interface TagWritePreview",
        "interface TagWriteResult",
        "interface TagRestoreResult",
        "interface FileWriteRecord",
      ]) {
        expect(bridgeTypes).toContain(shape);
      }
    });

    it("lets a job's result be read as a tag preview, write or restore", () => {
      // A preview above the threshold is a job, and its preview arrives as the
      // job's result. A bridge type without it would type-check a renderer into
      // believing that job answers nothing it can show.
      expect(bridgeTypes).toContain("| TagWritePreview");
      expect(bridgeTypes).toContain("| TagWriteResult");
      expect(bridgeTypes).toContain("| TagRestoreResult");
    });

    it("carries where each track stands on a row (CLEAN-11)", () => {
      const row = (source: string) =>
        source.slice(
          source.indexOf("export interface LibraryTrackRow"),
          source.indexOf("\n}", source.indexOf("export interface LibraryTrackRow")),
        );
      for (const source of [bridgeTypes, engineClient]) {
        for (const field of ["match_state", "match_disputed", "file_status", "artwork"]) {
          expect(row(source)).toContain(field);
        }
      }
    });

    it("offers the batch operations CLEAN-04 and CLEAN-05 added", () => {
      for (const source of [bridgeTypes, engineClient]) {
        const operation = source.slice(
          source.indexOf("export interface BatchOperation"),
          source.indexOf("\n}", source.indexOf("export interface BatchOperation")),
        );
        for (const kind of ["accept_match", "reject_match", "apply_match", "set_override"]) {
          expect(operation).toContain(`"${kind}"`);
        }
      }
    });

    it.each([
      "TrackMatchState",
      "MatchAttempt",
      "MatchCandidate",
      "TrackMatches",
      "ResumableMatch",
      "FieldRevert",
      "DuplicateGroup",
      "FileWriteRecord",
      "TagWriteRecord",
      "TagRestoreStarted",
      "HealthCount",
      "LibraryHealth",
      "ReviewExportResult",
    ])("keeps the engine and the renderer agreeing about %s", (shape) => {
      // Two copies of one shape, one in each process, compared as the track
      // row and the Collection node are.
      const fields = (source: string) => {
        const start = source.indexOf(`export interface ${shape} `);
        const body = source.slice(start, source.indexOf("\n}", start));
        return [...body.matchAll(/^ {2}([a-z_]+)\??:/gm)].map((match) => match[1]!).sort();
      };

      expect(fields(bridgeTypes).length).toBeGreaterThan(0);
      expect(fields(bridgeTypes)).toEqual(fields(engineClient));
    });
  });

  describe("the Clean page (CLEAN-12)", () => {
    // One method added and four answers widened. The widening is where a
    // silent gap would be: a field the engine sends and one side never types
    // is a comparison mark, a member list or a last-run time the page cannot
    // draw, and nothing else would notice.
    const clientMethod = (name: string) => {
      const start = engineClient.indexOf(`async ${name}(`);
      const next = engineClient.indexOf("\n  async ", start + 1);
      return engineClient.slice(start, next === -1 ? undefined : next);
    };

    it("carries getTrackFolder through every file", () => {
      expect(invokedChannels(preload)).toContain("engine:getTrackFolder");
      expect(handledChannels(main)).toContain("engine:getTrackFolder");
      expect(supervisorMethodsDeclared(supervisor)).toContain("getTrackFolder");
      expect(engineClient).toContain("async getTrackFolder(");
      expect(bridgeTypes).toContain("getTrackFolder?:");
    });

    it("asks for a folder by track id with a GET, never by path", () => {
      // A reveal that took a path would be filesystem access handed to the
      // renderer; one that names a library track reveals only what the
      // library already points at.
      const body = clientMethod("getTrackFolder");
      expect(body).toContain("/folder`");
      expect(body).toContain("getJson");
      expect(body).not.toContain("postJson");
      expect(bridgeTypes).toContain("getTrackFolder?: (params: { trackId: number })");
    });

    it("pages the duplicate listing", () => {
      const body = clientMethod("getDuplicateGroups");
      expect(body).toContain('"limit"');
      expect(body).toContain('"offset"');
    });

    it.each([
      "TrackFolder",
      "ComparedTrack",
      "CandidateDifferences",
      "MatchCandidate",
      "TrackMatches",
      "ListedDuplicateGroup",
      "DuplicateGroupList",
      "HealthDetection",
      "UnavailableRoot",
      "LibraryHealth",
    ])("keeps the engine and the renderer agreeing about %s", (shape) => {
      const fields = (source: string) => {
        const start = source.indexOf(`export interface ${shape} `);
        const body = source.slice(start, source.indexOf("\n}", start));
        return [...body.matchAll(/^ {2}([a-z_]+)\??:/gm)].map((match) => match[1]!).sort();
      };

      expect(fields(bridgeTypes).length).toBeGreaterThan(0);
      expect(fields(bridgeTypes)).toEqual(fields(engineClient));
    });
  });

  describe("Clean in the Library (CLEAN-13)", () => {
    // No method added: three answers widened. A row that one side types
    // without its score or its override sources is a column or a marker the
    // Library cannot draw, and a filter field without its choices is a text
    // box where a choice belongs.
    it.each(["LibraryTrackRow", "LibraryFilterField", "LibraryFilterChoice"])(
      "keeps the engine and the renderer agreeing about %s",
      (shape) => {
        const fields = (source: string) => {
          const start = source.indexOf(`export interface ${shape} `);
          const body = source.slice(start, source.indexOf("\n}", start));
          return [...body.matchAll(/^ {2}([a-z_]+)\??:/gm)].map((match) => match[1]!).sort();
        };

        expect(fields(bridgeTypes).length).toBeGreaterThan(0);
        expect(fields(bridgeTypes)).toEqual(fields(engineClient));
      },
    );

    it("carries the score, the override sources and the choices", () => {
      for (const source of [bridgeTypes, engineClient]) {
        expect(source).toContain("match_score?: number | null;");
        expect(source).toContain("override_sources?:");
        expect(source).toContain('export type OverrideSource = "beatport" | "cuepoint";');
        expect(source).toContain("choices");
      }
    });
  });

  describe("the Rekordbox export (EXPORT-06)", () => {
    // Three engine methods and one dialog across all six files. Named here as
    // CLEAN-11's were: the generic checks compare the files with each other,
    // so a method missing from all of them passes every one.
    const methods = ["previewRekordboxExport", "startRekordboxExport", "getRekordboxExportHistory"];

    const clientMethod = (name: string) => {
      const start = engineClient.indexOf(`async ${name}(`);
      const next = engineClient.indexOf("\n  async ", start + 1);
      return engineClient.slice(start, next === -1 ? undefined : next);
    };

    /** One `handle(...)` registration in main.ts, up to the next one. */
    const handler = (channel: string) => {
      const start = main.indexOf(`"${channel}"`);
      const next = main.indexOf("\n  handle(", start);
      return main.slice(start, next === -1 ? undefined : next);
    };

    it.each(methods)("exposes %s on the preload", (method) => {
      expect(invokedChannels(preload)).toContain(`engine:${method}`);
    });

    it.each(methods)("handles engine:%s in the main process", (method) => {
      expect(handledChannels(main)).toContain(`engine:${method}`);
    });

    it.each(methods)("forwards %s through the supervisor", (method) => {
      expect(supervisorMethodsDeclared(supervisor)).toContain(method);
    });

    it.each(methods)("has a typed client method for %s", (method) => {
      expect(engineClient).toContain(`async ${method}(`);
    });

    it.each([...methods, "chooseRekordboxExportDestination"])(
      "declares %s on the renderer bridge type",
      (method) => {
        expect(bridgeTypes).toContain(`${method}?:`);
      },
    );

    it("hits its own routes, which no other export shares", () => {
      expect(clientMethod("previewRekordboxExport")).toContain('"/api/v1/rekordbox-export/preview"');
      expect(clientMethod("startRekordboxExport")).toContain('"/api/v1/rekordbox-export/start"');
      expect(clientMethod("getRekordboxExportHistory")).toContain("/api/v1/rekordbox-export/history");
      for (const name of methods) {
        expect(clientMethod(name), name).not.toContain("/api/v1/clean/export");
      }
    });

    it("writes with POST and reads with GET", () => {
      // A GET that started an export would be retried by anything that retries
      // GETs — and an export repeated is a second file.
      expect(clientMethod("previewRekordboxExport")).toContain("postRefusable");
      expect(clientMethod("startRekordboxExport")).toContain("postRefusable");
      expect(clientMethod("getRekordboxExportHistory")).toContain("getJson");
      expect(clientMethod("getRekordboxExportHistory")).not.toMatch(/post/i);
    });

    it("answers a refusal as a value, because a rejection loses its reason over IPC", () => {
      expect(bridgeTypes).toContain("=> Promise<RekordboxExportPreviewAnswer>");
      expect(bridgeTypes).toContain("=> Promise<RekordboxExportStartAnswer>");
      expect(clientMethod("previewRekordboxExport")).toContain("refusal");
      expect(clientMethod("startRekordboxExport")).toContain("refusal");
    });

    it("gets the destination from a dialog the main process opens", () => {
      expect(handledChannels(main)).toContain("dialog:saveRekordboxExport");
      expect(invokedChannels(preload)).toContain("dialog:saveRekordboxExport");
      expect(preload).toContain("chooseRekordboxExportDestination");
    });

    it("never starts an export from the dialog, and never judges its path there", () => {
      // The dialog chooses a file; the engine decides whether it may be
      // written (DEC-083). A cancelled dialog is only an answer.
      const dialog = handler("dialog:saveRekordboxExport");
      expect(dialog).toContain("chooseRekordboxExportDestination(");
      expect(dialog).not.toContain("startRekordboxExport");
      expect(dialog).not.toContain("previewRekordboxExport");
      expect(dialog).not.toMatch(/existsSync|statSync|\.xml/);
    });

    it("lets a job's result be read as an export's", () => {
      expect(bridgeTypes).toContain("| RekordboxExportResult");
    });

    it.each([
      "RekordboxExportSourceState",
      "RekordboxExportPlaylistPreview",
      "RekordboxExportPreview",
      "RekordboxExportRefusal",
      "RekordboxExportPreviewAnswer",
      "RekordboxExportStarted",
      "RekordboxExportStartAnswer",
      "RekordboxExportResult",
      "RekordboxExportPlaylistRecord",
      "RekordboxExportRecord",
      "RememberedRekordboxExport",
      "RekordboxExportHistory",
    ])("keeps the engine and the renderer agreeing about %s", (shape) => {
      const fields = (source: string) => {
        const start = source.indexOf(`export interface ${shape} `);
        const body = source.slice(start, source.indexOf("\n}", start));
        return [...body.matchAll(/^ {2}([a-z_]+)\??:/gm)].map((match) => match[1]!).sort();
      };

      expect(fields(bridgeTypes).length).toBeGreaterThan(0);
      expect(fields(bridgeTypes)).toEqual(fields(engineClient));
    });

    it.each([
      "RekordboxKeyFormat",
      "RekordboxExportField",
      "RekordboxExportRefusalCode",
      "RekordboxExportSourceReason",
      "RekordboxExportDestinationReason",
      "RekordboxExportDestinationChoice",
    ])("keeps the engine and the renderer agreeing about the union %s", (union) => {
      const declaration = (source: string) => {
        const start = source.indexOf(`export type ${union} =`);
        expect(start, union).toBeGreaterThan(-1);
        return source.slice(start, source.indexOf(";", start)).replace(/\s+/g, " ");
      };

      expect(declaration(bridgeTypes)).toEqual(declaration(engineClient));
    });
  });

  describe("Discover (DISCOVER-09)", () => {
    // Sixteen engine methods across all six files, named here as the export's
    // are: the generic checks compare the files with each other, so a method
    // missing from all of them passes every one.
    const READS: Record<string, string> = {
      getDiscoverOptions: '"/api/v1/discover/options"',
      listDiscoveryRuns: "`/api/v1/discover/runs${",
      getDiscoveryRun: "`/api/v1/discover/runs/${",
      getDiscoveryRunTracks: "}/tracks${",
      getWantlist: "`/api/v1/discover/wantlist${",
      getEntityPage: "`/api/v1/discover/entity${",
      getEntityBeatport: "`/api/v1/discover/entity/beatport${",
      getSimilarTracks: "`/api/v1/discover/similar${",
    };
    const ACTIONS: Record<string, string> = {
      startDiscoveryRun: '"/api/v1/discover/runs/start"',
      deleteDiscoveryRun: "}/delete`",
      addToWantlist: '"/api/v1/discover/wantlist/add"',
      removeFromWantlist: '"/api/v1/discover/wantlist/remove"',
      setWantlistNote: '"/api/v1/discover/wantlist/note"',
      setWantlistBought: '"/api/v1/discover/wantlist/bought"',
      startBeatportPlaylistPush: '"/api/v1/discover/playlist/start"',
      startBeatportResolve: '"/api/v1/discover/resolve/start"',
    };
    const methods = [...Object.keys(READS), ...Object.keys(ACTIONS)];

    const clientMethod = (name: string) => {
      const start = engineClient.indexOf(`async ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      const next = engineClient.indexOf("\n  async ", start + 1);
      return engineClient.slice(start, next === -1 ? undefined : next);
    };

    it("has sixteen of them", () => {
      expect(new Set(methods).size).toBe(16);
    });

    it.each(methods)("exposes %s on the preload", (method) => {
      expect(invokedChannels(preload)).toContain(`engine:${method}`);
    });

    it.each(methods)("handles engine:%s in the main process", (method) => {
      expect(handledChannels(main)).toContain(`engine:${method}`);
    });

    it.each(methods)("forwards %s through the supervisor", (method) => {
      expect(supervisorMethodsDeclared(supervisor)).toContain(method);
      expect(supervisor).toContain(`(await this.readyClient()).${method}(`);
    });

    it.each(methods)("declares %s on the renderer bridge as an answer", (method) => {
      const start = bridgeTypes.indexOf(`  ${method}?: (`);
      expect(start, method).toBeGreaterThan(-1);
      const declaration = bridgeTypes.slice(start, bridgeTypes.indexOf(">>;\n", start) + 3);
      expect(declaration).toMatch(/\) => Promise<DiscoverAnswer<[A-Za-z]+>>;$/);
      // One method read, not this one and the next.
      expect(declaration.match(/\?: \(/g)).toHaveLength(1);
    });

    it.each(Object.entries(READS))("%s reads with GET on its own route", (method, route) => {
      const body = clientMethod(method);
      expect(body).toContain(route);
      expect(body).toContain("this.discoverGet(");
      expect(body).not.toContain("discoverPost");
    });

    it.each(Object.entries(ACTIONS))("%s acts with POST on its own route", (method, route) => {
      // A GET that started a run or a push would be repeated by anything that
      // retries GETs — and a push repeated is a second playlist on Beatport.
      const body = clientMethod(method);
      expect(body).toContain(route);
      expect(body).toContain("this.discoverPost(");
    });

    it("answers every refusal as a value, because a rejection loses its reason over IPC", () => {
      for (const method of methods) {
        expect(clientMethod(method), method).toContain("Promise<DiscoverAnswer<");
      }
      expect(engineClient).toContain("async function readDiscover<T>");
    });

    it("names nothing incrate: those routes and methods retired in DISCOVER-12", () => {
      for (const method of methods) {
        expect(method.toLowerCase()).not.toContain("incrate");
        expect(clientMethod(method)).not.toContain("/api/v1/incrate/");
      }
    });

    it("lets a job's result be read as a run's, a push's or a resolve's", () => {
      for (const shape of ["DiscoveryRunResult", "BeatportPlaylistResult", "BeatportResolveResult"]) {
        expect(bridgeTypes).toContain(`| ${shape}`);
      }
    });

    const INTERFACES = [
      "DiscoverRefusal",
      "DiscoverBeatportStatus",
      "DiscoverGenre",
      "DiscoverFacet",
      "DiscoverDefaults",
      "DiscoverLimits",
      "DiscoverResolvePlan",
      "DiscoverOptions",
      "DiscoverRunScope",
      "DiscoverRunParams",
      "DiscoverRun",
      "DiscoverRunList",
      "DiscoverScopeName",
      "DiscoverRunHeader",
      "BeatportTrackRow",
      "DiscoverRunSource",
      "DiscoverRunTrackRow",
      "DiscoverRunTracksWindow",
      "DiscoverRunTracksPage",
      "DiscoverRunDeleted",
      "DiscoverJobStarted",
      "WantlistRow",
      "WantlistWindow",
      "WantlistPage",
      "WantlistChange",
      "DiscoveryRunResult",
      "BeatportPlaylistResult",
      "BeatportResolveResult",
      "EntityLink",
      "EntityLinkedName",
      "EntityYears",
      "EntityLibrarySummary",
      "EntityPage",
      "EntityTracksPage",
      "EntityBeatportHalf",
      "SimilarTrack",
      "SimilarTracks",
      "DiscoverRunRequest",
      "SimilarTracksRequest",
      "TrackCreditLink",
      "TrackCreditLinks",
      "TrackCue",
      "TrackBeatGridSummary",
      "TrackMarksSummary",
    ];

    it.each(INTERFACES)("keeps the engine and the renderer agreeing about %s", (shape) => {
      const read = (source: string) => {
        const start = source.indexOf(`export interface ${shape} `);
        expect(start, shape).toBeGreaterThan(-1);
        const body = source.slice(start, source.indexOf("\n}", start));
        return {
          // What it extends is part of its shape: a row's inherited fields.
          heading: body.slice(0, body.indexOf("{")).trim(),
          fields: [...body.matchAll(/^ {2}([a-z_]+)\??: (.*);$/gm)]
            .map((match) => `${match[1]}: ${match[2]}`)
            .sort(),
        };
      };

      expect(read(bridgeTypes).fields.length).toBeGreaterThan(0);
      expect(read(bridgeTypes)).toEqual(read(engineClient));
    });

    it.each([
      "BeatportErrorClass",
      "DiscoverRefusalCode",
      "DiscoverAnswer<T>",
      "DiscoverOwnedFilter",
      "DiscoverRunSort",
      "WantlistSort",
      "DiscoverSortDirection",
      "DiscoverRunOutcome",
      "DiscoverSourceType",
      "DiscoverBeatportState",
      "DiscoverJobType",
      "WantlistAction",
      "EntityKind",
      "EntityIdentity",
      "EntityBeatportState",
      "EntityNameOnlyReason",
      "EntityAction",
      "SimilarKeyNotation",
      "SimilarComponent",
      "BeatportPlaylistRequest",
      "TrackCreditRole",
      "TrackCueKind",
    ])("keeps the engine and the renderer agreeing about the type %s", (name) => {
      const declaration = (source: string) => {
        const start = source.indexOf(`export type ${name} =`);
        expect(start, name).toBeGreaterThan(-1);
        return source.slice(start, source.indexOf(";\n", start)).replace(/\s+/g, " ");
      };

      expect(declaration(bridgeTypes)).toEqual(declaration(engineClient));
    });

    it("keeps the reasons Similar Tracks can give in one place for both processes", () => {
      const reasons = (source: string) => {
        const start = source.indexOf("export type SimilarReason =");
        expect(start).toBeGreaterThan(-1);
        return source.slice(start, source.indexOf("};\n\n", start)).replace(/\s+/g, " ");
      };

      expect(reasons(bridgeTypes)).toEqual(reasons(engineClient));
    });
  });

  describe("a Set (PREP-08)", () => {
    // Twenty engine methods across all six files, on `window.cuepoint.sets`,
    // named here as Discover's are: the generic checks compare the files with
    // each other, so a method missing from all of them passes every one. The
    // supervisor has dropped a method in four earlier phases.
    type Method = { client: string; route: string; answer: string };
    const READS: Record<string, Method> = {
      plan: { client: "getSetPlan", route: "/api/v1/sets/plan", answer: "SetPlan" },
      entries: { client: "getSetEntries", route: "/api/v1/sets/entries", answer: "SetEntries" },
      analysis: { client: "getSetAnalysis", route: "/api/v1/sets/analysis", answer: "SetAnalysis" },
      suggestions: {
        client: "getSetSuggestions",
        route: "/api/v1/sets/suggestions",
        answer: "SetSuggestions",
      },
      setListText: {
        client: "getSetListText",
        route: "/api/v1/sets/set-list/text",
        answer: "SetListText",
      },
    };
    const ACTIONS: Record<string, Method> = {
      create: { client: "createSet", route: '"/api/v1/sets/create"', answer: "SetCreated" },
      createFrom: {
        client: "createSetFrom",
        route: '"/api/v1/sets/create-from"',
        answer: "SetCreatedFrom",
      },
      duplicate: { client: "duplicateSet", route: '"/api/v1/sets/duplicate"', answer: "SetCreated" },
      setNotes: { client: "setSetNotes", route: '"/api/v1/sets/notes"', answer: "SetNotesChanged" },
      createChapter: {
        client: "createSetChapter",
        route: '"/api/v1/sets/chapters/create"',
        answer: "SetChapterChanged",
      },
      updateChapter: {
        client: "updateSetChapter",
        route: '"/api/v1/sets/chapters/update"',
        answer: "SetChapterChanged",
      },
      moveChapter: {
        client: "moveSetChapter",
        route: '"/api/v1/sets/chapters/move"',
        answer: "SetChapterChanged",
      },
      deleteChapter: {
        client: "deleteSetChapter",
        route: '"/api/v1/sets/chapters/delete"',
        answer: "SetChapterDeleted",
      },
      splitChapter: {
        client: "splitSetChapter",
        route: '"/api/v1/sets/chapters/split"',
        answer: "SetChapterChanged",
      },
      moveEntry: {
        client: "moveSetEntry",
        route: '"/api/v1/sets/entries/move"',
        answer: "SetEntryMoved",
      },
      setEntryTimes: {
        client: "setSetEntryTimes",
        route: '"/api/v1/sets/entries/times"',
        answer: "SetEntryPlanChanged",
      },
      setEntryNote: {
        client: "setSetEntryNote",
        route: '"/api/v1/sets/entries/note"',
        answer: "SetEntryPlanChanged",
      },
      acknowledge: {
        client: "acknowledgeSetWarning",
        route: '"/api/v1/sets/acknowledge"',
        answer: "SetAcknowledged",
      },
      unacknowledge: {
        client: "unacknowledgeSetWarning",
        route: '"/api/v1/sets/unacknowledge"',
        answer: "SetUnacknowledged",
      },
      saveSetList: {
        client: "saveSetList",
        route: '"/api/v1/sets/set-list/save"',
        answer: "SetListSave",
      },
    };
    const ALL = { ...READS, ...ACTIONS };
    const methods = Object.values(ALL).map((m) => m.client);

    const clientMethod = (name: string) => {
      const start = engineClient.indexOf(`  async ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      const next = engineClient.indexOf("\n  async ", start + 1);
      return engineClient.slice(start, next === -1 ? undefined : next);
    };

    /** The preload's `sets: { … }` block, and only it. */
    const setsBlock = () => {
      const start = preload.indexOf("  sets: {\n");
      expect(start).toBeGreaterThan(-1);
      return preload.slice(start, preload.indexOf("\n  },\n", start));
    };

    /** The bridge's `SetsBridge` interface, and only it. */
    const bridgeInterface = () => {
      const start = bridgeTypes.indexOf("export interface SetsBridge {");
      expect(start).toBeGreaterThan(-1);
      return bridgeTypes.slice(start, bridgeTypes.indexOf("\n}\n", start));
    };

    const handlerOf = (channel: string) => {
      const start = main.indexOf(`  handle("${channel}"`);
      expect(start, channel).toBeGreaterThan(-1);
      return main.slice(start, main.indexOf("\n  );\n", start));
    };

    it("has twenty of them", () => {
      expect(new Set(methods).size).toBe(20);
      expect(Object.keys(ALL)).toHaveLength(20);
    });

    it.each(Object.entries(ALL))(
      "exposes sets.%s on the preload, on its own channel",
      (key, { client }) => {
        expect(setsBlock()).toContain(
          `    ${key}: (params) => ipcRenderer.invoke("engine:${client}", params),\n`,
        );
      },
    );

    it("exposes nothing else on sets but the save dialog", () => {
      const keys = [...setsBlock().matchAll(/^ {4}([A-Za-z]+):/gm)].map((m) => m[1]);
      expect(keys.sort()).toEqual([...Object.keys(ALL), "chooseSetListDestination"].sort());
    });

    it.each(methods)("handles engine:%s in the main process", (method) => {
      expect(handledChannels(main)).toContain(`engine:${method}`);
      expect(handlerOf(`engine:${method}`)).toContain(`engine.${method}(params)`);
    });

    it.each(methods)("forwards %s through the supervisor", (method) => {
      expect(supervisorMethodsDeclared(supervisor)).toContain(method);
      expect(supervisor).toContain(`(await this.readyClient()).${method}(params);`);
    });

    it.each(Object.entries(READS))("sets.%s reads with GET on its own route", (_key, m) => {
      const body = clientMethod(m.client);
      expect(body).toContain(m.route);
      expect(body).toContain("this.setsGet(");
      expect(body).not.toContain("setsPost");
    });

    it.each(Object.entries(ACTIONS))("sets.%s acts with POST on its own route", (_key, m) => {
      // A GET that changed a Set would be repeated by anything that retries GETs.
      const body = clientMethod(m.client);
      expect(body).toContain(m.route);
      expect(body).toContain("this.setsPost(");
    });

    it.each(Object.entries(ALL))(
      "declares sets.%s on the bridge with the client's own answer",
      (key, m) => {
        const block = bridgeInterface();
        const start = block.indexOf(`\n  ${key}: (`);
        expect(start, key).toBeGreaterThan(-1);
        const declaration = block.slice(start, block.indexOf(">>;", start) + 3);
        expect(declaration.endsWith(`=> Promise<SetAnswer<${m.answer}>>;`)).toBe(true);
        // One method read, not this one and the next.
        expect(declaration.match(/\n {2}[A-Za-z]+: \(/g)).toHaveLength(1);
        expect(clientMethod(m.client)).toContain(`Promise<SetAnswer<${m.answer}>>`);
      },
    );

    it("answers every refusal as a value, because a rejection loses its reason over IPC", () => {
      for (const method of methods) {
        expect(clientMethod(method), method).toContain("Promise<SetAnswer<");
      }
      expect(engineClient).toContain("async function readSetAnswer<T>");
    });

    it("hangs off the bridge as one optional namespace", () => {
      expect(bridgeTypes).toContain("  sets?: SetsBridge;\n");
      for (const method of methods) {
        // Flat on the bridge would be a second way in.
        expect(bridgeTypes).not.toMatch(new RegExp(`\\n  ${method}\\?: `));
      }
    });

    it("adds and removes entries only through the Collection methods (PREP-02)", () => {
      for (const route of Object.values(ALL).map((m) => m.route)) {
        expect(route).not.toMatch(/\/(add|insert|remove)"?$/);
      }
      expect(clientMethod("insertTrackInCollection")).toContain("chapter_id?: number | null;");
      expect(bridgeTypes).toMatch(
        /insertTrackInCollection\?: \(params: \{[^}]*chapter_id\?: number \| null;[^}]*\}\)/,
      );
    });

    it("gets a set list's destination from a dialog the main process opens", () => {
      expect(handledChannels(main)).toContain("dialog:saveSetList");
      expect(invokedChannels(preload)).toContain("dialog:saveSetList");
      expect(setsBlock()).toContain("chooseSetListDestination: (request) =>");
      expect(bridgeInterface()).toContain(
        "chooseSetListDestination: (request: SetListDialogRequest) => Promise<SetListDestinationChoice>;",
      );
    });

    it("never saves from the dialog, and never judges its path there", () => {
      const dialog = handlerOf("dialog:saveSetList");
      expect(dialog).toContain("chooseSetListDestination(");
      expect(dialog).not.toContain("saveSetList(");
      expect(dialog).not.toMatch(/existsSync|statSync|\.txt|\.csv|\.m3u8/);
      expect(main).toContain('from "./setListDialog";');
    });

    it("remembers the folder only from a save the engine answered", () => {
      expect(handlerOf("engine:saveSetList")).toContain(
        "rememberSetListFolder(engine.saveSetList(params), setListFolders())",
      );
      expect(main.match(/rememberSetListFolder\(/g)).toHaveLength(1);
    });

    it.each([
      "SetRefusal",
      "SetChapterPlan",
      "SetPlannedEntry",
      "SetPlan",
      "SetEntry",
      "SetEntries",
      "SetSuggestionSide",
      "SetSuggestion",
      "SetNoFit",
      "SetBpmRange",
      "SetSuggestions",
      "SetSuggestionsRequest",
      "SetListText",
      "SetCreated",
      "SetSourceUsed",
      "SetCreatedFrom",
      "SetDetails",
      "SetNotesChanged",
      "SetChapter",
      "SetChapterChanged",
      "SetChapterDeleted",
      "SetChapterUpdate",
      "SetEntryMoved",
      "SetEntryPlan",
      "SetEntryPlanChanged",
      "SetTransitionWarningRef",
      "SetAcknowledgement",
      "SetAcknowledged",
      "SetUnacknowledged",
      "SetListSaved",
      "SetListSave",
      "SetNotice",
      "SetFileCheck",
      "SetRunningTime",
      "SetCamelot",
      "SetShapeEntry",
      "SetShapeTransition",
      "SetShape",
      "SetAnalysis",
    ])("keeps the engine and the renderer agreeing about %s", (shape) => {
      const read = (source: string) => {
        const start = source.indexOf(`export interface ${shape} `);
        expect(start, shape).toBeGreaterThan(-1);
        const body = source.slice(start, source.indexOf("\n}", start));
        return {
          heading: body.slice(0, body.indexOf("{")).trim(),
          fields: [...body.matchAll(/^ {2}([a-z_]+)\??: (.*);$/gm)]
            .map((match) => `${match[1]}: ${match[2]}`)
            .sort(),
        };
      };

      expect(read(bridgeTypes).fields.length).toBeGreaterThan(0);
      expect(read(bridgeTypes)).toEqual(read(engineClient));
    });

    it.each([
      "SetRefusalCode",
      "SetNotFoundReason",
      "SetInsertionPointReason",
      "SetListDestinationReason",
      "SetAnswer<T>",
      "SetSuggestionSideName",
      "SetKeyRelation",
      "SetSource",
      "SetTransitionWarningKind",
      "SetListFormat",
      "SetListDestinationChoice",
      "SetSeconds",
      "SetWarning",
    ])("keeps the engine and the renderer agreeing about the type %s", (name) => {
      const declaration = (source: string) => {
        const start = source.indexOf(`export type ${name} =`);
        expect(start, name).toBeGreaterThan(-1);
        return source.slice(start, source.indexOf(";\n\n", start)).replace(/\s+/g, " ");
      };

      expect(declaration(bridgeTypes)).toEqual(declaration(engineClient));
    });

    it("keeps the dialog's request the same in both processes", () => {
      // Its fields are camelCase, as the export dialog's are, so it is
      // compared as text rather than through the field reader above.
      const declaration = (source: string) => {
        const start = source.indexOf("export interface SetListDialogRequest {");
        expect(start).toBeGreaterThan(-1);
        return source.slice(start, source.indexOf("\n}", start));
      };

      expect(declaration(bridgeTypes)).toEqual(declaration(engineClient));
    });
  });

  describe("waveforms and their analysis (WAVE-03, WAVE-05)", () => {
    // Six engine methods on `window.cuepoint.waveforms`, named here because
    // the generic checks compare the files with each other, and a method
    // missing from all six passes every one of them.
    type Method = {
      client: string;
      route: string;
      post: boolean;
      /** Whether the method takes one params object. */
      params: boolean;
      /** The answer's type, as both processes name it. */
      answer: string;
    };
    const METHODS: Record<string, Method> = {
      analysis: {
        client: "getWaveformAnalysis",
        route: '"/api/v1/waveforms/analysis"',
        post: false,
        params: false,
        answer: "WaveformAnalysisStatus",
      },
      pause: {
        client: "pauseWaveformAnalysis",
        route: '"/api/v1/waveforms/analysis/pause"',
        post: true,
        params: false,
        answer: "WaveformAnalysisStatus",
      },
      resume: {
        client: "resumeWaveformAnalysis",
        route: '"/api/v1/waveforms/analysis/resume"',
        post: true,
        params: false,
        answer: "WaveformAnalysisStatus",
      },
      get: {
        client: "getWaveforms",
        route: "`/api/v1/waveforms?${query}`",
        post: false,
        params: true,
        answer: "WaveformBatch",
      },
      request: {
        client: "requestWaveforms",
        route: '"/api/v1/waveforms/request"',
        post: true,
        params: true,
        answer: "WaveformsRequested",
      },
      deleteData: {
        client: "deleteWaveformData",
        route: '"/api/v1/waveforms/delete-data"',
        post: true,
        params: false,
        answer: "WaveformDataDeletion",
      },
    };
    const methods = Object.values(METHODS).map((m) => m.client);

    const clientMethod = (name: string) => {
      const start = engineClient.indexOf(`  async ${name}(`);
      expect(start, name).toBeGreaterThan(-1);
      const next = engineClient.indexOf("\n  async ", start + 1);
      return engineClient.slice(start, next === -1 ? undefined : next);
    };

    /** The preload's `waveforms: { … }` block, and only it. */
    const waveformsBlock = () => {
      const start = preload.indexOf("  waveforms: {\n");
      expect(start).toBeGreaterThan(-1);
      // Through the last method's own line ending.
      return preload.slice(start, preload.indexOf("\n  },\n", start) + 1);
    };

    /** The bridge's `WaveformsBridge` interface, and only it. */
    const bridgeInterface = () => {
      const start = bridgeTypes.indexOf("export interface WaveformsBridge {");
      expect(start).toBeGreaterThan(-1);
      return bridgeTypes.slice(start, bridgeTypes.indexOf("\n}", start));
    };

    it.each(Object.entries(METHODS))(
      "exposes waveforms.%s on the preload, on its own channel",
      (key, { client, params }) => {
        expect(waveformsBlock()).toContain(
          params
            ? `    ${key}: (params) => ipcRenderer.invoke("engine:${client}", params),\n`
            : `    ${key}: () => ipcRenderer.invoke("engine:${client}"),\n`,
        );
      },
    );

    it("exposes exactly these six on waveforms", () => {
      const keys = [...waveformsBlock().matchAll(/^ {4}([A-Za-z]+):/gm)].map((m) => m[1]);
      expect(keys.sort()).toEqual(Object.keys(METHODS).sort());
    });

    it.each(Object.values(METHODS))("handles engine:$client in the main process", (m) => {
      expect(handledChannels(main)).toContain(`engine:${m.client}`);
      expect(main).toContain(
        m.params
          ? `handle("engine:${m.client}", (_event, params) => engine.${m.client}(params));`
          : `handle("engine:${m.client}", () => engine.${m.client}());`,
      );
    });

    it.each(Object.values(METHODS))("forwards $client through the supervisor", (m) => {
      expect(supervisorMethodsDeclared(supervisor)).toContain(m.client);
      expect(supervisor).toContain(
        `(await this.readyClient()).${m.client}(${m.params ? "params" : ""});`,
      );
    });

    it.each(Object.entries(METHODS))("waveforms.%s uses its own route and verb", (_key, m) => {
      // A GET that paused the analysis or deleted its data would be repeated
      // by anything that retries GETs.
      const body = clientMethod(m.client);
      expect(body).toContain(m.route);
      if (m.post) {
        expect(body).toContain("this.waveformsPost(");
      } else {
        expect(body).not.toContain('method: "POST"');
        expect(body).not.toContain("waveformsPost");
      }
    });

    it.each(Object.entries(METHODS))(
      "declares waveforms.%s on the bridge with the client's own answer",
      (key, m) => {
        const iface = bridgeInterface();
        const at = iface.indexOf(`  ${key}: (`);
        expect(at, key).toBeGreaterThan(-1);
        const declaration = iface.slice(at, iface.indexOf(">>;", at) + 3);
        expect(declaration).toContain(`Promise<WaveformAnswer<${m.answer}>>`);
        expect(declaration.startsWith(`  ${key}: ()`)).toBe(!m.params);
      },
    );

    it("answers every refusal as a value, because a rejection loses its code over IPC", () => {
      for (const m of Object.values(METHODS)) {
        expect(clientMethod(m.client), m.client).toContain(
          `Promise<WaveformAnswer<${m.answer}>>`,
        );
      }
      expect(engineClient).toContain("async function readWaveformAnswer<T>");
    });

    it("decodes a picture once, in main, into bytes of its own", () => {
      // The renderer never parses base64, and a view on Node's pool would
      // carry the whole pool across IPC for every track.
      expect(clientMethod("getWaveforms")).toContain("data: waveformBytes(track.data)");
      expect(engineClient).toContain(
        'return data === null ? null : new Uint8Array(Buffer.from(data, "base64"));',
      );
      expect(waveformsBlock()).not.toMatch(/atob|base64|Buffer/);
    });

    it("hangs off the bridge as one optional namespace", () => {
      expect(bridgeTypes).toMatch(/\n {2}waveforms\?: WaveformsBridge;\r?\n/);
      for (const method of methods) {
        expect(bridgeTypes).not.toMatch(new RegExp(`\\n  ${method}\\?: `));
      }
    });

    const fields = (source: string, start: string) => {
      const at = source.indexOf(start);
      expect(at, start).toBeGreaterThan(-1);
      return source
        .slice(at, source.indexOf("\n}", at))
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^[a-z_]+\??:/.test(line));
    };

    it.each([
      "WaveformAnalysisStatus",
      "BeatGridMarker",
      "WaveformMarks",
      "WaveformLoudness",
      "WaveformTrack",
      "WaveformBatch",
      "WaveformsRequested",
      "WaveformDataDeleted",
      "WaveformDataDeletion",
    ])("declares %s the same in both processes", (name) => {
      const start = `export interface ${name} {`;
      expect(fields(bridgeTypes, start).length).toBeGreaterThan(0);
      expect(fields(bridgeTypes, start)).toEqual(fields(engineClient, start));
    });

    it.each([
      "WaveformAnalysisState",
      "WaveformRefusalCode",
      "WaveformTrackState",
      "WaveformLoudnessReason",
      "WaveformsQuery",
    ])(
      "declares the type %s the same in both processes",
      (name) => {
        const declaration = (source: string) => {
          const start = source.indexOf(`export type ${name} =`);
          expect(start, name).toBeGreaterThan(-1);
          return source.slice(start, source.indexOf(";", start)).replace(/\s+/g, " ");
        };
        expect(declaration(bridgeTypes)).toEqual(declaration(engineClient));
      },
    );

    describe("against the engine's own answers (waveforms.fixture.json)", () => {
      /** The engine's answers, written by `test_waveforms_fixture.py`. */
      const fixture = waveformsFixture as Record<string, unknown>;

      const names = (source: string, start: string) =>
        fields(source, start)
          .map((line) => line.split(/\??:/)[0])
          .sort();

      const keys = (value: unknown) => Object.keys(value as object).sort();

      const batch = fixture.batch as { waveforms: Record<string, unknown>[] };
      const withMarks = fixture.batch_with_marks as { waveforms: Record<string, unknown>[] };

      it.each([
        ["WaveformAnalysisStatus", () => fixture.analysis],
        ["WaveformBatch", () => batch],
        ["WaveformTrack", () => batch.waveforms[0]],
        ["WaveformLoudness", () => batch.waveforms[0].loudness],
        ["WaveformMarks", () => withMarks.waveforms[0].marks],
        ["BeatGridMarker", () => (withMarks.waveforms[0].marks as { grid: unknown[] }).grid[0]],
        ["TrackCue", () => (withMarks.waveforms[0].marks as { cues: unknown[] }).cues[0]],
        ["WaveformsRequested", () => fixture.requested],
        ["WaveformDataDeletion", () => fixture.deleted],
        ["WaveformDataDeleted", () => (fixture.deleted as { deleted: unknown }).deleted],
      ])("%s names exactly the fields the engine sends", (name, read) => {
        const answer = read();
        expect(answer, name).toBeTruthy();
        const declared = `export interface ${name} {`;
        expect(names(bridgeTypes, declared)).toEqual(keys(answer));
        expect(names(engineClient, declared)).toEqual(keys(answer));
      });

      it("covers every track state, each as the bridge types it", () => {
        const union = (source: string) => {
          const start = source.indexOf("export type WaveformTrackState =");
          return [...source.slice(start, source.indexOf(";", start)).matchAll(/"([a-z]+)"/g)]
            .map((m) => m[1])
            .sort();
        };
        const without = fixture.batch_without_decoder as { waveforms: { state: string }[] };
        const states = [
          ...new Set([...batch.waveforms, ...without.waveforms].map((t) => t.state as string)),
        ].sort();
        expect(states).toEqual(union(bridgeTypes));
      });

      it("covers every loudness reason, each as the bridge types it (WAVE-08)", () => {
        const union = (source: string) => {
          const start = source.indexOf("export type WaveformLoudnessReason =");
          return [...source.slice(start, source.indexOf(";", start)).matchAll(/"([a-z_]+)"/g)]
            .map((m) => m[1])
            .sort();
        };
        const measured = fixture.batch_loudness as {
          width: number | null;
          waveforms: { loudness: { reason: string | null } | null }[];
        };
        const reasons = measured.waveforms
          .map((t) => t.loudness?.reason)
          .filter((r): r is string => typeof r === "string");
        expect(measured.width).toBeNull();
        expect(reasons.length).toBeGreaterThan(0);
        for (const reason of reasons) expect(union(bridgeTypes)).toContain(reason);
        expect(union(bridgeTypes)).toEqual(union(engineClient));
      });

      it("refuses with codes both processes declare", () => {
        const refusals = fixture.refusals as { code: string }[];
        expect(refusals.length).toBeGreaterThan(0);
        for (const refusal of refusals) {
          expect(bridgeTypes).toContain(`"${refusal.code}"`);
          expect(engineClient).toContain(`"${refusal.code}"`);
        }
      });
    });
  });

  describe("the Discover page (DISCOVER-10)", () => {
    /** The body of the handler for one channel, as text. */
    const handlerOf = (channel: string) => {
      const start = main.indexOf(`  handle("${channel}"`);
      expect(start, channel).toBeGreaterThan(-1);
      return main.slice(start, main.indexOf("\n  });", start));
    };

    it("opens a Beatport page through one narrow method in every file it crosses", () => {
      expect(invokedChannels(preload)).toContain("shell:openBeatportPage");
      expect(handledChannels(main)).toContain("shell:openBeatportPage");
      expect(preload).toMatch(/openBeatportPage: \(url\) => ipcRenderer\.invoke\("shell:openBeatportPage", url\)/);
      expect(bridgeTypes).toContain("openBeatportPage?: (url: string) => Promise<boolean>;");
    });

    it("checks the URL in the main process before anything opens it", () => {
      const handler = handlerOf("shell:openBeatportPage");
      expect(handler).toContain("beatportPageUrl(url)");
      expect(handler.indexOf("beatportPageUrl(url)")).toBeLessThan(
        handler.indexOf("shell.openExternal("),
      );
      expect(main).toContain('import { beatportPageUrl } from "./externalLinks";');
    });

    it("opens nothing else in the browser, anywhere in the main process", () => {
      // One call, the checked one: an unchecked openExternal is a renderer
      // able to start any protocol handler on the machine.
      expect(main.match(/shell\.openExternal\(/g)).toHaveLength(1);
      expect(handlerOf("shell:openBeatportPage")).toContain("shell.openExternal(page)");
    });
  });

  describe("the renderer's error reporter (REPORT-06)", () => {
    it("asks main whether reporting is set up, through the same get", () => {
      expect(main).toContain('handle("errorReporting:get", () => ({ enabled: errorReporting.enabled(), configured: reportingOn }))');
      expect(bridgeTypes).toContain("configured?: boolean");
    });

    it("has a test-only hook that crosses the bridge in every file", () => {
      expect(invokedChannels(preload)).toContain("testHooks:enabled");
      expect(handledChannels(main)).toContain("testHooks:enabled");
      expect(bridgeTypes).toContain("testHooks?: {");
    });

    it("reaches main's Sentry channels only through the narrow bridge", () => {
      // `ipcRenderer.invoke("...")` and `send("...")` literals are the preload's whole surface; the
      // Sentry channels are named by constants so this contract does not count them as engine calls.
      expect(preload).toContain('"sentry-ipc.envelope"');
      expect(preload).toContain('"sentry-ipc.feedback"');
      expect(preload).toContain('"sentry-ipc.start"');
      expect(preload).not.toMatch(/sentry-ipc\.(scope|status|structured-log|metric)/);
      // Main's SDK keeps Classic mode: no `sentry-ipc` protocol is registered.
      expect(readReportingSource()).toContain("ipcMode: 1");
    });
  });

  describe("the build (REPORT-07)", () => {
    it("crosses the bridge as app:buildInfo, typed", () => {
      expect(invokedChannels(preload)).toContain("app:buildInfo");
      expect(handledChannels(main)).toContain("app:buildInfo");
      expect(bridgeTypes).toContain("buildInfo?: () => Promise<AppBuildInfo>");
      expect(bridgeTypes).toContain("export interface AppBuildInfo");
    });

    it("is told to the SDK and to the engine from the one value", () => {
      expect(main).toContain("const build = currentBuildInfo(app.isPackaged, app.getVersion())");
      expect(main).toMatch(/setupMainReporting\(\{[^}]*\bbuild,/s);
      expect(main).toMatch(/new EngineSupervisor\(\{[\s\S]*?\n  build,/);
    });
  });

  describe("error reporting (REPORT-01)", () => {
    it("crosses the bridge through a get and a set in every file", () => {
      for (const channel of ["errorReporting:get", "errorReporting:set"]) {
        expect(invokedChannels(preload)).toContain(channel);
        expect(handledChannels(main)).toContain(channel);
      }
      expect(bridgeTypes).toContain("errorReporting?: {");
      expect(bridgeTypes).toContain("export interface ErrorReportingState");
    });

    it("tells the engine through its authorized route", () => {
      expect(engineClient).toContain("async setErrorReporting");
      expect(engineClient).toContain("/api/v1/reporting");
      expect(supervisorMethodsDeclared(supervisor)).toContain("setErrorReporting");
    });

    it("passes the choice to the engine when it is launched", () => {
      expect(supervisor).toContain("CUEPOINT_ERROR_REPORTING");
    });
  });

  describe("errors keep their code across the bridge (REPORT-04, DEC-126)", () => {
    it("registers every handler through one wrapper, and calls ipcMain.handle once", () => {
      expect(main.match(/ipcMain\.handle\(/g)).toHaveLength(1);
      expect(main).toContain("ipcMain.handle(channel, wrapIpcHandler(channel, handler));");
      expect(handledChannels(main).length).toBeGreaterThan(150);
    });

    it("throws an EngineError from the client, whose fields the preload hands on", () => {
      expect(engineClient).toContain("export class EngineError extends Error");
      for (const field of ["status", "code", "reportId"]) {
        expect(engineClient).toContain(`readonly ${field}:`);
        expect(preload).toContain(field);
      }
      expect(engineClient).not.toMatch(/throw new Error\(`?textOrNull|throw new Error\(error\??\.message/);
    });

    it("describes a bridge error and where to read its fields, in the bridge types", () => {
      expect(bridgeTypes).toContain(
        "export interface BridgeError extends Error, BridgeErrorFields",
      );
      expect(bridgeTypes).toContain("engineErrorFields?: (message: string) => BridgeErrorFields | null;");
      expect(bridgeTypes).toMatch(/status: number \| null;\s+code: string \| null;\s+reportId: string \| null;/);
    });

    it("exposes engineErrorFields on the preload, without a channel", () => {
      expect(preload).toContain("engineErrorFields: (message) =>");
      expect(handledChannels(main)).not.toContain("engineErrorFields");
    });
  });

  describe("inKey's routes are gone (CLEAN-14, DEC-071)", () => {
    // A removal is the same six-file sweep as an addition, and a method left in
    // one file is as silent as one missing from another: the renderer would
    // type-check against a bridge the engine no longer answers.
    const RETIRED_METHODS = [
      "startMatchJob",
      "exportResults",
      "getHistoryRecent",
      "loadHistoryCsv",
      "getXmlPlaylists",
      "syncTags",
      "openCsvFileDialog",
      "openM3uFileDialog",
    ];
    const RETIRED_ROUTES = [
      "/api/v1/jobs/match",
      "/api/v1/history/",
      "/api/v1/tags/sync",
      '"/api/v1/export"',
      "/api/v1/xml/playlists",
    ];
    const FILES = { preload, main, engineClient, supervisor, bridgeTypes };

    it.each(Object.entries(FILES))("%s names no retired bridge method", (_name, source) => {
      for (const method of RETIRED_METHODS) {
        // `\\b`, not `\b`: in a template literal `\b` is a backspace character,
        // and a pattern of backspaces matches nothing, so the check never ran.
        expect(source).not.toMatch(new RegExp(`\\b${method}\\b`));
      }
    });

    it("no channel for them is handled or invoked", () => {
      const channels = [...handledChannels(main), ...invokedChannels(preload)];
      for (const channel of [
        "engine:startMatchJob",
        "engine:exportResults",
        "engine:getHistoryRecent",
        "engine:loadHistoryCsv",
        "engine:getXmlPlaylists",
        "engine:syncTags",
        "dialog:openCsv",
        "dialog:openM3u",
      ]) {
        expect(channels).not.toContain(channel);
      }
    });

    // The engine's side is src/tests/unit/engine/test_retired_inkey_routes.py:
    // Vite will not read a file outside this app.
    it("the client names no retired route", () => {
      for (const route of RETIRED_ROUTES) {
        expect(engineClient).not.toContain(route);
      }
    });

    it("keeps what every other job uses", () => {
      for (const method of ["getJob", "getJobResults", "cancelJob", "subscribeJobEvents"]) {
        expect(preload).toContain(method);
        expect(bridgeTypes).toContain(method);
      }
      expect(invokedChannels(preload)).toContain("dialog:saveExport");
    });

    it("offers resuming a match on the bridge", () => {
      expect(invokedChannels(preload)).toContain("engine:resumeCleanMatch");
      expect(invokedChannels(preload)).toContain("engine:getResumableMatches");
    });
  });

  describe("inCrate's routes are gone (DISCOVER-12, DEC-090)", () => {
    // The same six-file sweep as CLEAN-14's: a method left in one file would
    // let the renderer type-check against a bridge the engine answers with 404.
    const RETIRED_METHODS = [
      "getIncrateInventory",
      "importIncrateXml",
      "resetIncrateInventory",
      "getIncrateDiscoverOptions",
      "runIncrateDiscover",
      "createIncratePlaylist",
    ];
    const FILES = { preload, main, engineClient, supervisor, bridgeTypes };

    it.each(Object.entries(FILES))("%s names no retired inCrate method", (_name, source) => {
      for (const method of RETIRED_METHODS) {
        // `\\b` in the template, as above: `\b` would be a backspace.
        expect(source).not.toMatch(new RegExp(`\\b${method}\\b`));
      }
    });

    it("no channel for them is handled or invoked", () => {
      const channels = [...handledChannels(main), ...invokedChannels(preload)];
      for (const method of RETIRED_METHODS) {
        expect(channels).not.toContain(`engine:${method}`);
      }
    });

    // The engine's side is src/tests/unit/engine/test_retired_incrate.py.
    it("the client names no inCrate route, and the types no inCrate shape", () => {
      expect(engineClient).not.toContain("/api/v1/incrate/");
      expect(bridgeTypes).not.toMatch(/\bIncrate[A-Z]/);
    });

    it("keeps the Beatport token methods where they were (DEC-098)", () => {
      for (const method of ["getBeatportTokenStatus", "setBeatportToken"]) {
        expect(preload).toContain(method);
        expect(bridgeTypes).toContain(method);
        expect(supervisorMethodsDeclared(supervisor)).toContain(method);
        expect(handledChannels(main)).toContain(`engine:${method}`);
      }
    });
  });

  describe("the one menu bar (FLW-20, DEC-204)", () => {
    // The menu is built in main and the renderer answers it, so the bridge has one
    // call each way, and the ids between them are a fixed list that both sides read.
    const appMenu = lf(appMenuSource);
    const menuCommands = lf(menuCommandsSource);

    /** The quoted ids inside `export const NAME = [ ... ] as const`. */
    function listed(source: string, name: string): string[] {
      const block = new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(source);
      return block ? [...block[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!) : [];
    }

    it("sends the renderer's size to main, and main handles it", () => {
      expect(invokedChannels(preload)).toContain("menu:setSizeState");
      expect(handledChannels(main)).toContain("menu:setSizeState");
      expect(preload).toContain("setSizeState");
    });

    it("lets the renderer listen for the menu's commands, on the channel main sends on", () => {
      expect(preload).toMatch(/ipcRenderer\.on\(\s*"menu:command"/);
      expect(preload).toMatch(/ipcRenderer\.removeListener\(\s*"menu:command"/);
      expect(appMenu).toContain('"menu:command"');
    });

    it("declares both calls on the renderer bridge type", () => {
      expect(bridgeTypes).toContain("menu?:");
      expect(bridgeTypes).toContain("setSizeState:");
      expect(bridgeTypes).toContain("onCommand:");
    });

    it("exposes the preload's menu and nothing else of Electron's", () => {
      const block = preload.slice(preload.indexOf("menu: {"), preload.indexOf("menu: {") + 600);
      expect(block).not.toMatch(/ipcRenderer\.send\(|\bMenu\b|\bremote\b/);
    });

    it("gives the renderer and the menu the same list of command ids", () => {
      const main = listed(appMenu, "MENU_COMMAND_IDS");
      expect(main.length).toBeGreaterThan(10);
      expect(listed(menuCommands, "MENU_COMMAND_IDS")).toEqual(main);
    });

    it("installs the menu from main, and sets the window's zoom to a fixed factor", () => {
      expect(main).toContain("installAppMenu(");
      expect(main).toContain("setVisualZoomLevelLimits(1, 1)");
    });
  });
});

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
 * `preload.ts` is a placeholder and is deliberately not read here; `preload.cjs`
 * is what actually loads.
 */
import { describe, expect, it } from "vitest";

// Read as text through Vite rather than `node:fs`: the renderer deliberately
// has no Node types, because renderer code must not reach for Node APIs, and
// adding them for one test would remove the compiler's ability to say so.
import preload from "../../../electron/preload.cjs?raw";
import main from "../../../electron/main.ts?raw";
import engineClient from "../../../electron/engineClient.ts?raw";
import supervisor from "../../../electron/engineSupervisor.ts?raw";
import bridgeTypes from "./cuepointBridge.types.ts?raw";

/** Every channel the preload invokes. */
function invokedChannels(source: string): string[] {
  return [...source.matchAll(/ipcRenderer\.invoke\(\s*"([^"]+)"/g)].map((m) => m[1]!);
}

/** Every channel the main process handles. */
function handledChannels(source: string): string[] {
  return [...source.matchAll(/ipcMain\.handle\(\s*\n?\s*"([^"]+)"/g)].map((m) => m[1]!);
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
        // `name` is DISCOVER-03's artist or label compared by identity.
        ["bool", "collection", "date", "name", "number", "tag", "text"].sort(),
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

    /** One `ipcMain.handle` registration in main.ts, up to the next one. */
    const handler = (channel: string) => {
      const start = main.indexOf(`"${channel}"`);
      const next = main.indexOf("ipcMain.handle(", start);
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
});

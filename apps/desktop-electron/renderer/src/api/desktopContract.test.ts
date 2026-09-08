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

    it("can scope a browse to a Collection without a second query path", () => {
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
});

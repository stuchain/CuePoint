import { describe, expect, it, vi } from "vitest";
import {
  buildSyncRequest,
  defaultWriteChecked,
  loadSyncOptions,
  saveSyncOptions,
  usesPathBasedSync,
} from "./syncTagsUtils";
import type { TrackResult } from "../mocks/types";

describe("syncTagsUtils", () => {
  it("defaults write checkbox for matched rows", () => {
    expect(defaultWriteChecked({ matched: true })).toBe(true);
    expect(defaultWriteChecked({ matched: false })).toBe(false);
    expect(defaultWriteChecked({ matched: true, error: "FILE_NOT_FOUND" })).toBe(false);
  });

  it("detects path-based sync rows", () => {
    // Real rows, as the callers pass. The bare `{ title: "x" }` this used
    // to check is not a sync row at all.
    const row = (extra: Partial<TrackResult>): TrackResult => ({
      playlist_index: 1,
      title: "A",
      artist: "B",
      matched: true,
      ...extra,
    });

    expect(usesPathBasedSync([row({ file_path: "C:\\a.mp3" })])).toBe(true);
    expect(usesPathBasedSync([row({})])).toBe(false);
    expect(usesPathBasedSync([row({ file_path: "   " })])).toBe(false);
  });

  it("builds collection single sync request", () => {
    const body = buildSyncRequest({
      options: loadSyncOptions(),
      meta: { source: "collection", xmlPath: "C:\\collection.xml", playlistName: "Warm Up" },
      mode: "single",
      results: [{ playlist_index: 1, title: "A", artist: "B", matched: true, write: true }],
      playlistName: "Warm Up",
    });
    expect(body.mode).toBe("single");
    expect(body.xml_path).toBe("C:\\collection.xml");
    expect(body.playlist_name).toBe("Warm Up");
  });

  it("builds playlist file sync request", () => {
    const body = buildSyncRequest({
      options: loadSyncOptions(),
      meta: { source: "playlist_file" },
      mode: "single",
      results: [
        {
          playlist_index: 1,
          title: "A",
          artist: "B",
          matched: true,
          file_path: "C:\\set\\track.mp3",
          write: true,
        },
      ],
    });
    expect(body.source).toBe("playlist_file");
    expect(body.mode).toBe("paths");
  });

  it("builds a batch sync request", () => {
    const body = buildSyncRequest({
      options: loadSyncOptions(),
      meta: { source: "collection", xmlPath: "C:\\collection.xml" },
      mode: "batch",
      batchResults: {
        "Warm Up": [{ playlist_index: 1, title: "A", artist: "B", matched: true, write: true }],
      },
    });

    expect(body.mode).toBe("batch");
    expect(body.source).toBe("collection");
    expect(body.xml_path).toBe("C:\\collection.xml");
    expect(Object.keys(body.batch_results ?? {})).toEqual(["Warm Up"]);
    expect(body.results).toBeUndefined();
  });

  it("refuses a collection sync with no XML path", () => {
    expect(() =>
      buildSyncRequest({
        options: loadSyncOptions(),
        meta: { source: "collection" },
        mode: "single",
        results: [{ playlist_index: 1, title: "A", artist: "B", matched: true }],
      }),
    ).toThrow(/Rekordbox XML/);
  });

  it("persists sync options", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });

    saveSyncOptions({
      key_format: "camelot",
      write_key: true,
      write_year: false,
      write_bpm: true,
      write_label: false,
      write_genre: true,
      write_comment: false,
      comment_text: "synced",
    });
    const loaded = loadSyncOptions();
    expect(loaded.key_format).toBe("camelot");
    expect(loaded.comment_text).toBe("synced");
    expect(loaded.write_bpm).toBe(true);
  });
});

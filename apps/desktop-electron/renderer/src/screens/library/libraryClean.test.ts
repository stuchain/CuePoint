/**
 * What the Library says and offers about Clean (CLEAN-13).
 *
 * The rules a menu, a cell and the Inspector's Beatport zone are drawn from:
 * which entries exist, which cells are marked and with what words, and when a
 * field can be applied from one track's panel.
 */
import { describe, expect, it, vi } from "vitest";

import type {
  LibraryTrackRow,
  MatchCandidate,
  TrackFieldChange,
} from "../../api/cuepointBridge.types";
import { batchSelection } from "./libraryBatch";
import { DEFAULT_LIBRARY_QUERY } from "./libraryQuery";
import { EMPTY_SELECTION, extend, selectAll, selectOnly, toggle } from "./trackSelection";
import {
  artworkText,
  beatportFieldRows,
  canRevertChange,
  beatportMenuItems,
  cleanCapLine,
  cleanTracksFor,
  fixMenuItems,
  effectiveText,
  fieldSourceText,
  formatScore,
  importedText,
  overrideMark,
  overrideSourceText,
} from "./libraryClean";

function row(overrides: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return {
    id: 7,
    rekordbox_track_id: "7",
    title: "Strobe",
    artist: "deadmau5",
    remixer: null,
    album: null,
    label: "mau5trap",
    genre: "Progressive House",
    key: "8A",
    bpm: 128,
    year: 2009,
    duration_seconds: 634,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: "/m/strobe.mp3",
    effective_rating: null,
    rating_source: null,
    favorite: false,
    effective_key: "8A",
    effective_bpm: 128,
    effective_genre: "Progressive House",
    effective_label: "mau5trap",
    effective_year: 2009,
    overridden: [],
    override_sources: {},
    ...overrides,
  };
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: 31,
    attempt_id: 3,
    rank: 1,
    is_winner: true,
    guard_ok: true,
    reject_reason: null,
    score: 96.5,
    base_score: 96.5,
    title_sim: 100,
    artist_sim: 100,
    bonus_year: 0,
    bonus_key: 0,
    beatport_track_id: "1",
    url: "https://www.beatport.com/track/strobe/1",
    title: "Strobe (Original Mix)",
    artists: "deadmau5",
    remixers: null,
    label: "mau5trap",
    genre: "Progressive House",
    subgenre: null,
    key: "9A",
    bpm: 128,
    release_name: "For Lack",
    release_date: null,
    release_year: 2010,
    artwork_url: null,
    preview_url: null,
    query_index: 1,
    query_text: "q",
    candidate_index: 1,
    elapsed_ms: 1,
    mix: "Original Mix",
    differs: null,
    ...overrides,
  };
}

describe("overridden values", () => {
  it("are marked, and the mark names the source and what is underneath", () => {
    const typed = row({ overridden: ["bpm"], effective_bpm: 126, override_sources: { bpm: "cuepoint" } });
    expect(overrideMark(typed, "bpm")).toEqual({
      source: "cuepoint",
      title: "BPM typed by you. Rekordbox has 128.0.",
    });
    const yours = row({
      overridden: ["key"],
      effective_key: "9A",
      key_source: "yours",
      override_sources: { key: "cuepoint" },
    });
    // Rekordbox's key is never quoted as what is underneath (DEC-201).
    expect(overrideMark(yours, "key")).toEqual({
      source: "cuepoint",
      title: "Key typed by you. Rekordbox's key is not used.",
    });
  });

  it("do not mark a key that came from Beatport: that is not an edit (DEC-201, LIB-9)", () => {
    // PAGES-15: the engine leaves the key out of `overridden` unless it is the user's own,
    // and the marker holds even for a row that lists it by mistake.
    const fromBeatport = row({
      overridden: ["key"],
      effective_key: "9A",
      key_source: "beatport",
      override_sources: { key: "beatport" },
    });
    expect(overrideMark(fromBeatport, "key")).toBeNull();
    expect(overrideMark(row({ effective_key: "9A", key_source: "beatport" }), "key")).toBeNull();
    // Beatport's other values stay marked: BPM applied from a match is an override (DEC-068).
    expect(
      overrideMark(
        row({ overridden: ["bpm"], effective_bpm: 126, override_sources: { bpm: "beatport" } }),
        "bpm",
      )?.source,
    ).toBe("beatport");
  });

  it("are not marked when Rekordbox's value shows", () => {
    expect(overrideMark(row(), "bpm")).toBeNull();
    expect(overrideMark(row({ override_sources: { bpm: "cuepoint" } }), "bpm")).toBeNull();
  });

  it("say when Rekordbox has nothing underneath, and when the source is unknown", () => {
    const mark = overrideMark(row({ genre: null, overridden: ["genre"], effective_genre: "Techno" }), "genre");
    expect(mark).toEqual({ source: null, title: "Genre set in CuePoint. Rekordbox has none." });
  });

  it("show the effective value, and a resolved nothing as nothing", () => {
    expect(effectiveText(row({ effective_bpm: 126.5 }), "bpm")).toBe("126.5");
    expect(effectiveText(row({ effective_label: null }), "label")).toBe("");
    expect(effectiveText(row({ effective_year: 2020 }), "year")).toBe("2020");
  });

  it("fall back to the imported value on a row from before CLEAN-05, but never for the key", () => {
    const old = row();
    delete old.effective_key;
    delete old.effective_bpm;
    expect(effectiveText(old, "bpm")).toBe("128.0");
    expect(effectiveText(old, "key")).toBe("");
    expect(importedText(row({ year: null }), "year")).toBe("");
  });

  it("name every source", () => {
    expect(overrideSourceText("beatport")).toBe("applied from Beatport");
    expect(overrideSourceText("cuepoint")).toBe("typed by you");
    expect(overrideSourceText(undefined)).toBe("set in CuePoint");
  });
});

describe("the Clean columns' words", () => {
  it("scores with one decimal and blank for none", () => {
    expect(formatScore(96.54)).toBe("96.5");
    expect(formatScore(null)).toBe("");
    expect(formatScore(undefined)).toBe("");
  });

  it("says where artwork would come from", () => {
    expect(artworkText("embedded")).toBe("In the file");
    expect(artworkText("beatport")).toBe("From Beatport");
    expect(artworkText("none")).toBe("None");
    expect(artworkText("unknown")).toBe("Not read yet");
    expect(artworkText(null)).toBe("");
  });
});

describe("the tracks the bar hands to Clean", () => {
  const query = { ...DEFAULT_LIBRARY_QUERY, q: "acid", playlistId: 4 };

  it("are the ids when some rows were picked", async () => {
    const gather = vi.fn();
    const picked = selectOnly(7, 0);
    const tracks = await cleanTracksFor(batchSelection(extend(picked, [7, 9], 9), query), 2, gather);
    expect(tracks).toEqual({ ids: expect.arrayContaining([7, 9]) });
    expect(gather).not.toHaveBeenCalled();
  });

  it("are the question and its count when everything matching is selected", async () => {
    const gather = vi.fn();
    const tracks = await cleanTracksFor(batchSelection(selectAll(EMPTY_SELECTION), query), 4213, gather);
    expect(tracks).toEqual({
      query: expect.objectContaining({ q: "acid", playlist_id: 4 }),
      count: 4213,
    });
    // Never 4,213 numbers for a question (DEC-045).
    expect(gather).not.toHaveBeenCalled();
  });

  it("are the ids, read in the table's order, when some were taken back out", async () => {
    const gather = vi.fn().mockResolvedValue([1, 3]);
    const without = toggle(selectAll(EMPTY_SELECTION), 2, 1);
    const tracks = await cleanTracksFor(batchSelection(without, query), 2, gather);
    expect(gather).toHaveBeenCalledWith(2);
    expect(tracks).toEqual({ ids: [1, 3] });
  });

  it("are capped at the limit when taking some back out of a huge selection", async () => {
    const gather = vi.fn().mockResolvedValue([1, 3]);
    const without = toggle(selectAll(EMPTY_SELECTION), 2, 1);
    await cleanTracksFor(batchSelection(without, query), 120_000, gather, 50_000);
    expect(gather).toHaveBeenCalledWith(50_000);
    expect(cleanCapLine(50_000, 120_000)).toBe(
      "Clean was given the first 50,000 of the 120,000 tracks selected. Narrow the selection to work on the rest.",
    );
  });

  it("are nothing when nothing is selected", async () => {
    expect(await cleanTracksFor(batchSelection(EMPTY_SELECTION, query), 0, vi.fn())).toBeNull();
  });
});

describe("the Beatport ▸ entries of the operations list", () => {
  const handlers = () => ({ onMatch: vi.fn(), onReview: vi.fn(), onUseBeatport: vi.fn() });

  it("offer matching, reviewing and Beatport's values, and no deciding", () => {
    const items = beatportMenuItems({ count: 3 }, handlers());
    expect(items.map((item) => item.label)).toEqual([
      "Match tracks…",
      "Review these matches",
      "Use Beatport's values…",
    ]);
  });

  it("do what they say", () => {
    const spies = handlers();
    for (const item of beatportMenuItems({ count: 1 }, spies)) item.onSelect();
    for (const spy of Object.values(spies)) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("leave out what this build cannot open, and offer nothing for nothing", () => {
    expect(beatportMenuItems({ count: 2 }, { onMatch: vi.fn() }).map((item) => item.id)).toEqual([
      "beatport-match",
    ]);
    expect(beatportMenuItems({ count: 2 }, {})).toEqual([]);
    expect(beatportMenuItems({ count: 0 }, handlers())).toEqual([]);
  });
});

describe("the Fix ▸ entries of the operations list", () => {
  const handlers = () => ({ onEdit: vi.fn(), onWriteTags: vi.fn(), onCheckFiles: vi.fn() });

  it("offer editing, saving into the files and checking they are there", () => {
    expect(fixMenuItems({ count: 3 }, handlers()).map((item) => item.label)).toEqual([
      "Edit values…",
      "Save changes into the files…",
      "Check the files are still there",
    ]);
  });

  it("do what they say", () => {
    const spies = handlers();
    for (const item of fixMenuItems({ count: 1 }, spies)) item.onSelect();
    for (const spy of Object.values(spies)) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("offer nothing for nothing, or for a build that can do none", () => {
    expect(fixMenuItems({ count: 0 }, handlers())).toEqual([]);
    expect(fixMenuItems({ count: 2 }, {})).toEqual([]);
  });
});

describe("the Beatport zone's rows", () => {
  it("put three values side by side, with the source of the one shown", () => {
    const track = row({
      overridden: ["genre"],
      effective_genre: "Techno",
      override_sources: { genre: "cuepoint" },
    });
    const rows = beatportFieldRows(track, candidate());
    expect(rows.map((entry) => [entry.field, entry.imported, entry.beatport, entry.effective, entry.source])).toEqual([
      ["bpm", "128.0", "128.0", "128.0", "rekordbox"],
      ["genre", "Progressive House", "Progressive House", "Techno", "cuepoint"],
      ["label", "mau5trap", "mau5trap", "mau5trap", "rekordbox"],
      ["year", "2009", "2010", "2009", "rekordbox"],
    ]);
  });

  it("have no Beatport value without a candidate", () => {
    expect(beatportFieldRows(row(), null).every((entry) => entry.beatport === "")).toBe(true);
  });

  it("name an override whose source is not known as CuePoint's", () => {
    const [, genre] = beatportFieldRows(row({ overridden: ["genre"] }), null);
    expect(genre!.source).toBe("cuepoint-unknown");
    expect(fieldSourceText("cuepoint-unknown")).toBe("set in CuePoint");
    expect(fieldSourceText("rekordbox")).toBe("from Rekordbox");
    expect(fieldSourceText("beatport")).toBe("applied from Beatport");
  });
});

function change(field: string, overrides: Partial<TrackFieldChange> = {}): TrackFieldChange {
  return {
    id: 5,
    track_id: 7,
    field,
    old_value: null,
    new_value: 1,
    source: "cuepoint",
    changed_at: "2026-09-16T10:00:00Z",
    batch_id: null,
    ...overrides,
  };
}

describe("which history rows offer Revert", () => {
  it.each([
    "cuepoint_rating",
    "favorite",
    "notes",
    "cuepoint_key",
    "cuepoint_bpm",
    "cuepoint_genre",
    "cuepoint_label",
    "cuepoint_year",
    "match_state",
    "tag",
  ])("CuePoint's %s does", (field) => {
    expect(canRevertChange(change(field))).toBe(true);
  });

  it.each(["key", "bpm", "title", "rating", "comment"])("Rekordbox's %s does not", (field) => {
    expect(canRevertChange(change(field, { source: "rekordbox" }))).toBe(false);
  });

  it("a row with no id does not: nothing could name it", () => {
    expect(canRevertChange(change("cuepoint_bpm", { id: null }))).toBe(false);
  });
});

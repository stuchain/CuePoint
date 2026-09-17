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
  TrackMatchState,
} from "../../api/cuepointBridge.types";
import {
  artworkText,
  beatportFieldRows,
  canRevertChange,
  cleanMenuItems,
  effectiveText,
  fieldSourceText,
  formatScore,
  importedText,
  overrideMark,
  overrideSourceText,
  type CleanMenuHandlers,
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

function state(overrides: Partial<TrackMatchState> = {}): TrackMatchState {
  return {
    track_id: 7,
    state: "accepted",
    decided_by: "auto",
    attempt_id: 3,
    candidate_id: 31,
    newer_attempt_id: null,
    disputed: false,
    decided_at: null,
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
    const applied = row({ overridden: ["key"], effective_key: "9A", override_sources: { key: "beatport" } });
    expect(overrideMark(applied, "key")?.title).toBe("Key applied from Beatport. Rekordbox has 8A.");
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

  it("fall back to the imported value on a row from before CLEAN-05", () => {
    const old = row();
    delete old.effective_key;
    expect(effectiveText(old, "key")).toBe("8A");
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

function allHandlers() {
  return {
    onMatch: vi.fn<(rematch: boolean) => void>(),
    onDecide: vi.fn<(decision: "accept" | "reject") => void>(),
    onApply: vi.fn<() => void>(),
    onEdit: vi.fn<() => void>(),
    onCheckFiles: vi.fn<() => void>(),
    onWriteTags: vi.fn<() => void>(),
  } satisfies Required<CleanMenuHandlers>;
}

describe("the Clean entries of the operations list", () => {
  it("offer every per-track Clean action, in groups", () => {
    const items = cleanMenuItems({ count: 3 }, allHandlers());
    expect(items.map((item) => item.label)).toEqual([
      "Match on Beatport",
      "Re-match",
      "Accept match",
      "Reject match",
      "Apply Beatport values…",
      "Edit metadata…",
      "Check files",
      "Write tags to files…",
    ]);
    expect(items.filter((item) => item.separatorBefore).map((item) => item.id)).toEqual([
      "clean-match",
      "clean-edit",
      "clean-check",
    ]);
  });

  it("do what they say", () => {
    const spies = allHandlers();
    const items = cleanMenuItems({ count: 1 }, spies);
    const pick = (id: string) => items.find((item) => item.id === id)!.onSelect();
    pick("clean-match");
    pick("clean-rematch");
    pick("clean-accept");
    pick("clean-reject");
    pick("clean-apply");
    pick("clean-edit");
    pick("clean-check");
    pick("clean-write-tags");
    expect(spies.onMatch.mock.calls).toEqual([[false], [true]]);
    expect(spies.onDecide.mock.calls).toEqual([["accept"], ["reject"]]);
    for (const spy of [spies.onApply, spies.onEdit, spies.onCheckFiles, spies.onWriteTags]) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  it("leave out what this build cannot do, and a group left empty", () => {
    const items = cleanMenuItems({ count: 2 }, { onCheckFiles: vi.fn() });
    expect(items.map((item) => item.id)).toEqual(["clean-check"]);
    expect(items[0]!.separatorBefore).toBe(true);
    expect(cleanMenuItems({ count: 2 }, {})).toEqual([]);
  });

  it("offer nothing for nothing", () => {
    expect(cleanMenuItems({ count: 0 }, allHandlers())).toEqual([]);
  });
});

describe("the Beatport zone's rows", () => {
  it("put three values side by side, with the source of the one shown", () => {
    const track = row({
      overridden: ["key", "genre"],
      effective_key: "9A",
      effective_genre: "Techno",
      override_sources: { key: "beatport", genre: "cuepoint" },
    });
    const rows = beatportFieldRows(track, state(), candidate());
    expect(rows.map((entry) => [entry.field, entry.imported, entry.beatport, entry.effective, entry.source])).toEqual([
      ["key", "8A", "9A", "9A", "beatport"],
      ["bpm", "128.0", "128.0", "128.0", "rekordbox"],
      ["genre", "Progressive House", "Progressive House", "Techno", "cuepoint"],
      ["label", "mau5trap", "mau5trap", "mau5trap", "rekordbox"],
      ["year", "2009", "2010", "2009", "rekordbox"],
    ]);
  });

  it("offer applying for an accepted match with a value, not one already applied", () => {
    const track = row({ overridden: ["key"], effective_key: "9A", override_sources: { key: "beatport" } });
    const rows = beatportFieldRows(track, state(), candidate({ label: null }));
    expect(Object.fromEntries(rows.map((entry) => [entry.field, entry.canApply]))).toEqual({
      key: false,
      bpm: true,
      genre: true,
      label: false,
      year: true,
    });
  });

  it("offer nothing to apply before a match is accepted", () => {
    for (const current of ["needs_review", "rejected", "no_match"] as const) {
      const rows = beatportFieldRows(row(), state({ state: current }), candidate());
      expect(rows.some((entry) => entry.canApply)).toBe(false);
    }
    expect(beatportFieldRows(row(), state(), null).every((entry) => entry.beatport === "")).toBe(true);
    expect(beatportFieldRows(row(), null, null).some((entry) => entry.canApply)).toBe(false);
  });

  it("name an override whose source is not known as CuePoint's", () => {
    const [key] = beatportFieldRows(row({ overridden: ["key"] }), null, null);
    expect(key!.source).toBe("cuepoint-unknown");
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

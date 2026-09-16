import { describe, expect, it } from "vitest";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { MISSING_COLUMNS, REVIEW_COLUMNS, matchCell } from "./cleanColumns";

function row(overrides: Partial<LibraryTrackRow>): LibraryTrackRow {
  return {
    id: 1,
    rekordbox_track_id: "1",
    title: "Strobe",
    artist: "deadmau5",
    remixer: null,
    album: null,
    label: "mau5trap",
    genre: "House",
    key: "8A",
    bpm: 128,
    year: 2009,
    duration_seconds: 600,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: "E:\\music\\strobe.mp3",
    effective_rating: null,
    rating_source: null,
    favorite: false,
    ...overrides,
  };
}

const cell = (columns: typeof REVIEW_COLUMNS, id: string, track: LibraryTrackRow) =>
  columns.find((column) => column.id === id)!.render(track);

describe("the review queue's columns", () => {
  it("say where a track stands, and when a newer match disagrees", () => {
    expect(matchCell(row({ match_state: "needs_review" }))).toBe("Needs review");
    expect(matchCell(row({ match_state: "accepted", match_disputed: true }))).toBe(
      "Accepted · disputed",
    );
    expect(matchCell(row({ match_state: null }))).toBe("");
  });

  it("show the values a user sees, overrides included", () => {
    const track = row({ effective_key: "9A", effective_bpm: 124, effective_genre: "Techno" });
    expect(cell(REVIEW_COLUMNS, "key", track)).toBe("9A");
    expect(cell(REVIEW_COLUMNS, "bpm", track)).toBe("124.0");
    expect(cell(REVIEW_COLUMNS, "genre", track)).toBe("Techno");
    expect(cell(REVIEW_COLUMNS, "year", row({ effective_year: null }))).toBe("");
  });

  it("sort only by what the engine can order", () => {
    expect(REVIEW_COLUMNS.find((c) => c.id === "match_state")!.sortKey).toBeUndefined();
    expect(REVIEW_COLUMNS[0]!.sticky).toBe(true);
  });
});

describe("the missing files columns", () => {
  it("say where a file was expected and what the check found", () => {
    const track = row({ file_status: "unreadable" });
    expect(cell(MISSING_COLUMNS, "file_status", track)).toBe("Unreadable");
    expect(cell(MISSING_COLUMNS, "file_path", track)).toBe("E:\\music\\strobe.mp3");
    expect(cell(MISSING_COLUMNS, "album", track)).toBe("");
  });
});

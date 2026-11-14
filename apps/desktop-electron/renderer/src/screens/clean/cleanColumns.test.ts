import { describe, expect, it } from "vitest";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { MISSING_COLUMNS, matchCell, missingColumns } from "./cleanColumns";

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

const cell = (columns: typeof MISSING_COLUMNS, id: string, track: LibraryTrackRow) =>
  columns.find((column) => column.id === id)!.render(track);

describe("the Match cell", () => {
  it("says where a track stands, and when a newer match disagrees", () => {
    expect(matchCell(row({ match_state: "needs_review" }))).toBe("To check");
    expect(matchCell(row({ match_state: "accepted", match_disputed: true }))).toBe(
      "Confirmed · changed after you confirmed",
    );
    expect(matchCell(row({ match_state: null }))).toBe("");
  });
});

describe("the missing files columns", () => {
  it("say where a file was expected and what the check found", () => {
    const track = row({ file_status: "unreadable" });
    expect(cell(MISSING_COLUMNS, "file_status", track)).toBe("Unreadable");
    expect(cell(MISSING_COLUMNS, "file_path", track)).toBe("E:\\music\\strobe.mp3");
    expect(cell(MISSING_COLUMNS, "album", track)).toBe("");
  });

  it("say what Missing and Unreadable mean beside the header", () => {
    const hint = MISSING_COLUMNS.find((column) => column.id === "file_status")!.hint;
    expect(hint).toMatch(/Missing: nothing is at that path/);
    expect(hint).toMatch(/Unreadable: the file is there but CuePoint cannot open it/);
  });
});

describe("a found file's File cell (DEC-073)", () => {
  it("says Found in the folder that was looked in, with the path, and leaves other rows as they were", () => {
    const columns = missingColumns(new Map([[7, { path: "/Users/dj/Moved/a/x.mp3", folder: "/Users/dj/Moved", jobId: "job-find" }]]));
    const found = cell(columns, "file_status", row({ id: 7, file_status: "missing" }));
    expect(found).toMatchObject({ props: { tone: "success", title: "/Users/dj/Moved/a/x.mp3" } });
    expect(cell(columns, "file_status", row({ id: 8, file_status: "missing" }))).toBe("Missing");
    // Where it was expected stays what the library says.
    expect(cell(columns, "file_path", row({ id: 7 }))).toBe("E:\\music\\strobe.mp3");
  });
});

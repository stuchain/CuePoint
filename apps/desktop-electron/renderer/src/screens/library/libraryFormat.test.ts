/**
 * The wording the Library page shows (LIBRARY-11).
 *
 * Tested as functions rather than through a render, because the wording is the
 * feature. DEC-003's removals are permanent, and whether a user understands
 * that before pressing the button is decided entirely by these sentences.
 */
import { describe, expect, it } from "vitest";

import type {
  LibrarySourceInfo,
  RefreshApplied,
  RefreshDiff,
} from "../../api/cuepointBridge.types";
import {
  appliedLine,
  applyLabel,
  diffLines,
  fileName,
  formatCount,
  formatWhen,
  jobErrorMessage,
  needsReferenceConfirmation,
  pluralize,
  referenceWarning,
  removalWarning,
  sourceState,
  sourceStateMessage,
} from "./libraryFormat";

function category<T>(count = 0, items: T[] = []) {
  return { count, items, truncated: count > items.length };
}

function diff(overrides: Partial<RefreshDiff> = {}): RefreshDiff {
  return {
    diff_id: "d1",
    xml_path: "C:\\Users\\dj\\Downloads\\collection.xml",
    is_empty: false,
    contents_compared: true,
    duration_seconds: 0.4,
    computed_at: "2026-09-03T10:00:00Z",
    xml_modified_at: "2026-09-03T09:00:00Z",
    xml_size_bytes: 1024,
    tracks: {
      added: category(),
      changed: category(),
      removed: category(),
      relinked: category(),
      notable_changed_count: 0,
    },
    playlists: {
      added: category(),
      changed: category(),
      removed: category(),
    },
    references: {
      collection_count: 0,
      set_count: 0,
      referenced_track_count: 0,
      referenced_track_ids: [],
      has_references: false,
    },
    ...overrides,
  };
}

function source(overrides: Partial<LibrarySourceInfo> = {}): LibrarySourceInfo {
  return {
    xml_path: "/music/collection.xml",
    imported_at: "2026-09-03T10:00:00Z",
    xml_modified_at: "2026-09-03T09:00:00Z",
    xml_size_bytes: 2048,
    track_count: 10,
    playlist_count: 2,
    exists: true,
    changed: false,
    ...overrides,
  };
}

describe("counts", () => {
  it("groups thousands, because 3880 reads as a serial number", () => {
    expect(formatCount(3880)).toBe(new Intl.NumberFormat().format(3880));
  });

  it("agrees with itself about one", () => {
    expect(pluralize(1, "track")).toBe("1 track");
    expect(pluralize(0, "track")).toBe("0 tracks");
    expect(pluralize(2, "track")).toBe("2 tracks");
  });

  it("takes an irregular plural", () => {
    expect(pluralize(3, "entry", "entries")).toBe("3 entries");
  });
});

describe("fileName", () => {
  it("handles both separators, because a path comes from the OS", () => {
    expect(fileName("C:\\Users\\dj\\collection.xml")).toBe("collection.xml");
    expect(fileName("/home/dj/collection.xml")).toBe("collection.xml");
  });

  it("falls back to the whole thing when there is no separator", () => {
    expect(fileName("collection.xml")).toBe("collection.xml");
  });
});

describe("formatWhen", () => {
  it("returns the raw string rather than 'Invalid Date'", () => {
    // A timestamp in a shape this build does not expect is still better shown
    // than replaced with an error where a date belongs.
    expect(formatWhen("not a date")).toBe("not a date");
  });

  it("is empty for nothing", () => {
    expect(formatWhen(null)).toBe("");
    expect(formatWhen(undefined)).toBe("");
  });

  it("renders a real timestamp as something other than itself", () => {
    expect(formatWhen("2026-09-03T10:00:00Z")).not.toBe("2026-09-03T10:00:00Z");
  });
});

describe("sourceState", () => {
  it("tells a missing file from a changed one", () => {
    expect(sourceState(source({ exists: false, changed: null }))).toBe("missing");
    expect(sourceState(source({ changed: true }))).toBe("changed");
  });

  it("treats 'cannot tell' as its own state, not as unchanged", () => {
    // The engine returns null for "I could not read it". Folding that into
    // "unchanged" would tell a user their library is current when nobody
    // checked.
    expect(sourceState(source({ changed: null }))).toBe("unknown");
    expect(sourceStateMessage("unknown")).toMatch(/could not tell/i);
  });

  it("says unchanged only when it really is", () => {
    expect(sourceState(source({ changed: false }))).toBe("unchanged");
  });

  it("gives every state a sentence", () => {
    for (const state of ["missing", "changed", "unknown", "unchanged"] as const) {
      expect(sourceStateMessage(state).length).toBeGreaterThan(0);
    }
  });
});

describe("diffLines", () => {
  it("keeps removals even at zero, and drops the other empties", () => {
    // "0 removed" is the reassurance a user is looking for before pressing the
    // button, and a line that is simply absent reassures nobody.
    const keys = diffLines(diff()).map((line) => line.key);
    expect(keys).toEqual(["removed"]);
  });

  it("shows a category once it has something in it", () => {
    const withAdds = diff({
      tracks: { ...diff().tracks, added: category(3) },
    });
    expect(diffLines(withAdds).map((line) => line.key)).toEqual(["added", "removed"]);
  });

  it("marks only the removal line destructive", () => {
    const lines = diffLines(
      diff({ tracks: { ...diff().tracks, added: category(1), removed: category(2) } }),
    );
    expect(lines.filter((line) => line.destructive).map((line) => line.key)).toEqual([
      "removed",
    ]);
  });

  it("includes playlist changes", () => {
    const withPlaylists = diff({
      playlists: { added: category(1), changed: category(2), removed: category(3) },
    });
    expect(diffLines(withPlaylists).map((line) => line.key)).toEqual([
      "removed",
      "playlists_added",
      "playlists_changed",
      "playlists_removed",
    ]);
  });
});

describe("removalWarning", () => {
  it("is absent when nothing would be deleted", () => {
    expect(removalWarning(diff())).toBeNull();
  });

  it("names what goes with the tracks, not just the tracks", () => {
    // A user reading "25 tracks removed" thinks about 25 rows. What they lose
    // is every rating, tag and play they recorded against them (DEC-003).
    const warning = removalWarning(
      diff({ tracks: { ...diff().tracks, removed: category(25) } }),
    )!;
    expect(warning).toContain("25 tracks");
    expect(warning).toMatch(/ratings/i);
    expect(warning).toMatch(/cannot be undone/i);
  });
});

describe("referenceWarning (DEC-011)", () => {
  it("is absent today, because nothing can reference a track", () => {
    expect(referenceWarning(diff())).toBeNull();
    expect(needsReferenceConfirmation(diff())).toBe(false);
  });

  it("is absent when the engine sends no references at all", () => {
    expect(referenceWarning(diff({ references: null }))).toBeNull();
  });

  it("names the holders when Phase 6 starts answering", () => {
    const withRefs = diff({
      tracks: { ...diff().tracks, removed: category(4) },
      references: {
        collection_count: 2,
        set_count: 1,
        referenced_track_count: 3,
        referenced_track_ids: [1, 2, 3],
        has_references: true,
      },
    });
    const warning = referenceWarning(withRefs)!;
    expect(warning).toContain("3 tracks");
    expect(warning).toContain("2 Collections");
    expect(warning).toContain("1 Set");
    expect(needsReferenceConfirmation(withRefs)).toBe(true);
  });

  it("drops a holder with none of them", () => {
    const setsOnly = diff({
      references: {
        collection_count: 0,
        set_count: 2,
        referenced_track_count: 1,
        referenced_track_ids: [1],
        has_references: true,
      },
    });
    const warning = referenceWarning(setsOnly)!;
    expect(warning).toContain("2 Sets");
    expect(warning).not.toContain("Collection");
    // Singular subject, singular verb: "1 track ... is used", not "are used".
    expect(warning).toContain("1 track");
    expect(warning).toContain("is used in");
  });
});

describe("applyLabel", () => {
  it("puts the irreversible number on the button", () => {
    expect(
      applyLabel(diff({ tracks: { ...diff().tracks, removed: category(25) } })),
    ).toBe("Remove 25 tracks and refresh");
  });

  it("says nothing about removal when there is none", () => {
    expect(applyLabel(diff())).toBe("Apply changes");
  });
});

describe("appliedLine", () => {
  function applied(overrides: Partial<RefreshApplied> = {}): RefreshApplied {
    return {
      diff_id: "d1",
      xml_path: "/music/collection.xml",
      track_count: 3858,
      tracks_inserted: 3,
      tracks_updated: 3855,
      tracks_deleted: 25,
      relinked_count: 0,
      playlists: { nodes: 234, playlists: 206, folders: 28, entries: 13717 },
      references: {
        collection_count: 0,
        set_count: 0,
        referenced_track_count: 0,
        referenced_track_ids: [],
        has_references: false,
      },
      duration_seconds: 0.6,
      summary_line: "Library refreshed",
      ...overrides,
    };
  }

  it("leads with what the library holds now", () => {
    expect(appliedLine(applied())).toMatch(/^3,?858 tracks in your library/);
  });

  it("mentions removals when there were any", () => {
    expect(appliedLine(applied())).toContain("25 removed");
  });

  it("stays quiet about the zeroes", () => {
    const quiet = appliedLine(
      applied({ tracks_inserted: 0, tracks_deleted: 0, relinked_count: 0 }),
    );
    expect(quiet).not.toContain("added");
    expect(quiet).not.toContain("removed");
    expect(quiet).not.toContain("re-linked");
  });
});

describe("jobErrorMessage", () => {
  it("turns the two codes a user meets into instructions", () => {
    expect(jobErrorMessage({ code: "LIBRARY_NOT_IMPORTED" })).toMatch(/Import a Rekordbox/);
    expect(jobErrorMessage({ code: "LIBRARY_XML_NO_COLLECTION" })).toMatch(
      /Export Collection/,
    );
  });

  it("passes an unknown failure's own message through", () => {
    // The engine writes better messages than a generic fallback would.
    expect(jobErrorMessage({ code: "SOMETHING_ELSE", message: "disk is full" })).toBe(
      "disk is full",
    );
  });

  it("still says something when there is nothing to say", () => {
    expect(jobErrorMessage(undefined)).toBe("Something went wrong.");
    expect(jobErrorMessage({ code: "X" })).toBe("Something went wrong.");
  });
});

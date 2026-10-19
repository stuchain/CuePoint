/**
 * What the save window says after a write or a restore (CLEAN-13, DEC-070).
 */
import { describe, expect, it } from "vitest";

import type { TagWriteResult, TagRestoreResult } from "../../api/cuepointBridge.types";
import {
  fieldName,
  fieldSkipText,
  fileSkipText,
  restoreHeadline,
  writeHeadline,
} from "./tagWriting";

describe("the words for reasons and fields", () => {
  it.each([
    ["unsupported_format", "MP3, AIFF, FLAC and Ogg Vorbis"],
    ["missing", "missing"],
    ["unreadable", "cannot be read"],
    ["tags_unreadable", "tags cannot be read"],
    ["changed_since_preview", "changed since the preview"],
    ["vanished", "disappeared"],
    ["something_new", "something new"],
  ])("a file skipped for %s", (reason, words) => {
    expect(fileSkipText(reason)).toContain(words);
  });

  it.each([
    ["no_value", "nothing to save"],
    ["unchanged", "already the same"],
    ["file_has_value", "already has a value"],
    ["key_unrecognized", "not a key"],
    ["has_artwork", "already has a picture"],
    ["no_beatport_artwork", "no confirmed Beatport match"],
    ["artwork_unavailable", "could not be used"],
    ["odd_case", "odd case"],
  ])("a field skipped for %s", (reason, words) => {
    expect(fieldSkipText(reason)).toContain(words);
  });

  it("names fields, artwork included", () => {
    expect(fieldName("bpm")).toBe("BPM");
    expect(fieldName("artwork")).toBe("Artwork");
    expect(fieldName("mystery")).toBe("mystery");
  });
});

describe("a finished write and restore", () => {
  const written: TagWriteResult = {
    job_id: "w",
    preview_id: "p",
    total: 6,
    completed: 6,
    written: 4,
    failed: 1,
    skipped: { changed_since_preview: 1 },
    fields: {},
    field_skipped: {},
    failed_fields: 0,
    problems: [],
    problems_truncated: false,
    cancelled: false,
    duration_seconds: 1,
    summary_line: "",
  };

  it("counts failures apart from writes", () => {
    expect(writeHeadline(written)).toBe("Synced 4 files, 1 could not be synced, 1 skipped.");
    expect(writeHeadline({ ...written, failed: 0, skipped: {}, cancelled: true, written: 1 })).toBe(
      "Stopped early. Synced 1 file.",
    );
  });

  it("says what a restore left alone", () => {
    const result: TagRestoreResult = {
      job_id: "r",
      restored_job_id: "w",
      track_id: null,
      total: 5,
      completed: 5,
      restored: 3,
      already: 1,
      skipped: 1,
      failed: 0,
      files: 2,
      problems: [],
      problems_truncated: false,
      cancelled: false,
      duration_seconds: 1,
      summary_line: "",
    };
    expect(restoreHeadline(result)).toBe(
      "Undid 2 files, 1 value already back, 1 value left alone because the file changed since.",
    );
    expect(restoreHeadline({ ...result, already: 0, skipped: 0, failed: 2, cancelled: true })).toBe(
      "Stopped early. Undid 2 files, 2 could not be undone.",
    );
  });
});

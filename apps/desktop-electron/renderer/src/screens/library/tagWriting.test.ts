/**
 * What the "Write tags to files" dialog says (CLEAN-13, DEC-070).
 */
import { describe, expect, it } from "vitest";

import type { TagWritePreview, TagWriteResult, TagRestoreResult } from "../../api/cuepointBridge.types";
import {
  DEFAULT_TAG_OPTIONS,
  canWrite,
  fieldLines,
  fieldName,
  fieldSkipText,
  fileSkipText,
  optionsProblem,
  previewHeadline,
  restoreHeadline,
  skippedLines,
  writeHeadline,
} from "./tagWriting";

function preview(overrides: Partial<TagWritePreview> = {}): TagWritePreview {
  return {
    preview_id: "p",
    options: DEFAULT_TAG_OPTIONS,
    total: 10,
    files: 6,
    fields: { key: 6, year: 2, bpm: 0 },
    skipped: {
      wav: { count: 1, examples: [] },
      not_checked: { count: 3, examples: [] },
      missing: { count: 0, examples: [] },
    },
    field_skipped: {},
    changes: [],
    cancelled: false,
    computed_at: "2026-09-16T10:00:00Z",
    duration_seconds: 0.2,
    summary_line: "",
    ...overrides,
  };
}

describe("the options", () => {
  it("open with the comment off, and every option stated", () => {
    expect(DEFAULT_TAG_OPTIONS).toEqual({
      key_format: "normal",
      write_key: true,
      write_bpm: false,
      write_year: true,
      write_genre: false,
      write_label: true,
      write_comment: false,
      comment_text: "ok",
      embed_missing_artwork: false,
    });
    expect(optionsProblem(DEFAULT_TAG_OPTIONS)).toBeNull();
  });

  it("need something to write", () => {
    const nothing = {
      ...DEFAULT_TAG_OPTIONS,
      write_key: false,
      write_year: false,
      write_label: false,
    };
    expect(optionsProblem(nothing)).toMatch(/at least one/);
    expect(optionsProblem({ ...nothing, embed_missing_artwork: true })).toBeNull();
  });

  it("need a comment's text when the comment is written", () => {
    expect(optionsProblem({ ...DEFAULT_TAG_OPTIONS, write_comment: true, comment_text: " " })).toMatch(
      /comment some text/,
    );
    expect(optionsProblem({ ...DEFAULT_TAG_OPTIONS, comment_text: "x".repeat(256) })).toMatch(/255/);
  });
});

describe("a preview", () => {
  it("says nothing has been written yet", () => {
    expect(previewHeadline(preview())).toBe(
      "Writing would change 6 files of 10. Nothing has been written yet.",
    );
  });

  it("says when there is nothing to write, and when it was stopped", () => {
    expect(previewHeadline(preview({ files: 0, total: 1 }))).toBe(
      "Nothing to write: none of the 1 file would change.",
    );
    expect(previewHeadline(preview({ cancelled: true }))).toMatch(/stopped/);
  });

  it("lists fields and skips with their counts, most first, zeros left out", () => {
    expect(fieldLines(preview().fields)).toEqual(["Key: 6 files", "Year: 2 files"]);
    expect(skippedLines(preview().skipped)).toEqual([
      "3 files skipped: files not checked at their current path — check files first",
      "1 file skipped: WAV files, whose tags Rekordbox does not read back",
    ]);
    expect(skippedLines({ nothing_to_write: 2 })).toEqual([
      "2 files skipped: files that already hold these values",
    ]);
  });

  it("is what Write needs: answered, whole, and with files to change", () => {
    expect(canWrite(preview())).toBe(true);
    expect(canWrite(null)).toBe(false);
    expect(canWrite(preview({ files: 0 }))).toBe(false);
    expect(canWrite(preview({ cancelled: true }))).toBe(false);
  });
});

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
    ["no_value", "no value"],
    ["unchanged", "already the same"],
    ["key_unrecognized", "not a key"],
    ["has_artwork", "already has a picture"],
    ["no_beatport_artwork", "no accepted Beatport match"],
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
    expect(writeHeadline(written)).toBe("Wrote 4 files, 1 could not be written, 1 skipped.");
    expect(writeHeadline({ ...written, failed: 0, skipped: {}, cancelled: true, written: 1 })).toBe(
      "Stopped early. Wrote 1 file.",
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
      "Restored 2 files, 1 value already back, 1 value left alone because the file changed since.",
    );
    expect(restoreHeadline({ ...result, already: 0, skipped: 0, failed: 2, cancelled: true })).toBe(
      "Stopped early. Restored 2 files, 2 could not be restored.",
    );
  });
});

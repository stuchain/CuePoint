/**
 * What the save window remembers and how it counts (G4 step 4, DEC-262).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TagFieldChoices, TagWritePreview } from "../../api/cuepointBridge.types";
import {
  DEFAULT_SAVE_CHOICES,
  SAVE_CHOICES_KEY,
  UNSAVED_SELECTION,
  changeRows,
  fieldCount,
  keyIn,
  loadSaveChoices,
  noneTicked,
  previewOptions,
  rememberSaveChoices,
  saveState,
  tagOptionsFor,
  type SaveChoices,
} from "./saveChoices";

const CHOICES: TagFieldChoices = {
  key: {
    normal: { replace: 5, fill: 10 },
    camelot: { replace: 7, fill: 9 },
    short: { replace: 1, fill: 2 },
  },
  year: { replace: 3, fill: 22 },
  bpm: { replace: 0, fill: 6 },
  label: { replace: 8, fill: 10 },
  genre: { replace: 4, fill: 18 },
  artwork: { fill: 9 },
};

function preview(overrides: Partial<TagWritePreview> = {}): TagWritePreview {
  return {
    preview_id: "p-1",
    options: tagOptionsFor(DEFAULT_SAVE_CHOICES),
    total: 50,
    files: 38,
    fields: {},
    skipped: {},
    field_skipped: {},
    changes: [],
    cancelled: false,
    computed_at: "2026-10-13T10:00:00Z",
    duration_seconds: 0.1,
    summary_line: "",
    field_choices: CHOICES,
    ...overrides,
  };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("remembered choices", () => {
  it("start with Key, Genre and Label on, Year, BPM and Artwork off, Am and Keep on", () => {
    expect(loadSaveChoices()).toEqual({
      fields: { key: true, genre: true, label: true, year: false, bpm: false, artwork: false },
      key_format: "normal",
      keep_existing: true,
    });
  });

  it("are stored under one key and read back", () => {
    const choices: SaveChoices = {
      fields: { key: false, genre: true, label: false, year: true, bpm: true, artwork: true },
      key_format: "camelot",
      keep_existing: false,
    };
    rememberSaveChoices(choices);
    expect(JSON.parse(localStorage.getItem(SAVE_CHOICES_KEY)!)).toEqual(choices);
    expect(loadSaveChoices()).toEqual(choices);
  });

  it("fall back to the defaults, piece by piece, when what was stored is not valid", () => {
    localStorage.setItem(
      SAVE_CHOICES_KEY,
      JSON.stringify({ fields: { key: false, year: "yes", comment: true }, key_format: "loud", keep_existing: 1 }),
    );
    const read = loadSaveChoices();
    expect(read.fields.key).toBe(false);
    expect(read.fields.year).toBe(false);
    expect(read.fields.genre).toBe(true);
    expect(read.key_format).toBe("normal");
    expect(read.keep_existing).toBe(true);
    expect(Object.keys(read.fields)).not.toContain("comment");
    localStorage.setItem(SAVE_CHOICES_KEY, "{not json");
    expect(loadSaveChoices()).toEqual(DEFAULT_SAVE_CHOICES);
  });

  it("survive a store that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadSaveChoices()).toEqual(DEFAULT_SAVE_CHOICES);
    expect(() => rememberSaveChoices(DEFAULT_SAVE_CHOICES)).not.toThrow();
  });
});

describe("the options sent", () => {
  it("name every option, with the comment off and untouched text", () => {
    expect(tagOptionsFor(DEFAULT_SAVE_CHOICES)).toEqual({
      key_format: "normal",
      write_key: true,
      write_genre: true,
      write_label: true,
      write_year: false,
      write_bpm: false,
      write_comment: false,
      comment_text: "ok",
      embed_missing_artwork: false,
      keep_existing: true,
    });
  });

  it("ask for the preview with every field on and Keep off, whatever was chosen", () => {
    const options = previewOptions({ ...DEFAULT_SAVE_CHOICES, key_format: "short", keep_existing: true });
    expect(options).toMatchObject({
      write_key: true,
      write_genre: true,
      write_label: true,
      write_year: true,
      write_bpm: true,
      write_comment: false,
      embed_missing_artwork: true,
      key_format: "short",
      keep_existing: false,
    });
  });

  it("select the tracks that have unsaved values, whole library", () => {
    expect(UNSAVED_SELECTION).toEqual({
      query: { filters: { match: "all", rules: [{ field: "unsaved_values", operator: "is", value: true }] } },
    });
  });
});

describe("counts from the preview", () => {
  it("fill only while Keep is on, fill and replace when it is off", () => {
    expect(fieldCount("genre", DEFAULT_SAVE_CHOICES, CHOICES)).toBe(18);
    expect(fieldCount("genre", { ...DEFAULT_SAVE_CHOICES, keep_existing: false }, CHOICES)).toBe(22);
  });

  it("count the key in the chosen style", () => {
    expect(fieldCount("key", DEFAULT_SAVE_CHOICES, CHOICES)).toBe(10);
    expect(fieldCount("key", { ...DEFAULT_SAVE_CHOICES, key_format: "camelot" }, CHOICES)).toBe(9);
    expect(fieldCount("key", { ...DEFAULT_SAVE_CHOICES, key_format: "camelot", keep_existing: false }, CHOICES)).toBe(16);
  });

  it("count artwork as fill whatever Keep says, and 0 when the preview has none", () => {
    expect(fieldCount("artwork", { ...DEFAULT_SAVE_CHOICES, keep_existing: false }, CHOICES)).toBe(9);
    expect(fieldCount("artwork", DEFAULT_SAVE_CHOICES, { ...CHOICES, artwork: undefined })).toBe(0);
  });
});

describe("what the button says", () => {
  const ticked = DEFAULT_SAVE_CHOICES;
  const base = { choices: ticked, preview: preview(), total: 38, count: 47, canMarkSaved: false };

  it("counts the files it will save", () => {
    expect(saveState(base)).toEqual({ label: "Save to 38 files", enabled: true, reason: null, mark: false });
    expect(saveState({ ...base, total: 1 }).label).toBe("Save to 1 file");
  });

  it("is greyed with a reason when nothing is ticked", () => {
    const none: SaveChoices = {
      ...ticked,
      fields: { key: false, genre: false, label: false, year: false, bpm: false, artwork: false },
    };
    expect(noneTicked(none)).toBe(true);
    expect(saveState({ ...base, choices: none })).toMatchObject({ enabled: false, reason: "Tick at least one value." });
  });

  it("says WAV files are skipped when every file is one", () => {
    const wav = preview({ total: 4, files: 0, skipped: { wav: { count: 4, examples: [] } } });
    expect(saveState({ ...base, preview: wav, total: 0 })).toMatchObject({
      enabled: false,
      reason: "WAV files are skipped (Rekordbox does not read their tags).",
    });
  });

  it("offers to mark the tracks as saved when no file changes and the bar counted tracks", () => {
    expect(saveState({ ...base, total: 0, canMarkSaved: true })).toEqual({
      label: "Mark 47 tracks as saved",
      enabled: true,
      reason: "These files already hold these values.",
      mark: true,
    });
    expect(saveState({ ...base, total: 0 })).toMatchObject({ enabled: false, reason: "These files already hold these values." });
  });

  it("waits, without a reason, while the total is being counted", () => {
    expect(saveState({ ...base, total: null })).toMatchObject({ enabled: false, reason: null });
  });

  it("names the reason files were skipped rather than saying they hold the values", () => {
    const skipped = preview({
      total: 10,
      files: 0,
      skipped: {
        missing: { count: 3, examples: [] },
        not_checked: { count: 6, examples: [] },
        nothing_to_write: { count: 1, examples: [] },
      },
    });
    const state = saveState({ ...base, preview: skipped, total: 0, canMarkSaved: true });
    expect(state).toMatchObject({
      enabled: false,
      mark: false,
      reason: "6 files skipped: files not checked at their current path — check files first",
    });
  });

  it("keeps WAV's own line when WAV is the main skip, even for part of the selection", () => {
    const part = preview({
      total: 10,
      files: 0,
      skipped: { wav: { count: 7, examples: [] }, missing: { count: 1, examples: [] } },
    });
    expect(saveState({ ...base, preview: part, total: 0 }).reason).toBe(
      "WAV files are skipped (Rekordbox does not read their tags).",
    );
  });

  it("marks tracks as saved when the only thing skipped is files that already hold the values", () => {
    const covered = preview({ total: 10, files: 0, skipped: { nothing_to_write: { count: 10, examples: [] } } });
    expect(saveState({ ...base, preview: covered, total: 0, canMarkSaved: true })).toMatchObject({
      label: "Mark 47 tracks as saved",
      mark: true,
    });
  });
});

describe("keys in a style", () => {
  it("spell a key the way the engine's key_text does", () => {
    expect(keyIn("8A", "normal")).toBe("Am");
    expect(keyIn("Am", "camelot")).toBe("8A");
    expect(keyIn("8A", "short")).toBe("Amin");
    expect(keyIn("8B", "short")).toBe("Cmaj");
    expect(keyIn("C", "camelot")).toBe("8B");
    expect(keyIn("F#m", "camelot")).toBe("11A");
    expect(keyIn("Gb", "normal")).toBe("F#");
    expect(keyIn("A minor", "short")).toBe("Amin");
    expect(keyIn("1A", "normal")).toBe("Abm");
  });

  it("leave a value that is not a key as it came", () => {
    expect(keyIn("Open 1m", "camelot")).toBe("Open 1m");
  });
});

describe("the list of changes", () => {
  const sample = preview({
    files: 3,
    changes: [
      {
        track_id: 1,
        file_path: "C:\\music\\one.mp3",
        fields: { key: { from: "Am", to: "8A" }, year: { from: null, to: "2009" }, genre: { from: null, to: "House" } },
        artwork: true,
      },
      { track_id: 2, file_path: "/m/two.flac", fields: { year: { from: "2001", to: "2002" } }, artwork: false },
    ],
  });

  it("keeps only ticked fields, and artwork only when its row is ticked", () => {
    const keepOff = { ...DEFAULT_SAVE_CHOICES, keep_existing: false };
    const rows = changeRows(sample, { ...keepOff, fields: { ...keepOff.fields, artwork: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.file).toBe("one.mp3");
    expect(rows[0]!.what.map((entry) => entry.name)).toEqual(["Key", "Genre", "Artwork"]);
    expect(rows[0]!.what[0]).toEqual({ name: "Key", from: "Am", to: "Am" });
    expect(rows[0]!.what[2]).toEqual({ name: "Artwork", from: null, to: "added" });
  });

  it("shows the key in the chosen style", () => {
    const rows = changeRows(sample, { ...DEFAULT_SAVE_CHOICES, key_format: "short", keep_existing: false });
    expect(rows[0]!.what[0]).toEqual({ name: "Key", from: "Am", to: "Amin" });
  });

  it("drops a value the file holds while Keep is on, and shows it when Keep is off", () => {
    const keepOff = { ...DEFAULT_SAVE_CHOICES, keep_existing: false };
    expect(changeRows(sample, DEFAULT_SAVE_CHOICES)[0]!.what.map((entry) => entry.name)).toEqual(["Genre"]);
    expect(changeRows(sample, keepOff)[0]!.what.map((entry) => entry.name)).toEqual(["Key", "Genre"]);
    const withYear = { ...keepOff, fields: { ...keepOff.fields, year: true } };
    expect(changeRows(sample, withYear)).toHaveLength(2);
  });
});

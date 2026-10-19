/**
 * What the save window remembers and how it counts (G4 step 4, DEC-262).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TagFieldChoices, TagWritePreview } from "../../api/cuepointBridge.types";
import {
  DEFAULT_SAVE_CHOICES,
  DEFAULT_SYNC_CHOICES,
  NO_COMMENT,
  SAVE_CHOICES_KEY,
  SYNC_CHOICES_KEY,
  SYNC_FIELDS,
  changeRows,
  cleanComment,
  commentText,
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
      fields: { key: true, genre: true, label: true, year: false, bpm: false, artwork: false, comment: false },
      key_format: "normal",
      keep_existing: true,
      comment_text: "ok",
    });
  });

  it("are stored under one key and read back", () => {
    const choices: SaveChoices = {
      fields: { key: false, genre: true, label: false, year: true, bpm: true, artwork: true, comment: false },
      key_format: "camelot",
      keep_existing: false,
      comment_text: "ok",
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
    // The Save window has no comment row, so a remembered tick for it is never read back on.
    expect(read.fields.comment).toBe(false);
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
  const base = { choices: ticked, preview: preview(), total: 38, count: 47 };

  it("counts the files it will save", () => {
    expect(saveState(base)).toEqual({ label: "Sync 38 files", enabled: true, reason: null });
    expect(saveState({ ...base, total: 1 }).label).toBe("Sync 1 file");
  });

  it("is greyed with a reason when nothing is ticked", () => {
    const none: SaveChoices = {
      ...ticked,
      fields: { key: false, genre: false, label: false, year: false, bpm: false, artwork: false, comment: false },
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

  it("says the files already hold the values when no file changes", () => {
    expect(saveState({ ...base, total: 0 })).toMatchObject({
      enabled: false,
      reason: "These files already hold these values.",
    });
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
    const state = saveState({ ...base, preview: skipped, total: 0 });
    expect(state).toMatchObject({
      enabled: false,
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

  it("says the files already hold the values when the only thing skipped is files that do", () => {
    const covered = preview({ total: 10, files: 0, skipped: { nothing_to_write: { count: 10, examples: [] } } });
    expect(saveState({ ...base, preview: covered, total: 0 })).toMatchObject({
      enabled: false,
      reason: "These files already hold these values.",
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

describe("the Sync window's own choices", () => {
  it("lists BPM, Genre, Label, Year, Key and Comment, and no artwork", () => {
    expect(SYNC_FIELDS.map((field) => field.id)).toEqual(["bpm", "genre", "label", "year", "key", "comment"]);
  });

  it("start with BPM, Genre, Label, Year and Comment on and Key off, in Am, keeping what the files hold", () => {
    expect(loadSaveChoices("sync")).toEqual({
      fields: { key: false, genre: true, label: true, year: true, bpm: true, artwork: false, comment: true },
      key_format: "normal",
      keep_existing: true,
      comment_text: "ok",
    });
    expect(DEFAULT_SYNC_CHOICES.fields.artwork).toBe(false);
  });

  it("are remembered apart from the save window's", () => {
    const choices: SaveChoices = {
      fields: { key: true, genre: false, label: true, year: true, bpm: true, artwork: true, comment: true },
      key_format: "camelot",
      keep_existing: false,
      comment_text: "checked",
    };
    rememberSaveChoices(choices, "sync");
    expect(localStorage.getItem(SAVE_CHOICES_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SYNC_CHOICES_KEY)!).key_format).toBe("camelot");
    // Artwork is never offered here, so it is never read back on.
    expect(loadSaveChoices("sync").fields.artwork).toBe(false);
    expect(loadSaveChoices("sync").comment_text).toBe("checked");
    expect(loadSaveChoices()).toEqual(DEFAULT_SAVE_CHOICES);
  });

  it("ask for the preview without artwork", () => {
    expect(previewOptions(DEFAULT_SYNC_CHOICES, "sync")).toMatchObject({
      write_key: true,
      write_bpm: true,
      embed_missing_artwork: false,
      keep_existing: false,
    });
    expect(previewOptions(DEFAULT_SYNC_CHOICES).embed_missing_artwork).toBe(true);
  });

  it("say Sync N files on the button, and Nothing to sync when no ticked row changes a file", () => {
    const base = {
      choices: DEFAULT_SYNC_CHOICES,
      preview: preview(),
      total: 17,
      count: 22,
      variant: "sync" as const,
    };
    expect(saveState(base)).toEqual({ label: "Sync 17 files", enabled: true, reason: null });
    expect(saveState({ ...base, total: 1 }).label).toBe("Sync 1 file");
    expect(saveState({ ...base, total: 0 })).toMatchObject({ label: "Nothing to sync", enabled: false });
    expect(saveState({ ...base, total: null })).toMatchObject({ label: "Sync files", enabled: false });
  });

  describe("when every ticked row reads 0 files", () => {
    const zero = { replace: 0, fill: 0 };
    const empty: TagFieldChoices = {
      key: { normal: zero, camelot: zero, short: zero },
      year: zero,
      bpm: zero,
      label: zero,
      genre: zero,
      comment: zero,
    };
    const base = {
      choices: DEFAULT_SYNC_CHOICES,
      count: 17,
      variant: "sync" as const,
    };

    it("says Nothing to sync and why, for a playlist of WAV files, even before or against the engine's total", () => {
      const wav = preview({ total: 17, files: 0, field_choices: empty, skipped: { wav: { count: 17, examples: [] } } });
      for (const total of [0, null, 17]) {
        expect(saveState({ ...base, preview: wav, total })).toEqual({
          label: "Nothing to sync",
          enabled: false,
          reason: "WAV files are skipped (Rekordbox does not read their tags).",
        });
      }
    });

    it("says Nothing to sync when Keep leaves every row at 0", () => {
      const onlyReplace: TagFieldChoices = {
        ...empty,
        genre: { replace: 9, fill: 0 },
        label: { replace: 9, fill: 0 },
        year: { replace: 9, fill: 0 },
        bpm: { replace: 9, fill: 0 },
        comment: { replace: 9, fill: 0 },
      };
      const held = preview({ field_choices: onlyReplace });
      expect(saveState({ ...base, preview: held, total: 17 })).toMatchObject({
        label: "Nothing to sync",
        enabled: false,
        reason: "These files already hold these values.",
      });
      expect(saveState({ ...base, preview: held, total: 17, choices: { ...DEFAULT_SYNC_CHOICES, keep_existing: false } })).toMatchObject({
        label: "Sync 17 files",
        enabled: true,
      });
    });
  });

});

describe("the Sync window's Comment row", () => {
  const comment = (text: string): SaveChoices => ({ ...DEFAULT_SYNC_CHOICES, comment_text: text });

  it("is ticked with the text ok, and asks the preview for it in the Sync window only", () => {
    expect(DEFAULT_SYNC_CHOICES.fields.comment).toBe(true);
    expect(previewOptions(DEFAULT_SYNC_CHOICES, "sync")).toMatchObject({ write_comment: true, comment_text: "ok" });
    expect(previewOptions(DEFAULT_SAVE_CHOICES)).toMatchObject({ write_comment: false });
    expect(tagOptionsFor(DEFAULT_SAVE_CHOICES)).toMatchObject({ write_comment: false });
  });

  it("sends the ticked state and the typed text, and ok when the text is blank", () => {
    expect(tagOptionsFor(comment("seen"))).toMatchObject({ write_comment: true, comment_text: "seen" });
    expect(tagOptionsFor(comment("   "))).toMatchObject({ write_comment: true, comment_text: "ok" });
    const unticked = { ...comment("seen"), fields: { ...DEFAULT_SYNC_CHOICES.fields, comment: false } };
    expect(tagOptionsFor(unticked)).toMatchObject({ write_comment: false });
  });

  it("never splits a surrogate pair at the cap", () => {
    const emoji = String.fromCodePoint(0x1f3b5);
    const text = "x".repeat(254) + emoji + "tail";
    const cut = cleanComment(text);
    expect(Array.from(cut)).toHaveLength(255);
    expect(cut.endsWith(emoji)).toBe(true);
    expect(cut.charCodeAt(cut.length - 1)).not.toBeLessThan(0xdc00);
  });

  it("is one clean line within the engine's cap", () => {
    expect(cleanComment(["a", "b", "c"].join(String.fromCharCode(10)))).toBe("a b c");
    expect(cleanComment("a" + String.fromCharCode(0, 27) + "b")).toBe("ab");
    expect(cleanComment("x".repeat(300))).toHaveLength(255);
    expect(commentText(comment("  hi  "))).toBe("hi");
  });

  it("counts the files by the empty ones, plus the held ones when Keep is off", () => {
    const from: TagFieldChoices = { ...CHOICES, comment: { replace: 4, fill: 20 } };
    expect(fieldCount("comment", DEFAULT_SYNC_CHOICES, from)).toBe(20);
    expect(fieldCount("comment", { ...DEFAULT_SYNC_CHOICES, keep_existing: false }, from)).toBe(24);
    expect(fieldCount("comment", DEFAULT_SYNC_CHOICES, CHOICES)).toBe(0);
  });

  it("holds Sync back, with a reason, while the ticked comment is empty", () => {
    const state = saveState({
      choices: comment("  "),
      preview: preview(),
      total: 38,
      count: 22,
      variant: "sync",
    });
    expect(state).toMatchObject({ enabled: false, reason: NO_COMMENT });
    const off = { ...comment("  "), fields: { ...DEFAULT_SYNC_CHOICES.fields, comment: false } };
    expect(saveState({ choices: off, preview: preview(), total: 38, count: 22, variant: "sync" }).enabled).toBe(true);
  });
});

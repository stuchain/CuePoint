/**
 * Typed values as requests (CLEAN-13, DEC-069).
 *
 * Only what cannot be sent is refused here; every range is the engine's.
 */
import { describe, expect, it } from "vitest";

import {
  editTarget,
  editsFromDraft,
  emptyEditDraft,
  parseFieldText,
  refusedField,
} from "./metadataEdits";

describe("typed text", () => {
  it("empty clears", () => {
    expect(parseFieldText("genre", "  ")).toEqual({ ok: true, value: null });
    expect(parseFieldText("bpm", "")).toEqual({ ok: true, value: null });
  });

  it("numbers are numbers, and text is trimmed", () => {
    expect(parseFieldText("bpm", " 126.5 ")).toEqual({ ok: true, value: 126.5 });
    expect(parseFieldText("year", "2009")).toEqual({ ok: true, value: 2009 });
    expect(parseFieldText("key", " 8A ")).toEqual({ ok: true, value: "8A" });
  });

  it("letters where a number goes cannot be sent", () => {
    expect(parseFieldText("bpm", "fast")).toEqual({ ok: false, reason: "BPM is a number, not “fast”" });
    expect(parseFieldText("year", "soon")).toEqual({ ok: false, reason: "Year is a number, not “soon”" });
  });

  it("a range is not checked here: 400 BPM goes to the engine", () => {
    expect(parseFieldText("bpm", "400")).toEqual({ ok: true, value: 400 });
  });
});

describe("a dialog's draft", () => {
  it("asks for nothing when every field is left alone", () => {
    expect(editsFromDraft(emptyEditDraft())).toEqual({ ok: true, edits: [] });
  });

  it("becomes one edit per field, in field order", () => {
    const draft = emptyEditDraft();
    draft.year = { mode: "clear", text: "" };
    draft.key = { mode: "set", text: "9A" };
    draft.bpm = { mode: "set", text: "127" };
    expect(editsFromDraft(draft)).toEqual({
      ok: true,
      edits: [
        { field: "key", value: "9A" },
        { field: "bpm", value: 127 },
        { field: "year", value: null },
      ],
    });
  });

  it("refuses setting nothing, and says which field", () => {
    const draft = emptyEditDraft();
    draft.label = { mode: "set", text: " " };
    expect(editsFromDraft(draft)).toEqual({
      ok: false,
      field: "label",
      reason: "Type a value, or choose to clear it",
    });
    draft.label = { mode: "keep", text: "" };
    draft.bpm = { mode: "set", text: "x" };
    expect(editsFromDraft(draft)).toMatchObject({ ok: false, field: "bpm" });
  });
});

describe("what a batch and a refusal name", () => {
  it("names the edit", () => {
    expect(editTarget({ field: "bpm", value: 128 })).toBe("BPM to 128");
    expect(editTarget({ field: "key", value: null })).toBe("key");
  });

  it("finds the field an engine refusal is about", () => {
    expect(refusedField("bpm must be between 20 and 300, not 400")).toBe("bpm");
    expect(refusedField("key 'H' is not a key in classic (Am) notation")).toBe("key");
    expect(refusedField("year must be a whole number, not 2.5")).toBe("year");
    expect(refusedField("The library is busy")).toBeNull();
  });
});

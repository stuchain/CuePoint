/**
 * Hand edits to key, BPM, genre, label and year, as data (CLEAN-13, DEC-069).
 *
 * The engine validates every value (CLEAN-05) and its refusal is what a person
 * reads. What is decided here is only how typed text becomes a request: empty
 * means "clear my value", a number field sends a number, and text is trimmed —
 * never a range check, which would be a second copy of the engine's rule.
 */
import type { OverrideField } from "../../api/cuepointBridge.types";
import { APPLY_FIELDS } from "../clean/comparison";
import type { OverrideEdit } from "./libraryBatch";

/** The five fields, in the order the Library shows them. */
export const EDIT_FIELDS: readonly OverrideField[] = APPLY_FIELDS;

/** What a person asked for one field in the selection dialog. */
export type EditMode = "keep" | "set" | "clear";

export interface FieldDraft {
  mode: EditMode;
  text: string;
}

export type EditDraft = Record<OverrideField, FieldDraft>;

export function emptyEditDraft(): EditDraft {
  return {
    key: { mode: "keep", text: "" },
    bpm: { mode: "keep", text: "" },
    genre: { mode: "keep", text: "" },
    label: { mode: "keep", text: "" },
    year: { mode: "keep", text: "" },
  };
}

export type ParsedValue =
  | { ok: true; value: string | number | null }
  | { ok: false; reason: string };

/**
 * Typed text as the value a request carries.
 *
 * Only what cannot be sent at all is refused here — letters where a number
 * goes. Whether 400 is a BPM is the engine's answer, shown as it gives it.
 */
export function parseFieldText(field: OverrideField, text: string): ParsedValue {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (field === "bpm" || field === "year") {
    const number = Number(trimmed);
    if (!Number.isFinite(number)) {
      return { ok: false, reason: `${field === "bpm" ? "BPM" : "Year"} is a number, not “${trimmed}”` };
    }
    return { ok: true, value: number };
  }
  return { ok: true, value: trimmed };
}

export type DraftEdits =
  | { ok: true; edits: OverrideEdit[] }
  | { ok: false; field: OverrideField; reason: string };

/** The batch edits a dialog's draft asks for, one per field, in field order. */
export function editsFromDraft(draft: EditDraft): DraftEdits {
  const edits: OverrideEdit[] = [];
  for (const field of EDIT_FIELDS) {
    const entry = draft[field];
    if (entry.mode === "keep") continue;
    if (entry.mode === "clear") {
      edits.push({ field, value: null });
      continue;
    }
    if (entry.text.trim() === "") {
      return { ok: false, field, reason: "Type a value, or choose to clear it" };
    }
    const parsed = parseFieldText(field, entry.text);
    if (!parsed.ok) return { ok: false, field, reason: parsed.reason };
    edits.push({ field, value: parsed.value });
  }
  return { ok: true, edits };
}

/** The words a batch's target carries: "BPM 128", "key". */
export function editTarget(edit: OverrideEdit): string {
  const label = edit.field === "bpm" ? "BPM" : edit.field;
  return edit.value === null ? label : `${label} to ${edit.value}`;
}

/**
 * Which field an engine refusal is about, so the dialog can put it there.
 *
 * The engine names the field in its message (CLEAN-05); a message that names
 * none is shown for the whole dialog.
 */
export function refusedField(message: string): OverrideField | null {
  const lower = message.toLowerCase();
  for (const field of EDIT_FIELDS) {
    if (new RegExp(`\\b${field}\\b`).test(lower)) return field;
  }
  return null;
}

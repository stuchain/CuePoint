/**
 * What the chapter dialog reads and sends (PREP-10), apart from the dialog so
 * the rules are a unit test.
 */
import type { SetChapterUpdate } from "../../api/cuepointBridge.types";

/** The engine's own limit on a chapter's name (`MAX_CHAPTER_NAME_LENGTH`). */
export const CHAPTER_NAME_MAX_LENGTH = 120;

/** A BPM as typed: blank is none, anything else must be a positive number. */
export function readBpm(text: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? { ok: true, value } : { ok: false };
}

/** What the dialog sends: every field, as one write. */
export function chapterUpdate(
  chapterId: number,
  fields: { name: string; target: string; bpmMin: number | null; bpmMax: number | null; notes: string },
): SetChapterUpdate {
  const target = fields.target.trim();
  const notes = fields.notes.trim();
  return {
    chapter_id: chapterId,
    name: fields.name.trim(),
    target: target === "" ? null : target,
    bpm_min: fields.bpmMin,
    bpm_max: fields.bpmMax,
    notes: notes === "" ? null : notes,
  };
}

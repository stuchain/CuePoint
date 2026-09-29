/**
 * The engine's own answers about the Prepare page, typed for the tests
 * (PREP-10). Read by tests only.
 *
 * `prepare.fixture.json` is produced by
 * `src/tests/unit/engine/test_prepare_fixture.py` from a real engine and a real
 * database. This module only gives it the renderer's types, puts back the
 * timestamps the producer strips so the file does not rewrite itself on every
 * run, and lifts a refusal as `engineClient.ts`'s `readSetAnswer` does.
 */
import type {
  CollectionEntry,
  CollectionNode,
  SetAcknowledged,
  SetAnalysis,
  SetAnswer,
  SetChapterChanged,
  SetChapterDeleted,
  SetEntries,
  SetEntryMoved,
  SetEntryPlanChanged,
  SetNotesChanged,
  SetPlan,
  SetRefusal,
  SetUnacknowledged,
} from "../../api/cuepointBridge.types";
import raw from "./prepare.fixture.json";

const STAMP = "2026-09-29T10:00:00Z";

function stamped<T>(value: unknown): T {
  return { ...(value as object), created_at: STAMP, updated_at: STAMP } as T;
}

function refusal(capture: { payload: { error: Record<string, unknown> } }): SetRefusal {
  const error = capture.payload.error;
  return {
    code: error.code as SetRefusal["code"],
    message: String(error.message),
    reason: (error.reason as SetRefusal["reason"]) ?? null,
    path: (error.path as string | undefined) ?? null,
  };
}

export function answered<T>(value: T): SetAnswer<T> {
  return { value, refusal: null };
}

export function refused<T>(why: SetRefusal): SetAnswer<T> {
  return { value: null, refusal: why };
}

export const IDS = raw.ids;

/** The tree: Gigs holding Friday and Scratch, and Plain at the top. */
export const TREE: CollectionNode[] = raw.tree.collections.map((node) => stamped<CollectionNode>(node));

export interface WholeSet {
  plan: SetPlan;
  entries: SetEntries;
  analysis: SetAnalysis;
}

function whole(capture: { plan: unknown; entries: unknown; analysis: unknown }): WholeSet {
  return {
    plan: capture.plan as SetPlan,
    entries: capture.entries as SetEntries,
    analysis: capture.analysis as SetAnalysis,
  };
}

/** Six entries, track 1 twice, in "Warm-up", "Peak" and "Close". */
export const FRIDAY = whole(raw.friday);
/** One unnamed chapter: no heading row. */
export const PLAIN = whole(raw.plain);

export const EDITS = {
  split: { chapter: stamped(raw.edits.split.chapter) } as SetChapterChanged,
  chapterUpdated: { chapter: stamped(raw.edits.chapter_updated.chapter) } as SetChapterChanged,
  times: raw.edits.times as SetEntryPlanChanged,
  note: raw.edits.note as SetEntryPlanChanged,
  setNotes: {
    details: { ...raw.edits.set_notes.details, updated_at: STAMP },
  } as SetNotesChanged,
  acknowledged: {
    acknowledgement: stamped(raw.edits.acknowledged.acknowledgement),
  } as SetAcknowledged,
  unacknowledged: raw.edits.unacknowledged as SetUnacknowledged,
  moved: raw.edits.moved as unknown as SetEntryMoved,
  chapterMoved: { chapter: stamped(raw.edits.chapter_moved.chapter) } as SetChapterChanged,
  chapterDeleted: {
    deleted_chapter_id: raw.edits.chapter_deleted.deleted_chapter_id,
    joined: stamped(raw.edits.chapter_deleted.joined),
  } as SetChapterDeleted,
  repeatInserted: raw.edits.repeat_inserted as unknown as { entry: CollectionEntry },
  removed: raw.edits.removed as { removed: number },
};

export const REFUSALS = {
  setGone: refusal(raw.refusals.set_gone),
  badTime: refusal(raw.refusals.bad_time),
  lastChapter: refusal(raw.refusals.last_chapter),
  splitAtStart: refusal(raw.refusals.split_at_start),
};

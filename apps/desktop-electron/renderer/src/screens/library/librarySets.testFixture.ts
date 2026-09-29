/**
 * The engine's own answers about Sets in the Library, typed for the tests
 * (PREP-09). Read by tests only.
 *
 * `librarySets.fixture.json` is produced by
 * `src/tests/unit/engine/test_library_sets_fixture.py` from a real engine and
 * a real database. This module only gives it the renderer's types, and puts
 * back the two timestamps the producer strips so the file does not rewrite
 * itself on every run. A refusal is lifted as `engineClient.ts`'s
 * `readSetAnswer` lifts it, which PREP-08's contract test holds to the engine.
 */
import type {
  BatchResult,
  CollectionNode,
  CollectionSubtree,
  LibrarySearchResponse,
  LibraryTrackDetail,
  RefreshReferences,
  SetAnswer,
  SetCreated,
  SetCreatedFrom,
  SetEntries,
  SetListSave,
  SetListText,
  SetRefusal,
} from "../../api/cuepointBridge.types";
import raw from "./librarySets.fixture.json";

const STAMP = "2026-09-29T10:00:00Z";

function stamped(node: unknown): CollectionNode {
  return { ...(node as object), created_at: STAMP, updated_at: STAMP } as CollectionNode;
}

function created(answer: { set: unknown }): SetCreated {
  return { set: stamped(answer.set) };
}

function createdFrom(answer: { set: unknown; source: unknown; track_count: number }): SetCreatedFrom {
  return {
    set: stamped(answer.set),
    source: answer.source as SetCreatedFrom["source"],
    track_count: answer.track_count,
  };
}

/** A refused request as `readSetAnswer` hands it to the renderer. */
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

/** CuePoint's tree: a folder, a Collection, a Smart Collection and six Sets. */
export const TREE: CollectionNode[] = raw.tree.collections.map(stamped);

export function nodeNamed(name: string, kind?: CollectionNode["kind"]): CollectionNode {
  const found = TREE.find((node) => node.name === name && (!kind || node.kind === kind));
  if (!found) throw new Error(`no ${kind ?? "node"} called ${name} in the fixture`);
  return found;
}

export const FRIDAY = nodeNamed("Friday", "set");
export const EMPTY_SET = nodeNamed("Empty", "set");
export const WARMUP = nodeNamed("Warm-up", "collection");
export const SMART = nodeNamed("Ada", "smart");
export const GIGS = nodeNamed("Gigs", "folder");

export const CREATED = created(raw.created);
export const CREATED_FROM_COLLECTION = createdFrom(raw.created_from_collection);
export const CREATED_FROM_SMART = createdFrom(raw.created_from_smart);
export const CREATED_FROM_PLAYLIST = createdFrom(raw.created_from_playlist);
/** "Picked", made from tracks 5, 3 and 1 in that order, after the tree was read (PREP-12). */
export const CREATED_FROM_SELECTION = createdFrom(raw.created_from_selection);
/** "Picked"'s entries, with the most a Set holds as the engine sends it. */
export const SELECTION_ENTRIES = raw.selection_entries as unknown as SetEntries;
export const DUPLICATED = created(raw.duplicated);
export const SET_GONE = refusal(raw.set_gone);

export const ADDED_TO_SET = raw.added_to_set.applied as unknown as BatchResult;
export const SET_BROWSE = raw.set_browse as unknown as LibrarySearchResponse;
export const TRACK_DETAIL = raw.track_detail as unknown as LibraryTrackDetail;
export const REFERENCES = raw.references as RefreshReferences;
export const DELETE_PREVIEW = raw.delete_preview.removes as CollectionSubtree;

export const SET_LIST_TEXT = raw.set_list_text as SetListText;
export const SET_LIST_SAVED = raw.set_list_saved as unknown as SetListSave;
export const SET_LIST_REFUSED = refusal(raw.set_list_refused);

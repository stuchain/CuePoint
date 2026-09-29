/**
 * The engine's own answers about the source panel and lanes, typed for the
 * tests (PREP-11). Read by tests only.
 *
 * `prepareSource.fixture.json` is produced by
 * `src/tests/unit/engine/test_prepare_source_fixture.py` from a real engine and
 * a real database. This module gives it the renderer's types, puts back the
 * timestamps the producer strips, and lifts a refusal as `engineClient.ts`'s
 * `readSetAnswer` does.
 */
import type {
  CollectionEntry,
  CollectionNode,
  LibraryPlaylistNode,
  LibrarySearchResponse,
  SetAnalysis,
  SetEntries,
  SetPlan,
  SetRefusal,
  SetSuggestions,
} from "../../api/cuepointBridge.types";
import raw from "./prepareSource.fixture.json";

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

export const SOURCE_IDS = raw.ids;

/** Gigs holding Build; Crate, House, Shape, Blank and Scratch. */
export const SOURCE_TREE: CollectionNode[] = raw.tree.collections.map((node) =>
  stamped<CollectionNode>(node),
);

/** CRATES, holding the Rekordbox playlist Warmers. */
export const SOURCE_PLAYLISTS = raw.playlists.playlists as unknown as LibraryPlaylistNode[];

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

/** Open (Open One, Open Two, Bridge Deep), then Peak (Peak Loud, Peak Two), 140–150. */
export const BUILD = whole(raw.build);
/** Every case a lane draws, in two chapters. */
export const SHAPE = whole(raw.shape);
/** No entries: nothing to fit against. */
export const BLANK = whole(raw.blank);

const answers = raw.suggestions as unknown as Record<string, SetSuggestions>;

/** What fits each gap of Build, as the engine answered. */
export const SUGGESTIONS = {
  /** Between Open One and Open Two: both sides, Bridge Deep marked. */
  both: answers.both,
  /** Bridge Deep (125) into Peak Loud (145): nothing bridges, keys clash. */
  noFit: answers.no_fit,
  noFitBefore: answers.no_fit_before,
  noFitAfter: answers.no_fit_after,
  /** After Peak Two, inside Peak's range. */
  end: answers.end,
  poolCollection: answers.pool_collection,
  poolSmart: answers.pool_smart,
  poolPlaylist: answers.pool_playlist,
};

const browse = raw.browse as unknown as Record<string, LibrarySearchResponse>;

/** The Library tab's reads. */
export const BROWSE = {
  library: browse.library,
  search: browse.search,
  crate: browse.crate,
};

/** An insert at a gap, naming its chapter. */
export const INSERTED = raw.inserted as unknown as { entry: CollectionEntry };

export const SOURCE_REFUSALS = {
  stale: refusal(raw.refusals.stale),
  emptySet: refusal(raw.refusals.empty_set),
  setGone: refusal(raw.refusals.set_gone),
};

/** Authenticated HTTP client for the loopback engine (main process only). */

import { collectSseUntilTerminal } from "./sseClient.js";

export interface EngineApiError {
  code: string;
  message: string;
  /** Present on a 500 the engine itself reported (REPORT-03). */
  report_id?: string;
}

/** The code of an answer that did not name one. */
export const ENGINE_REQUEST_FAILED = "ENGINE_REQUEST_FAILED";

/**
 * An engine answer that was not a success, with what the envelope said about it
 * (REPORT-04, DEC-126).
 *
 * `message` is the words a person reads and is what the old plain `Error` carried.
 * `status` and `code` say whether it is a refusal (below 500) or a failure, and
 * `reportId` names the engine's own report of a 500, so main and the renderer
 * do not report it a second time. A fetch that fails because the engine is down is
 * not one of these: nothing answered.
 */
export class EngineError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reportId: string | null;

  constructor(
    message: string,
    fields: { status: number; code?: string | null; reportId?: string | null },
  ) {
    super(message);
    this.name = "EngineError";
    this.status = fields.status;
    this.code = fields.code || ENGINE_REQUEST_FAILED;
    this.reportId = fields.reportId || null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The error for a failed answer. `error` is the envelope's `error` object when
 * the body had one, and anything else when it had none.
 */
export function engineErrorFrom(res: { status: number }, error: unknown): EngineError {
  const fields = isRecord(error) ? error : {};
  const text = (value: unknown): string | null =>
    typeof value === "string" && value !== "" ? value : null;
  return new EngineError(text(fields.message) ?? `Engine request failed (${res.status})`, {
    status: res.status,
    code: text(fields.code),
    reportId: text(fields.report_id),
  });
}

/**
 * Headers that link an engine request to the report main may make about it
 * (REPORT-04, DEC-126): the SDK's `sentry-trace` and `baggage`. Set once, by
 * `setupMainReporting`, and only when reporting is set up; nothing is added
 * otherwise. Never throws, since a request must not fail for a header.
 */
let traceHeaders: (() => Record<string, string>) | null = null;

export function setEngineTraceHeaders(provider: (() => Record<string, string>) | null): void {
  traceHeaders = provider;
}

function currentTraceHeaders(): Record<string, string> {
  if (traceHeaders === null) return {};
  try {
    return traceHeaders();
  } catch {
    return {};
  }
}

/** The two thumbnail sizes the engine makes (CLEAN-09): a table row, the Inspector. */
export type ArtworkSize = "row" | "inspector";

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // A body that is not JSON (a proxy's page, an empty answer) still has a status.
    const failed = (await res.json().catch(() => null)) as { error?: EngineApiError } | null;
    throw engineErrorFrom(res, failed?.error);
  }
  return (await res.json()) as T;
}

/**
 * The refusal codes a Rekordbox export answers as a value rather than a throw
 * (EXPORT-06). A rejection reaches the renderer as its message alone, and the
 * reason beside it is what says whether to import, find the file again, choose
 * another destination or wait for a job.
 */
export const REKORDBOX_EXPORT_REFUSAL_CODES: readonly RekordboxExportRefusalCode[] = [
  "REKORDBOX_EXPORT_SOURCE_REFUSED",
  "REKORDBOX_EXPORT_DESTINATION_REFUSED",
  "LIBRARY_BUSY",
];

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Read an answer that may be one of the refusals above. Any other failure is
 * thrown, as `readJson` throws it: a malformed request is a bug, not a state
 * to draw.
 */
async function readRefusable<T>(
  res: Response,
): Promise<{ body: T; refusal: null } | { body: null; refusal: RekordboxExportRefusal }> {
  let body: T & { error?: EngineApiError & Record<string, unknown> };
  try {
    body = (await res.json()) as T & { error?: EngineApiError & Record<string, unknown> };
  } catch {
    if (res.ok) throw new Error(`Engine request failed (${res.status})`);
    throw engineErrorFrom(res, undefined);
  }
  if (res.ok) return { body, refusal: null };
  const error = body.error;
  if (error && (REKORDBOX_EXPORT_REFUSAL_CODES as readonly string[]).includes(error.code)) {
    return {
      body: null,
      refusal: {
        code: error.code as RekordboxExportRefusalCode,
        message: error.message,
        reason: textOrNull(error.reason) as RekordboxExportRefusal["reason"],
        path: textOrNull(error.path),
        job_id: textOrNull(error.job_id),
        job_type: textOrNull(error.job_type),
      },
    };
  }
  throw engineErrorFrom(res, error);
}

/**
 * The refusal codes a Discover route answers as a value (DISCOVER-09).
 *
 * Wider than the export's list on purpose: DISCOVER-04 to DISCOVER-08 each
 * asked for their refused values and missing runs to cross as values too, so
 * a form can say what the engine refused, in its words, rather than fail.
 * What is left to throw — an unreachable library, a bug — is nothing a
 * person can act on.
 */
export const DISCOVER_REFUSAL_CODES: readonly DiscoverRefusalCode[] = [
  "BEATPORT_REFUSED",
  "INVALID_REQUEST",
  "DISCOVER_BUSY",
  "DISCOVERY_RUN_NOT_FOUND",
  "DISCOVERY_RUN_RUNNING",
  "TRACK_NOT_FOUND",
];

/** DISCOVER-01's classes, so a reason the engine never sends reads as none. */
export const BEATPORT_ERROR_CLASSES: readonly BeatportErrorClass[] = [
  "no_token",
  "rejected",
  "forbidden",
  "rate_limited",
  "unavailable",
];

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Read a Discover answer: the value, or a refusal as a value. Any other
 * failure is thrown, as `readJson` throws it.
 */
async function readDiscover<T>(res: Response): Promise<DiscoverAnswer<T>> {
  let body: T & { error?: Record<string, unknown> };
  try {
    body = (await res.json()) as T & { error?: Record<string, unknown> };
  } catch {
    if (res.ok) throw new Error(`Engine request failed (${res.status})`);
    throw engineErrorFrom(res, undefined);
  }
  if (res.ok) return { value: body, refusal: null };
  const error = body?.error;
  const code = textOrNull(error?.code);
  if (error && code !== null && (DISCOVER_REFUSAL_CODES as readonly string[]).includes(code)) {
    const reason = textOrNull(error.reason);
    return {
      value: null,
      refusal: {
        code: code as DiscoverRefusalCode,
        message: textOrNull(error.message) ?? `Engine request failed (${res.status})`,
        reason:
          reason !== null && (BEATPORT_ERROR_CLASSES as readonly string[]).includes(reason)
            ? (reason as BeatportErrorClass)
            : null,
        retry_after: numberOrNull(error.retry_after),
        job_id: textOrNull(error.job_id),
        job_type: textOrNull(error.job_type),
      },
    };
  }
  throw engineErrorFrom(res, error);
}

/** A query string from the values given; absent and null are left out. */
function discoverQuery(
  values: Record<string, string | number | boolean | null | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

/**
 * The refusal codes a Set route answers as a value (PREP-08).
 *
 * `INVALID_REQUEST` is among them, as it is among Discover's: a typed time the
 * Set refuses, a full Set or a warning that has gone is said beside the field
 * that sent it, in the engine's words. What is left to throw — an unreachable
 * library, a bug — is nothing a person can act on.
 */
export const SET_REFUSAL_CODES: readonly SetRefusalCode[] = [
  "INVALID_REQUEST",
  "SET_NOT_FOUND",
  "SET_INSERTION_POINT_REFUSED",
  "SET_LIST_DESTINATION_REFUSED",
  "SET_LIST_WRITE_FAILED",
];

/** Every reason a Set refusal names, so one the engine never sends reads as none. */
export const SET_REFUSAL_REASONS: readonly NonNullable<SetRefusal["reason"]>[] = [
  "set",
  "chapter",
  "entry",
  "empty_set",
  "no_neighbour",
  "stale",
  "destination_blank",
  "destination_not_set_list",
  "destination_is_folder",
  "destination_folder_missing",
];

/**
 * Read a Set answer: the value, or a refusal as a value. Any other failure is
 * thrown, as `readJson` throws it.
 */
async function readSetAnswer<T>(res: Response): Promise<SetAnswer<T>> {
  let body: T & { error?: Record<string, unknown> };
  try {
    body = (await res.json()) as T & { error?: Record<string, unknown> };
  } catch {
    if (res.ok) throw new Error(`Engine request failed (${res.status})`);
    throw engineErrorFrom(res, undefined);
  }
  if (res.ok) return { value: body, refusal: null };
  const error = body?.error;
  const code = textOrNull(error?.code);
  if (error && code !== null && (SET_REFUSAL_CODES as readonly string[]).includes(code)) {
    const reason = textOrNull(error.reason);
    return {
      value: null,
      refusal: {
        code: code as SetRefusalCode,
        message: textOrNull(error.message) ?? `Engine request failed (${res.status})`,
        reason:
          reason !== null && (SET_REFUSAL_REASONS as readonly string[]).includes(reason)
            ? (reason as NonNullable<SetRefusal["reason"]>)
            : null,
        path: textOrNull(error.path),
      },
    };
  }
  throw engineErrorFrom(res, error);
}

/**
 * The refusal codes a waveform route answers as a value (WAVE-03).
 *
 * `WAVEFORMS_SETTING_FAILED` is among them: a pause that could not be saved
 * changed nothing, and the words say so rather than an error dialog.
 */
export const WAVEFORM_REFUSAL_CODES: readonly WaveformRefusalCode[] = [
  "INVALID_REQUEST",
  "WAVEFORMS_SETTING_FAILED",
  "WAVEFORMS_STORE_FAILED",
];

/**
 * A waveform's bytes from the engine's base64, as an array of exactly them.
 *
 * Copied out of the `Buffer`: a small one is a view on Node's shared pool,
 * and IPC would carry the whole pool for every track.
 */
export function waveformBytes(data: string | null): Uint8Array | null {
  return data === null ? null : new Uint8Array(Buffer.from(data, "base64"));
}

/** Read a waveform answer: the value, or a refusal as a value. Anything else throws. */
async function readWaveformAnswer<T>(res: Response): Promise<WaveformAnswer<T>> {
  let body: T & { error?: Record<string, unknown> };
  try {
    body = (await res.json()) as T & { error?: Record<string, unknown> };
  } catch {
    if (res.ok) throw new Error(`Engine request failed (${res.status})`);
    throw engineErrorFrom(res, undefined);
  }
  if (res.ok) return { value: body, refusal: null };
  const error = body?.error;
  const code = textOrNull(error?.code);
  if (error && code !== null && (WAVEFORM_REFUSAL_CODES as readonly string[]).includes(code)) {
    return {
      value: null,
      refusal: {
        code: code as WaveformRefusalCode,
        message: textOrNull(error.message) ?? `Engine request failed (${res.status})`,
      },
    };
  }
  throw engineErrorFrom(res, error);
}

export interface LibraryTrackRow {
  id: number | null;
  rekordbox_track_id: string;
  title: string;
  artist: string;
  remixer: string | null;
  album: string | null;
  label: string | null;
  genre: string | null;
  key: string | null;
  bpm: number | null;
  year: number | null;
  duration_seconds: number | null;
  rating: number | null;
  play_count: number | null;
  colour: string | null;
  date_added: string | null;
  comment: string | null;
  bitrate: number | null;
  file_path: string;
  /** What to draw: CuePoint's rating when there is one, else Rekordbox's. */
  effective_rating: number | null;
  /** Which of the two layers `effective_rating` came from (DEC-057). */
  rating_source: "cuepoint" | "rekordbox" | null;
  favorite: boolean;
  /** CLEAN-05: the five overridable fields as a user sees them, and which an override supplies. */
  effective_key?: string | null;
  /** PAGES-15: whose key it is (`yours` or `beatport`), and its name; null when the track has none. */
  key_source?: "yours" | "beatport" | null;
  key_name?: string | null;
  /** FLW-5: what a search matched this row on besides its words; null for its words. */
  matched_on?: "key" | "bpm" | null;
  effective_bpm?: number | null;
  effective_genre?: string | null;
  effective_label?: string | null;
  effective_year?: number | null;
  overridden?: Array<"key" | "bpm" | "genre" | "label" | "year">;
  /** CLEAN-13: where each override came from — a Beatport match or a person. */
  override_sources?: Partial<Record<"key" | "bpm" | "genre" | "label" | "year", OverrideSource>>;
  /** CLEAN-11: where the track stands, read through each filter's expression. */
  match_state?: MatchStateValue | null;
  match_disputed?: boolean | null;
  /** CLEAN-13: the score of the candidate the state points at. */
  match_score?: number | null;
  file_status?: FileStatusValue | null;
  artwork?: ArtworkStateValue | null;
}

/** Where an override came from (CLEAN-05): applied from Beatport, or typed. */
export type OverrideSource = "beatport" | "cuepoint";

/**
 * CuePoint's own organization (ORG-08).
 *
 * These mirror `organization_api.py`'s explicit field lists. They are declared
 * twice — here for the main process and in `cuepointBridge.types.ts` for the
 * renderer — because neither process can import the other's, and the contract
 * test compares them.
 */
export type CollectionKind = "folder" | "collection" | "smart" | "set";

export interface CollectionNode {
  id: number;
  parent_id: number | null;
  kind: CollectionKind;
  name: string;
  position: number;
  depth: number;
  /** A Smart Collection's saved rules; null for anything else (DEC-061). */
  rules: FilterRuleSet | null;
  sort: string | null;
  dir: "asc" | "desc" | null;
  frozen_from_id: number | null;
  frozen_at: string | null;
  /** Rows held, duplicates counted — DEC-058 lets the two counts differ. */
  entry_count: number;
  track_count: number;
  /** A Smart Collection whose saved rules cannot be run right now (ORG-06). */
  broken: boolean;
  problem: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionTree {
  collections: CollectionNode[];
  total: number;
}

/** One track's place in one Collection. Removal addresses `id` (DEC-058). */
export interface CollectionEntry {
  id: number;
  collection_id: number;
  track_id: number;
  position: number;
  added_at: string;
}

export interface CollectionEntryPage {
  collection_id: number;
  entries: CollectionEntry[];
  entry_count: number;
  track_count: number;
  offset: number;
}

/** What a subtree delete would take, or did (ORG-09's confirmation). */
export interface CollectionSubtree {
  folders: number;
  collections: number;
  smart_collections: number;
  /** Sets that would go (PREP-02); `nodes` counts them. */
  sets: number;
  entries: number;
  nodes: number;
}

export interface CollectionAdded {
  added: number;
  skipped: number;
  added_track_ids: number[];
  skipped_track_ids: number[];
}

export interface FrozenCollection {
  collection: CollectionNode;
  source_id: number;
  source_name: string;
  track_count: number;
}

export interface Tag {
  id: number;
  name: string;
  category: string | null;
  colour: string | null;
  created_at: string;
}

export interface TagUsage extends Tag {
  track_count: number;
}

export interface TagVocabulary {
  tags: TagUsage[];
  categories: string[];
}

/** CuePoint's layer for one track, notes included (DEC-057). */
export interface TrackMetadata {
  track_id: number;
  rating: number | null;
  rekordbox_rating: number | null;
  effective_rating: number | null;
  rating_source: "cuepoint" | "rekordbox" | null;
  favorite: boolean;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** One row of a track's field history (DEC-008). */
export interface TrackFieldChange {
  id: number | null;
  track_id: number;
  field: string;
  old_value: unknown;
  new_value: unknown;
  source: string;
  changed_at: string;
  /** Shared by every row one batch wrote (DEC-063). */
  batch_id: string | null;
}

export interface TrackHistory {
  track_id: number;
  changes: TrackFieldChange[];
  limit: number;
}

/** What a batch did, in the counts a toast reads (ORG-07). */
export interface BatchResult {
  batch_id: string;
  operation: string;
  target: string;
  total: number;
  changed: number;
  unchanged: number;
  failed: number;
  cancelled: boolean;
}

/** Either counts, when it applied inline, or a job to follow (DEC-063). */
export interface BatchOutcome {
  applied?: BatchResult;
  job_id?: string;
  id?: string;
  state?: string;
}

/** A selection: the tracks in hand, or the query that names them (DEC-045). */
export interface BatchSelection {
  track_ids?: number[];
  query?: {
    q?: string;
    playlistId?: never;
    playlist_id?: number | null;
    scope?: "collection" | "smart";
    collection_id?: number | null;
    filters?: FilterRuleSet | null;
  };
  /**
   * Everything matching, minus the tracks taken back out (ORG-11, DEC-045).
   *
   * Select all and ctrl-click three tracks out again: the count on screen
   * says "minus these", and this is what makes the batch say the same. Only
   * meaningful beside `query` — a selection made of ids already lists what it
   * means, and the engine refuses both together.
   */
  exclude_track_ids?: number[];
}

export interface BatchOperation {
  kind:
    | "set_rating"
    | "set_favorite"
    | "add_tag"
    | "remove_tag"
    | "add_to_collection"
    | "remove_from_collection"
    | "accept_match"
    | "reject_match"
    | "apply_match"
    | "set_override";
  value?: number | boolean | null | string[] | { field: string; value: unknown };
}

/** One clause of a filter (DEC-043). The vocabulary comes from the engine. */
export interface FilterRule {
  field: string;
  operator: string;
  value?: unknown;
}

/** Flat and AND-only for v1 (DEC-016); `match` is on the wire from the start. */
export interface FilterRuleSet {
  match: "all";
  rules: FilterRule[];
}

export interface LibraryBrowseParams {
  q?: string;
  playlistId?: number | null;
  sort?: string;
  dir?: "asc" | "desc";
  filters?: FilterRuleSet | null;
  limit?: number;
  offset?: number;
  /**
   * CuePoint's own scope (ORG-08). A Collection opens in the order the user
   * arranged unless `sort` says otherwise; a Smart Collection resolves to the
   * rules it saved and is narrowed further by anything in `filters`.
   */
  scope?: "collection" | "smart";
  collectionId?: number | null;
  /**
   * Ask for a narrower projection of the same query.
   *
   * `id` is a selection crossing unloaded rows (DEC-045); `queue` is the
   * playable form the queue is built from (PLAYER-05). Neither is a different
   * query — same scope, filters and ordering, fewer columns.
   */
  fields?: "id" | "queue";
}

export interface LibraryPlaylistNode {
  id: number;
  parent_id: number | null;
  name: string;
  kind: "folder" | "playlist";
  depth: number;
  position: number;
  path: string;
  track_count: number;
}

export interface LibraryPlaylistTree {
  playlists: LibraryPlaylistNode[];
  total: number;
}

/** One key on the Camelot wheel and how it relates to the asked key (PAGES-10). */
export interface CompatibleKey {
  code: string;
  relation: "same" | "adjacent" | "relative";
}

/** What mixes with a key: the key in Camelot, and the wheel's lit keys. */
export interface CompatibleKeys {
  key: string;
  wheel: CompatibleKey[];
}

/** One source the Keys page counts: the whole library, a playlist, a Collection or a Set (PAGES-16). */
export interface KeySource {
  kind: "all" | "playlist" | "collection" | "set";
  /** Absent for the whole library. */
  id?: number;
}

/** One Camelot key and how many tracks in the sources hold it. */
export interface KeyPopulationEntry {
  code: string;
  count: number;
}

/** The keys of chosen sources in Camelot order; a track in several sources counts once. */
export interface KeysPopulation {
  total: number;
  keys: KeyPopulationEntry[];
  /** Tracks with no Beatport key. */
  no_key: number;
}

export interface LibraryFacetValue {
  /** Null is the "no value" bucket, which `is_empty` filters by. */
  value: string | null;
  count: number;
}

export interface LibraryFacetRange {
  field: string;
  min: number | null;
  max: number | null;
  missing: number;
}

export interface LibraryFacet {
  field: string;
  values: LibraryFacetValue[];
  truncated: boolean;
  total_values: number;
  /** Present for number fields only. */
  range: LibraryFacetRange | null;
}

/** What the Key, BPM and Genre quick filters offer for one view (FLW-4). */
export interface LibraryQuickFacets {
  /** The view's keys in Camelot order (1A, 1B, 2A ... 12B), with counts. */
  keys: Array<{ value: string; count: number }>;
  /** Tracks in the view with no Beatport key. */
  no_key: number;
  bpm: { min: number | null; max: number | null; missing: number };
  genres: Array<{ value: string; count: number }>;
  genres_total: number;
  genres_truncated: boolean;
}

export interface LibraryFilterField {
  name: string;
  type: "text" | "number" | "date" | "bool" | "tag" | "collection" | "name" | "beatport" | "source";
  label: string;
  /** LIB-7: the group the Field list shows this under; the engine's, never the renderer's. */
  group?: string;
  facetable: boolean;
  integer: boolean;
  unit: string | null;
  operators: string[];
  /** CLEAN-13: the fixed values a field holds, each named; null for the library's own. */
  choices: LibraryFilterChoice[] | null;
}

export interface LibraryFilterChoice {
  value: string;
  label: string;
}

/** How many values an operator takes, as the engine describes it. */
export interface LibraryFilterOperator {
  arity: "none" | "single" | "pair" | "list";
}

export interface LibraryFilterVocabulary {
  fields: LibraryFilterField[];
  /**
   * Every operator any field allows, and its arity. The renderer builds one
   * control for "between" and another for "is empty" from this rather than
   * from a table of its own, so it cannot offer a clause the engine refuses.
   */
  operators: Record<string, LibraryFilterOperator>;
  facetable: string[];
  sortable: string[];
}

/** Rekordbox's kinds of mark, from its `Type` 0–4 (WAVE-04). */
export type TrackCueKind = "cue" | "fade_in" | "fade_out" | "load" | "loop";

/** One cue point, loop, fade or load point, read-only from Rekordbox (DEC-118). */
export interface TrackCue {
  kind: TrackCueKind;
  /** The hot cue slot, 0–7 for A–H; null for a memory cue. */
  hot_cue: number | null;
  start_ms: number;
  /** Where a loop ends; null for anything else. */
  end_ms: number | null;
  name: string | null;
  /** `#rrggbb`, or null when Rekordbox gave no colour. */
  color: string | null;
}

/** A track's beat grid, summed up; every marker travels with its waveform (WAVE-05). */
export interface TrackBeatGridSummary {
  markers: number;
  /** The first marker's tempo. */
  bpm: number;
  min_bpm: number;
  max_bpm: number;
  /** True when the grid changes tempo, not merely when it has several markers. */
  variable: boolean;
}

/** A track's cue points and beat grid, as the track detail carries them (WAVE-04). */
export interface TrackMarksSummary {
  /**
   * Whether the library's marks have been read. False on a library imported
   * before WAVE-04 whose source has changed since: its marks arrive with the
   * next refresh, which is not the same as having none.
   */
  read: boolean;
  hot_cues: number;
  memory_cues: number;
  cues: TrackCue[];
  beat_grid: TrackBeatGridSummary | null;
}

export interface LibraryTrackDetail {
  track: LibraryTrackRow;
  playlists: LibraryPlaylistNode[];
  playlist_count: number;
  /** Its artists and label as links to their pages (DISCOVER-11). */
  credits?: TrackCreditLinks;
  /**
   * Its cue points and beat grid, read-only from Rekordbox (WAVE-04). Absent
   * from an engine older than them, which the Inspector shows as nothing.
   */
  marks?: TrackMarksSummary;
}

export interface LibrarySearchResponse {
  query: string;
  total: number;
  limit: number;
  offset: number;
  tracks: LibraryTrackRow[];
  /** True when nothing has been imported yet — a different problem from "no
   *  matches", and one with a different answer in the UI. */
  library_empty: boolean;
  /**
   * What the engine was asked, echoed back (LIBUI-03). Optional because the
   * fixtures written against SHELL-04's shape are still valid requests; the
   * engine always sends them.
   */
  mode?: "search" | "browse";
  scope?: number | null;
  sort?: string;
  dir?: "asc" | "desc";
  /**
   * The rule set the request carried, echoed like the rest — a filter changes
   * neither scope, sort nor text, so without it two requests produce responses
   * nothing can tell apart (LIBUI-05).
   */
  filters?: FilterRuleSet | null;
  /**
   * What actually ran, a Smart Collection's saved clauses included (ORG-13).
   *
   * Separate from `filters`, which echoes the request: inside a Smart
   * Collection the request carries no clauses at all — the scope carries the
   * question (DEC-061) — and a staleness check comparing the two has to be
   * comparing the same thing.
   */
  filters_applied?: FilterRuleSet | null;
  /** CuePoint's own scope, echoed back beside Rekordbox's (ORG-08). */
  collection_scope?: "collection" | "smart" | null;
  collection_id?: number | null;
  /** Present only when ids were asked for; `tracks` is then empty. */
  track_ids?: number[];
  /** Present only when queue entries were asked for; `tracks` is then empty. */
  queue_tracks?: QueueTrackRow[];
}

/**
 * A track as a playback queue entry (PLAYER-05).
 *
 * Seven fields, because DEC-012 turns a whole view into a queue and a view can
 * be tens of thousands of rows. `file_path` is what the player opens; the rest
 * is what the player bar and the queue panel show.
 */
export interface QueueTrackRow {
  id: number;
  title: string;
  artist: string;
  /** What a DJ reads off a player, so the bar shows it without a second fetch. */
  key: string | null;
  bpm: number | null;
  duration_seconds: number | null;
  file_path: string;
}

export interface LibrarySourceInfo {
  xml_path: string;
  imported_at: string;
  xml_modified_at: string | null;
  xml_size_bytes: number | null;
  track_count: number;
  playlist_count: number;
  /** Whether the export can still be read where it was imported from. */
  exists: boolean;
  /**
   * Whether it differs from the import, or null when that cannot be known —
   * the file is gone, or the import never recorded its state. Null means
   * "re-read it", never "assume unchanged".
   */
  changed: boolean | null;
}

export interface LibrarySummary {
  track_count: number;
  playlist_count: number;
  playlist_entry_count: number;
  library_empty: boolean;
  /** Null before any import has completed. */
  source: LibrarySourceInfo | null;
}

export interface LibraryImportStarted {
  job_id: string;
  id: string;
  state: string;
}

/**
 * A refresh preview or apply, started (LIBRARY-10).
 *
 * Same shape as an import's: both are background jobs, and the renderer follows
 * either through the job endpoints it already uses. The diff a preview computed
 * arrives as that job's `result`, from `getJobResults`.
 */
export interface LibraryRefreshStarted {
  job_id: string;
  id: string;
  state: string;
}

export interface EngineJobSummary {
  id: string;
  type: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  created_at: string;
  updated_at: string;
  demo?: boolean;
  /** The engine's `progress_to_dict` payload; the renderer owns its typing. */
  progress?: Record<string, unknown>;
  error?: { code?: string; message?: string };
}

export interface EngineJobList {
  jobs: EngineJobSummary[];
  /** Active jobs in total, regardless of the state filter or the limit. */
  active_count: number;
}

export interface ActivityEvent {
  id: number | null;
  type: string;
  summary: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface ActivityFeed {
  events: ActivityEvent[];
  /** Every event ever recorded, not the page length. */
  total: number;
  limit: number;
}

/**
 * Clean (CLEAN-11).
 *
 * Mirrors `clean_api.py`'s explicit field lists, and `cuepointBridge.types.ts`'s
 * copy of them; the desktop contract test compares the two.
 */
export type MatchStateValue =
  | "not_matched"
  | "no_match"
  | "needs_review"
  | "accepted"
  | "rejected";
export type FileStatusValue = "present" | "missing" | "unreadable" | "not_checked";
export type ArtworkStateValue = "embedded" | "beatport" | "none" | "unknown";

/** A job Clean started, in the shape every job route answers with. */
export interface CleanJobStarted {
  job_id: string;
  id: string;
  state: string;
}

export interface MatchStarted extends CleanJobStarted {
  selected: number;
  excluded: number;
  planned: number;
  resumed_from: string | null;
}

export interface ResumableMatch {
  job_id: string;
  remaining: number;
  planned: number;
  selected: number;
  excluded: number;
  rematch: boolean;
  created_at: string;
  resumed_from: string | null;
}

export interface ResumableMatches {
  jobs: ResumableMatch[];
  total: number;
}

export interface TrackMatchState {
  track_id: number;
  state: MatchStateValue;
  decided_by: "auto" | "user" | null;
  attempt_id: number | null;
  candidate_id: number | null;
  newer_attempt_id: number | null;
  disputed: boolean;
  decided_at: string | null;
}

export interface MatchAttempt {
  id: number;
  track_id: number;
  job_id: string | null;
  outcome: "matched" | "no_match" | "error";
  score: number | null;
  best_candidate_id: number | null;
  error: string | null;
  input: Record<string, unknown>;
  queries: unknown[];
  matcher_version: string | null;
  started_at: string;
  finished_at: string;
}

export interface MatchCandidate {
  id: number;
  attempt_id: number;
  rank: number;
  is_winner: boolean;
  guard_ok: boolean;
  reject_reason: string | null;
  score: number;
  base_score: number | null;
  title_sim: number | null;
  artist_sim: number | null;
  bonus_year: number | null;
  bonus_key: number | null;
  beatport_track_id: string | null;
  url: string;
  title: string | null;
  artists: string | null;
  remixers: string | null;
  label: string | null;
  genre: string | null;
  subgenre: string | null;
  key: string | null;
  bpm: number | null;
  release_name: string | null;
  release_date: string | null;
  release_year: number | null;
  artwork_url: string | null;
  preview_url: string | null;
  query_index: number | null;
  query_text: string | null;
  candidate_index: number | null;
  elapsed_ms: number | null;
  mix: string | null;
  differs: CandidateDifferences | null;
}

/** Whether a candidate differs from the track, per field; null when nothing to compare. */
export interface CandidateDifferences {
  title: boolean | null;
  artists: boolean | null;
  mix: boolean | null;
  remixers: boolean | null;
  label: boolean | null;
  genre: boolean | null;
  key: boolean | null;
  bpm: boolean | null;
  year: boolean | null;
}

/** A track's imported values, the side of the comparison candidates are marked against. */
export interface ComparedTrack {
  title: string;
  artist: string;
  mix: string | null;
  remixer: string | null;
  album: string | null;
  label: string | null;
  genre: string | null;
  key: string | null;
  bpm: number | null;
  year: number | null;
}

export interface TrackMatches {
  track_id: number;
  track: ComparedTrack;
  state: TrackMatchState;
  candidate: MatchCandidate | null;
  attempts: MatchAttempt[];
  total: number;
}

/** Where "show in folder" can take a person for one track (CLEAN-12). */
export interface TrackFolder {
  track_id: number;
  file_path: string;
  file_exists: boolean;
  folder: string | null;
}

export interface AttemptCandidates {
  attempt_id: number;
  track_id: number;
  candidates: MatchCandidate[];
  total: number;
}

/** One track decided inline, or a selection applied inline or as a job. */
export interface DecisionOutcome {
  match?: TrackMatchState;
  applied?: BatchResult;
  job_id?: string;
  id?: string;
  state?: string;
}

export interface ApplyOutcome {
  track?: LibraryTrackRow;
  applied?: BatchResult;
  job_id?: string;
  id?: string;
  state?: string;
}

export interface FieldRevert {
  change_id: number;
  track_id: number;
  field: string;
  previous_value: unknown;
  restored_value: unknown;
  changed: boolean;
}

export interface BatchRevertResult extends BatchResult {
  skipped: number;
  revert_of: string;
}

export interface BatchRevertOutcome {
  reverted?: BatchRevertResult;
  job_id?: string;
  id?: string;
  state?: string;
}

export interface FileCheckStarted extends CleanJobStarted {
  tracks: number;
}

export interface DuplicateGroup {
  id: number;
  signal: "path" | "beatport" | "text";
  group_key: string;
  computed_at: string;
  track_ids: number[];
  dismissed: boolean;
}

/** A group as the listing answers it: with its members as Library rows. */
export interface ListedDuplicateGroup extends DuplicateGroup {
  members: LibraryTrackRow[];
}

export interface DuplicateGroupList {
  groups: ListedDuplicateGroup[];
  total: number;
  limit: number | null;
  offset: number;
}

export interface DuplicateScanStarted extends CleanJobStarted {
  signals: string[];
}

export interface ArtworkScanStarted extends CleanJobStarted {
  tracks: number;
  fetch_beatport: boolean;
}

export interface TagWriteOptions {
  key_format?: "normal" | "camelot" | "short";
  write_key?: boolean;
  write_year?: boolean;
  write_bpm?: boolean;
  write_label?: boolean;
  write_genre?: boolean;
  write_comment?: boolean;
  comment_text?: string;
  embed_missing_artwork?: boolean;
}

export interface TagWritePreview {
  preview_id: string;
  options: Required<TagWriteOptions>;
  total: number;
  files: number;
  fields: Record<string, number>;
  skipped: Record<string, { count: number; examples: Array<{ track_id: number | null; file_path: string }> }>;
  field_skipped: Record<string, Record<string, number>>;
  changes: Array<{
    track_id: number;
    file_path: string;
    fields: Record<string, { from: string | null; to: string }>;
    artwork: boolean;
  }>;
  cancelled: boolean;
  computed_at: string;
  duration_seconds: number;
  summary_line: string;
}

export interface TagPreviewOutcome {
  preview?: TagWritePreview;
  preview_id?: string;
  job_id?: string;
  id?: string;
  state?: string;
}

export interface TagWriteStarted extends CleanJobStarted {
  preview_id: string;
}

export interface TagRestoreStarted extends CleanJobStarted {
  writes: number;
  unconfirmed: number;
  restored_job_id: string | null;
  track_id: number | null;
}

export interface FileWriteRecord {
  id: number;
  job_id: string;
  track_id: number | null;
  file_path: string;
  field: string;
  old_value: unknown;
  old_value_read: boolean;
  new_value: unknown;
  outcome: "written" | "skipped" | "failed" | "restored";
  reason: string | null;
  written_at: string;
  pending: boolean;
  restore_of: number | null;
}

export interface TagWriteRecord {
  job_id: string | null;
  track_id: number | null;
  writes: FileWriteRecord[];
  total: number;
  unconfirmed: number;
  restorable: number;
  restorable_unconfirmed: number;
  limit: number;
  offset: number;
}

export interface HealthCount {
  id: string;
  label: string;
  count: number;
  rules: FilterRuleSet;
}

export interface HealthDetection {
  id: string;
  label: string;
  job_type: string;
  last_run_at: string | null;
  last_summary: string | null;
}

export interface UnavailableRoot {
  root: string;
  tracks: number;
  summary: string;
}

export interface LibraryHealth {
  track_count: number;
  counts: HealthCount[];
  detections: HealthDetection[];
  unavailable_roots: UnavailableRoot[];
}

// ---------------------------------------------------------------------------
// Statistics over the wire (STATS-02, STATS-03, STATS-04)
//
// Mirrors `statistics_api.py` and the service's `to_dict` answers. The Python
// contract test holds these interfaces to the real payloads.
// ---------------------------------------------------------------------------

/** A tracks count and the rules that open exactly those tracks in the Library. */
export interface StatisticsCount {
  count: number;
  rules: FilterRuleSet;
}

export interface StatisticsTrack {
  id: number;
  title: string;
  artist: string;
  plays: number;
}

export interface StatisticsArtist {
  name: string;
  name_key: string;
  plays: number;
  tracks: number;
  rules: FilterRuleSet;
  /** True when `rules` open more tracks than were counted (since a date or a read). */
  opens_more: boolean;
}

export interface StatisticsLabel {
  name: string;
  label_key: string;
  plays: number;
  tracks: number;
  rules: FilterRuleSet;
  opens_more: boolean;
}

export interface StatisticsPlays {
  since: string | null;
  since_clamped: boolean;
  history_from: string | null;
  last_read: string | null;
  /** That read's id: what `sinceRead` takes for "since your last refresh". */
  last_read_id: number | null;
  tracks: StatisticsTrack[];
  artists: StatisticsArtist[];
  labels: StatisticsLabel[];
  never_played: StatisticsCount;
  unknown: StatisticsCount;
}

/** `library`, `collection:<id>` or `playlist:<id>`. */
export type StatisticsScope = string;

export interface StatisticsPlaysParams {
  limit?: 10 | 25 | 50 | 100 | 200;
  /** A local day, YYYY-MM-DD; sent with `tz`. */
  since?: string;
  /** The UTC offset at local midnight of `since`, as +HH:MM or -HH:MM. */
  tz?: string;
  /** A history read's id: counts the rises at it and after it. */
  sinceRead?: string;
  scope?: StatisticsScope;
}

/** One bar of a spread; `rules` is null where no rule can open it. */
export interface StatisticsBucket {
  label: string;
  value: string | number | null;
  count: number;
  rules: FilterRuleSet | null;
}

/** A line beside the bars: tracks with no value, or no file. */
export interface StatisticsLine {
  label: string;
  count: number;
  rules: FilterRuleSet | null;
}

export interface StatisticsSpread {
  buckets: StatisticsBucket[];
  unknown: StatisticsLine;
  /** Loudness only: tracks with no present file. */
  no_file?: StatisticsLine;
  total: number;
}

export interface StatisticsSpreads {
  scope: StatisticsScope;
  total: number;
  genre: StatisticsSpread;
  tempo: StatisticsSpread;
  year: StatisticsSpread;
  date_added: StatisticsSpread;
  rating: StatisticsSpread;
  loudness: StatisticsSpread;
}

export type StatisticsFileState = "present" | "missing" | "unreadable" | "not_checked";
export type StatisticsMatchState =
  | "accepted"
  | "needs_review"
  | "rejected"
  | "no_match"
  | "not_matched";

export interface StatisticsAnalyzed {
  analyzed: number;
  failed: number;
  waiting: number;
  no_file: number;
}

export interface StatisticsHealth {
  scope: StatisticsScope;
  total: number;
  files: Record<StatisticsFileState, StatisticsCount>;
  beatport: Record<StatisticsMatchState, StatisticsCount>;
  analyzed: StatisticsAnalyzed;
  checked_at: string | null;
}

export type ReviewExportFormat = "csv" | "json" | "excel";

export interface ReviewExportResult {
  file_path: string;
  format: ReviewExportFormat;
  count: number;
  columns: string[];
}

// --- The Rekordbox export (EXPORT-06) ----------------------------------------
// Not the CSV, JSON and Excel export above (`ReviewExportResult`): every name
// here says Rekordbox, as the routes under /api/v1/rekordbox-export/ do.

/** The three key notations an export can write (DEC-089); `normal` is classic. */
export type RekordboxKeyFormat = "normal" | "camelot" | "short";

/** The six values an export can rewrite on a track, in the export's order. */
export type RekordboxExportField = "key" | "bpm" | "genre" | "label" | "year" | "rating";

/** The source file as the import recorded it, beside how it is now (DEC-082). */
export interface RekordboxExportSourceState {
  path: string;
  /** `null` when the import recorded nothing to compare with: not "unchanged". */
  stale: boolean | null;
  signals: Array<"mtime" | "size">;
  recorded_modified_at: string | null;
  actual_modified_at: string | null;
  recorded_size_bytes: number | null;
  actual_size_bytes: number | null;
}

/** One playlist an export would append. */
export interface RekordboxExportPlaylistPreview {
  collection_id: number;
  kind: "collection" | "smart" | "set";
  name: string;
  /** Where it would land, the parent folder included: `CuePoint/Gigs/Saturday`. */
  path: string;
  entry_count: number;
  dropped_count: number;
  requested_count: number;
}

/** Everything an export would do, before it is asked to (DEC-084). */
export interface RekordboxExportPreview {
  source: RekordboxExportSourceState;
  key_format: RekordboxKeyFormat;
  track_count: number;
  changed_track_count: number;
  fields_changed: Partial<Record<RekordboxExportField, number>>;
  changed_fields: RekordboxExportField[];
  unknown_track_count: number;
  absent_track_count: number;
  /** `null` when no track has ever been checked (DEC-088): not zero. */
  missing_file_count: number | null;
  file_check_known: boolean;
  dropped_reference_count: number;
  changes_nothing: boolean;
  playlists: RekordboxExportPlaylistPreview[];
  playlist_folder: string | null;
  playlist_folder_renamed: boolean;
}

/** The refusals a person can act on, each with its own next step. */
export type RekordboxExportRefusalCode =
  | "REKORDBOX_EXPORT_SOURCE_REFUSED"
  | "REKORDBOX_EXPORT_DESTINATION_REFUSED"
  | "LIBRARY_BUSY";

export type RekordboxExportSourceReason =
  | "source_never_imported"
  | "source_missing"
  | "source_unreadable"
  | "source_invalid";

export type RekordboxExportDestinationReason =
  | "destination_blank"
  | "destination_is_source"
  | "destination_not_xml"
  | "destination_is_folder"
  | "destination_folder_missing";

/**
 * A refusal, as a value rather than a rejection. A rejection crosses IPC as
 * its message alone, and the reason is what says which next step to offer.
 */
export interface RekordboxExportRefusal {
  code: RekordboxExportRefusalCode;
  message: string;
  reason: RekordboxExportSourceReason | RekordboxExportDestinationReason | null;
  path: string | null;
  /** For `LIBRARY_BUSY`: the job holding the library, to follow it. */
  job_id: string | null;
  job_type: string | null;
}

/** A preview, or the refusal that stands in its place. Exactly one is set. */
export interface RekordboxExportPreviewAnswer {
  preview: RekordboxExportPreview | null;
  refusal: RekordboxExportRefusal | null;
}

/** An export started as a job: what it will write, as the engine validated it. */
export interface RekordboxExportStarted {
  job_id: string;
  id: string;
  state: string;
  collection_ids: number[];
  key_format: RekordboxKeyFormat;
  destination_path: string;
}

/** A started export, or the refusal that stands in its place. Exactly one is set. */
export interface RekordboxExportStartAnswer {
  started: RekordboxExportStarted | null;
  refusal: RekordboxExportRefusal | null;
}

/** What a finished export job answers with, as its result. */
export interface RekordboxExportResult {
  export_id: number;
  outcome: "written" | "cancelled" | "failed";
  destination_path: string;
  source_path: string;
  source_stale: boolean;
  key_format: RekordboxKeyFormat;
  track_count: number;
  changed_track_count: number;
  fields: RekordboxExportField[];
  missing_file_count: number | null;
  dropped_reference_count: number;
  playlist_count: number;
  error: string | null;
  summary: string;
  report: RekordboxExportPreview | null;
}

/** One playlist an export wrote, as it was written (DEC-086). */
export interface RekordboxExportPlaylistRecord {
  id: number;
  /** The Collection it came from, which may since have been deleted. */
  collection_id: number | null;
  kind: "collection" | "smart" | "set";
  name: string;
  path: string;
  entry_count: number;
  dropped_count: number;
  requested_count: number;
  /** A Smart Collection's rules as they were resolved; `null` for a Collection. */
  rules: FilterRuleSet | null;
}

/** One export as recorded: what CuePoint wrote, not what is on disk now. */
export interface RekordboxExportRecord {
  id: number;
  job_id: string | null;
  started_at: string;
  finished_at: string | null;
  outcome: "written" | "cancelled" | "failed";
  destination_path: string;
  source_path: string;
  source_stale: boolean;
  key_format: RekordboxKeyFormat;
  track_count: number;
  changed_track_count: number;
  fields: RekordboxExportField[];
  missing_file_count: number | null;
  file_check_known: boolean;
  dropped_reference_count: number;
  error: string | null;
  playlists: RekordboxExportPlaylistRecord[];
}

/** What the next export starts from: the last one that wrote (DEC-083). */
export interface RememberedRekordboxExport {
  /** The folder only, never the file name, so no export overwrites the last. */
  folder: string | null;
  folder_exists: boolean;
  key_format: RekordboxKeyFormat;
  export_id: number | null;
}

export interface RekordboxExportHistory {
  exports: RekordboxExportRecord[];
  limit: number;
  remembered: RememberedRekordboxExport;
}

/** The file a person chose in the save dialog, or that they chose none. */
export type RekordboxExportDestinationChoice =
  | { canceled: true }
  | { canceled: false; filePath: string };

// ---------------------------------------------------------------------------
// Discover (DISCOVER-09)
//
// Mirrors `discover_api.py` and the models it serializes. Declared twice, here
// and in the other process's copy, because neither can import the other's;
// `desktopContract.test.ts` holds the two copies together, and
// `test_discover_contract.py` holds them to what the engine actually sends.
//
// Every Discover method answers a `DiscoverAnswer`. A refusal a person can act
// on — no token, a token Beatport rejected, a job already running, a run that
// is gone, a value the engine refused — comes back as a value, because a
// rejected IPC promise reaches the renderer as its message alone (EXPORT-06).
// ---------------------------------------------------------------------------

/** DISCOVER-01's classes of Beatport failure, which every empty state is drawn from (DEC-098). */
export type BeatportErrorClass = "no_token" | "rejected" | "forbidden" | "rate_limited" | "unavailable";

/** The codes a Discover refusal can carry; any other failure throws. */
export type DiscoverRefusalCode =
  | "BEATPORT_REFUSED"
  | "INVALID_REQUEST"
  | "DISCOVER_BUSY"
  | "DISCOVERY_RUN_NOT_FOUND"
  | "DISCOVERY_RUN_RUNNING"
  | "TRACK_NOT_FOUND";

export interface DiscoverRefusal {
  code: DiscoverRefusalCode;
  message: string;
  /** For `BEATPORT_REFUSED`: which class, and so which empty state and action. */
  reason: BeatportErrorClass | null;
  /** For `rate_limited`: the seconds Beatport asked for, when it said. */
  retry_after: number | null;
  /** For `DISCOVER_BUSY`: the job already running, to follow instead. */
  job_id: string | null;
  job_type: string | null;
}

/** An answer, or the refusal standing in for it. */
export type DiscoverAnswer<T> =
  | { value: T; refusal: null }
  | { value: null; refusal: DiscoverRefusal };

export type DiscoverOwnedFilter = "hide" | "only" | "all";
export type DiscoverRunSort = "position" | "release_date" | "artist" | "title";
export type WantlistSort = "added_at" | "release_date" | "artist" | "title";
export type DiscoverSortDirection = "asc" | "desc";
export type DiscoverRunOutcome = "succeeded" | "cancelled" | "failed";
export type DiscoverSourceType = "chart" | "label_release";
export type DiscoverBeatportState = "ok" | "no_token" | "rejected" | "forbidden" | "rate_limited" | "unavailable";
export type DiscoverJobType = "discovery" | "beatport_playlist" | "beatport_resolve";
export type WantlistAction = "added" | "removed" | "noted" | "bought" | "unbought";
export type EntityKind = "artist" | "label";
export type EntityIdentity = "beatport" | "name";
export type EntityBeatportState =
  | "ok"
  | "no_token"
  | "rejected"
  | "forbidden"
  | "rate_limited"
  | "unavailable"
  | "name_only";
export type EntityNameOnlyReason = "not_resolved" | "shared" | "not_on_beatport";
export type EntityAction = "settings" | "resolve";
export type SimilarKeyNotation = "classic" | "camelot";

/** Whether a Beatport token is configured and Beatport took it; never the token. */
export interface DiscoverBeatportStatus {
  configured: boolean;
  state: DiscoverBeatportState;
  message: string | null;
  retry_after: number | null;
}

export interface DiscoverGenre {
  id: number;
  name: string;
  slug: string;
}

/** The Library's facet over a name field, as `Facet.to_dict` sends it. */
export interface DiscoverFacet {
  field: string;
  values: LibraryFacetValue[];
  truncated: boolean;
  total_values: number;
}

/** What a new run and a push start from when nothing is chosen. */
export interface DiscoverDefaults {
  genre_ids: number[];
  charts_from: string;
  charts_to: string;
  new_releases_days: number;
  playlist_name: string;
}

/** The engine's bounds, so a form refuses what the engine would. */
export interface DiscoverLimits {
  max_genres: number;
  max_window_days: number;
  max_runs: number;
  max_run_window: number;
  max_entity_window: number;
  max_change: number;
  max_playlist_tracks: number;
  max_playlist_name_length: number;
  max_note_length: number;
  max_similar: number;
}

/** What a resolve started now would read: the resolve prompt's count. */
export interface DiscoverResolvePlan {
  owned: number;
  to_read: number;
}

export interface DiscoverOptions {
  beatport: DiscoverBeatportStatus;
  genres: DiscoverGenre[];
  artists: DiscoverFacet;
  labels: DiscoverFacet;
  defaults: DiscoverDefaults;
  limits: DiscoverLimits;
  resolve: DiscoverResolvePlan;
  index_current: boolean;
}

/** An artist or label scope as a run recorded it. `picked` null is the whole library. */
export interface DiscoverRunScope {
  picked: string[] | null;
  count: number;
  linked_ids: number;
}

export interface DiscoverRunParams {
  genre_ids: number[];
  charts_from: string | null;
  charts_to: string | null;
  new_releases_days: number | null;
  releases_from: string | null;
  releases_to: string | null;
  artists: DiscoverRunScope;
  labels: DiscoverRunScope;
}

export interface DiscoverRun {
  id: number;
  job_id: string | null;
  started_at: string;
  finished_at: string | null;
  outcome: DiscoverRunOutcome | null;
  running: boolean;
  params: DiscoverRunParams;
  labels_in_scope: number;
  labels_resolved: number;
  artists_in_scope: number;
  charts_read: number;
  releases_read: number;
  tracks_found: number;
  error: string | null;
  error_class: BeatportErrorClass | null;
}

export interface DiscoverRunList {
  runs: DiscoverRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface DiscoverScopeName {
  key: string;
  name: string;
}

/** A run with the artists and labels its scope resolved to: what it looked for. */
export interface DiscoverRunHeader {
  run: DiscoverRun;
  artists: DiscoverScopeName[];
  labels: DiscoverScopeName[];
}

/** One Beatport track as every Beatport table sends it: a run, the wantlist, a page. */
export interface BeatportTrackRow {
  beatport_track_id: number;
  title: string;
  mix_name: string | null;
  url: string;
  label_id: number | null;
  label_name: string | null;
  label_key: string | null;
  release_id: number | null;
  release_name: string | null;
  release_date: string | null;
  bpm: number | null;
  key: string | null;
  genre_id: number | null;
  genre_name: string | null;
  fetched_at: string;
  artists: string[];
  remixers: string[];
  owned: boolean;
  on_wantlist: boolean;
}

/** One reason a run found a track. */
export interface DiscoverRunSource {
  source_type: DiscoverSourceType;
  source_id: number;
  source_name: string | null;
  source_url: string | null;
  matched_on: string;
}

export interface DiscoverRunTrackRow extends BeatportTrackRow {
  position: number;
  sources: DiscoverRunSource[];
}

/** The window a run's page answers, echoed so a late answer can be told apart. */
export interface DiscoverRunTracksWindow {
  owned: DiscoverOwnedFilter;
  sort: DiscoverRunSort;
  dir: DiscoverSortDirection;
  offset: number;
  limit: number;
}

export interface DiscoverRunTracksPage {
  run_id: number;
  rows: DiscoverRunTrackRow[];
  total: number;
  tracks: number;
  owned: number;
  /** "N owned tracks hidden" (DEC-092): owned tracks the filter leaves out. */
  hidden: number;
  window: DiscoverRunTracksWindow;
}

export interface DiscoverRunDeleted {
  id: number;
  deleted: boolean;
}

/** A job a Discover route started; progress and results are the job routes'. */
export interface DiscoverJobStarted {
  id: string;
  type: DiscoverJobType;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
}

/** A wantlist entry. Bought is the user's mark, owned the library's (DEC-093). */
export interface WantlistRow extends BeatportTrackRow {
  note: string | null;
  added_at: string;
  bought_at: string | null;
  added_from_run_id: number | null;
}

export interface WantlistWindow {
  owned: DiscoverOwnedFilter;
  bought: DiscoverOwnedFilter;
  sort: WantlistSort;
  dir: DiscoverSortDirection;
  offset: number;
  limit: number;
}

export interface WantlistPage {
  rows: WantlistRow[];
  total: number;
  entries: number;
  owned: number;
  bought: number;
  window: WantlistWindow;
}

/** What one wantlist call did, and a sentence saying so. */
export interface WantlistChange {
  action: WantlistAction;
  changed: number[];
  unchanged: number[];
  not_listed: number[];
  not_found: number[];
  read_from_beatport: number;
  message: string;
}

/** A discovery job's result: the run as it ended, without its scope. */
export interface DiscoveryRunResult {
  id: number;
  job_id: string | null;
  started_at: string;
  finished_at: string | null;
  outcome: DiscoverRunOutcome | null;
  labels_in_scope: number;
  labels_resolved: number;
  artists_in_scope: number;
  charts_read: number;
  releases_read: number;
  tracks_found: number;
  error: string | null;
  error_class: BeatportErrorClass | null;
}

/** A playlist push's result, with the real playlist URL once one exists (DEC-099). */
export interface BeatportPlaylistResult {
  outcome: DiscoverRunOutcome;
  name: string;
  playlist_id: string | null;
  playlist_url: string | null;
  requested: number;
  skipped_owned: number;
  to_add: number;
  added: number;
  failed: number;
  not_attempted: number;
  failed_track_ids: number[];
  cancelled: boolean;
  error_class: BeatportErrorClass | null;
  error: string | null;
}

/** A resolve's result (DISCOVER-04). */
export interface BeatportResolveResult {
  outcome: DiscoverRunOutcome;
  owned: number;
  to_read: number;
  up_to_date: number;
  resolved: number;
  not_found: number;
  unreadable: number;
  failed: number;
  batches: number;
  cancelled: boolean;
  error_class: BeatportErrorClass | null;
  error: string | null;
}

/** A Beatport artist a shared name is linked to, as a choice (DEC-095). */
export interface EntityLink {
  ref: string;
  beatport_id: number;
  name: string | null;
  tracks: number;
}

/** A library name whose unresolved tracks an id page gathers. */
export interface EntityLinkedName {
  name_key: string;
  name: string;
  tracks: number;
}

export interface EntityYears {
  first: number | null;
  last: number | null;
}

/** The header's facts, each the Library's own answer over the page's rules. */
export interface EntityLibrarySummary {
  tracks: number;
  years: EntityYears;
  genres: DiscoverFacet;
  related: DiscoverFacet;
  index_current: boolean;
}

/**
 * An Artist or Label page's identity and library half (DISCOVER-07). `rules`
 * go to the Library's browse unchanged. When `redirected_from` is set, a name
 * is now known by an id, and the route is replaced with `ref`.
 */
export interface EntityPage {
  kind: EntityKind;
  ref: string;
  identity: EntityIdentity;
  beatport_id: number | null;
  name_key: string | null;
  name: string | null;
  /** What to title the page: a name, else the library's commonest spelling, else "Unknown artist" (DSC-9). */
  display_name: string;
  redirected_from: string | null;
  links: EntityLink[];
  names: EntityLinkedName[];
  rules: FilterRuleSet;
  library: EntityLibrarySummary;
}

export interface EntityTracksPage {
  rows: BeatportTrackRow[];
  total: number;
  tracks: number;
  owned: number;
}

/** A page's Beatport half: tracks when `ok`, otherwise the state standing in for them. */
export interface EntityBeatportHalf {
  kind: EntityKind;
  ref: string;
  state: EntityBeatportState;
  message: string;
  action: EntityAction | null;
  reason: EntityNameOnlyReason | null;
  beatport_id: number | null;
  found_by_name: boolean;
  since: string | null;
  until: string | null;
  fetched_at: string | null;
  from_cache: boolean;
  page: EntityTracksPage | null;
  resolvable: number;
  retry_after: number | null;
}

/** Who a library track credits: its artist credit, or its remixer credit. */
export type TrackCreditRole = "artist" | "remixer";

/**
 * A name a library track credits, as a link to its page (DISCOVER-11). The
 * engine splits the credit and chooses the page: the Beatport id when the
 * track is resolved and Beatport credits that name on it, the name otherwise.
 */
export interface TrackCreditLink {
  kind: EntityKind;
  name: string;
  /** `artist` or `remixer` for an artist; null for a label. */
  role: TrackCreditRole | null;
  ref: string;
  identity: EntityIdentity;
}

/** A track's artists, remixers and effective label, as links. */
export interface TrackCreditLinks {
  artists: TrackCreditLink[];
  remixers: TrackCreditLink[];
  label: TrackCreditLink | null;
}

/** The parts of the similarity rule a suggestion can score on, in the engine's order. */
export type SimilarComponent = "tempo" | "key" | "genre" | "label" | "artist";

/** One reason a suggestion scored, as the engine serializes it (DISCOVER-08). */
export type SimilarReason =
  | {
      component: "tempo";
      detail: "same" | "close" | "half" | "double";
      points: number;
      /** The seed's BPM. */
      from: number;
      /** The suggestion's BPM. */
      to: number;
    }
  | {
      component: "key";
      detail: "same" | "adjacent" | "relative";
      points: number;
      /** The seed's key, in the library's notation ("8A" or "Am"). */
      from: string;
      /** The suggestion's key. */
      to: string;
    }
  | {
      component: "genre" | "label";
      detail: "same";
      points: number;
      /** The seed's own spelling. */
      name: string;
    }
  | {
      component: "artist";
      detail: "shared";
      points: number;
      /** The shared artists, as the seed credits them. */
      names: string[];
    };

export interface SimilarTrack {
  track_id: number;
  score: number;
  reasons: SimilarReason[];
}

/** A seed's suggestions, best first; read their rows through the track-detail path. */
export interface SimilarTracks {
  seed_id: number;
  notation: SimilarKeyNotation;
  unused: SimilarComponent[];
  considered: number;
  duplicates_excluded: number;
  index_current: boolean;
  suggestions: SimilarTrack[];
}

/** A run's request; anything left out takes the engine's default. */
export interface DiscoverRunRequest {
  genre_ids?: number[];
  charts_from?: string;
  charts_to?: string;
  new_releases_days?: number;
  /** Library artist names; absent or null is the whole library, [] is none. */
  artists?: string[] | null;
  labels?: string[] | null;
}

/** A push: explicit ids, or a run and the order and filter its table shows. */
export type BeatportPlaylistRequest = {
  name?: string | null;
  include_owned?: boolean;
} & (
  | { track_ids: number[] }
  | { run_id: number; owned?: DiscoverOwnedFilter; sort?: DiscoverRunSort; dir?: DiscoverSortDirection }
);

/** Similar Tracks' seed and the Library's own scope parameters (DISCOVER-08). */
export interface SimilarTracksRequest {
  track_id: number;
  limit?: number;
  q?: string;
  playlist_id?: number | null;
  filters?: FilterRuleSet | null;
  scope?: "collection" | "smart" | null;
  collection_id?: number | null;
}

// ---------------------------------------------------------------------------
// A Set's checks (PREP-05), which PREP-08 puts on the wire
// ---------------------------------------------------------------------------

/** How far a planned time or a target is, in whole seconds (DEC-107). */
export type SetSeconds = number;

/**
 * One thing a Set's checks found (PREP-05, DEC-106), as the engine serializes
 * it. Keys are in the library's notation; BPMs to two decimals; times in whole
 * seconds. Only a transition's warnings can be `acknowledged`.
 */
export type SetWarning =
  | {
      kind: "tempo_jump";
      /** How the next track is heard against this one, the closest way. */
      detail: "faster" | "slower";
      compared: { from: number; to: number; percent: number };
      acknowledged: boolean;
    }
  | {
      kind: "key_clash";
      detail: "no_relation";
      compared: { from: string; to: string };
      acknowledged: boolean;
    }
  | {
      kind: "tempo_unknown";
      /** Which side has no BPM: the track before, this one, or both. */
      detail: "from" | "to" | "both";
      compared: { from: number | null; to: number | null };
      acknowledged: boolean;
    }
  | {
      kind: "file_missing";
      /** A drive that was not there is not the same as a file that is gone. */
      detail: "not_found" | "drive_unavailable";
      compared: { checked_at: string | null };
      acknowledged: boolean;
    }
  | {
      kind: "file_unreadable";
      detail: "unreadable";
      compared: { checked_at: string | null };
      acknowledged: boolean;
    }
  | {
      kind: "time_outside_track";
      /** Which planned time is past the track's end. */
      detail: "out" | "in";
      compared: { length: SetSeconds; in: SetSeconds | null; out: SetSeconds | null };
      acknowledged: boolean;
    }
  | {
      kind: "over_target" | "under_target";
      /** Over is reported with untimed entries still to add; under never is. */
      detail: "all_timed" | "partly_timed";
      compared: { target: SetSeconds; planned: SetSeconds; untimed: number };
      acknowledged: boolean;
    }
  | {
      kind: "bpm_outside_range";
      detail: "below" | "above" | "both";
      compared: {
        min: number | null;
        max: number | null;
        entries: { entry_id: number; bpm: number }[];
      };
      acknowledged: boolean;
    };

/** Something worth knowing that is not a problem: a track played again (DEC-017). */
export interface SetNotice {
  kind: "repeat";
  detail: "track";
  /** The Set positions, from 0, of the track's other entries. */
  compared: { others: number[] };
}

/** What the file checks say about a Set's tracks (DEC-073, DEC-088). */
export interface SetFileCheck {
  tracks: number;
  checked: number;
  unchecked: number;
  missing: number;
  unreadable: number;
  /** No track in a non-empty Set has been checked: say so, never "none missing". */
  never_checked: boolean;
  last_checked_at: string | null;
}

/** A running time: the timed entries' sum, and how many are left out (DEC-107). */
export interface SetRunningTime {
  seconds: SetSeconds;
  timed: number;
  untimed: number;
}

/** A place on the Camelot wheel: 1 to 12, and A (minor) or B (major). */
export interface SetCamelot {
  number: number;
  letter: "A" | "B";
}

/** One entry as the lanes draw it: the values its checks read (DEC-111). */
export interface SetShapeEntry {
  entry_id: number;
  chapter_id: number;
  /** The effective tempo to two decimals; null is a gap, never a zero. */
  bpm: number | null;
  /** The effective key in the library's notation, or null. */
  key: string | null;
  camelot: SetCamelot | null;
}

/** How one transition's keys relate on the wheel. */
export interface SetShapeTransition {
  from_entry_id: number;
  to_entry_id: number;
  /** Null when the keys clash, or when either is unknown (its entry says which). */
  key_relation: SetKeyRelation | null;
}

/** A Set's tempo and key, entry by entry, in order (PREP-11). */
export interface SetShape {
  entries: SetShapeEntry[];
  transitions: SetShapeTransition[];
}

/** A Set's checks (PREP-05). Transitions and entries appear only when something was found. */
export interface SetAnalysis {
  set_id: number;
  notation: SimilarKeyNotation;
  running_time: SetRunningTime;
  /** Warnings not acknowledged, by kind; a kind with none is absent. */
  counts: Partial<Record<SetWarning["kind"], number>>;
  acknowledged: number;
  notices: Partial<Record<SetNotice["kind"], number>>;
  /** Entries with no key (DEC-201): they get no key check and no warning. */
  without_key: number;
  files: SetFileCheck;
  transitions: { from_entry_id: number; to_entry_id: number; warnings: SetWarning[] }[];
  entries: { entry_id: number; warnings: SetWarning[]; notices: SetNotice[] }[];
  chapters: { chapter_id: number; running_time: SetRunningTime; warnings: SetWarning[] }[];
  /** The values the checks read, for the tempo and key lanes (PREP-11). */
  shape: SetShape;
}

// ---------------------------------------------------------------------------
// The waveform analysis over the wire (WAVE-03)
//
// Mirrors `waveforms_api.py`, `AnalysisStatus.to_dict` and the waveform answer
// (WAVE-05). The analysis's state, Pause and Resume came first, for the status
// strip and the Health view; WAVE-05 adds the waveforms themselves, requests
// and "Delete waveform data".
// ---------------------------------------------------------------------------

/** The analysis as a whole: unavailable first, then paused, then running. */
export type WaveformAnalysisState = "running" | "paused" | "idle" | "unavailable";

export interface WaveformAnalysisStatus {
  state: WaveformAnalysisState;
  /** The persisted setting; a requested track is still analysed while it is set. */
  paused: boolean;
  /** The running job, followed on the status strip. */
  job_id: string | null;
  /** Tracks whose file the last check found present. */
  present: number;
  /** Of those, tracks with a waveform for the file as it is. */
  analysed: number;
  /** Of those, tracks whose file could not be read; not retried until it changes. */
  failed: number;
  /** Present tracks with neither. */
  remaining: number;
  /** Files an hour over the last ten minutes, while a run goes and there is enough to say. */
  rate_per_hour: number | null;
  eta_seconds: number | null;
  /** Why it is unavailable: `decoder_missing`. */
  reason: string | null;
  /** What the waveform data takes on disk; "Delete waveform data" says it first. */
  store_bytes: number;
}

/** The codes a waveform refusal can carry; any other failure throws. */
export type WaveformRefusalCode =
  | "INVALID_REQUEST"
  | "WAVEFORMS_SETTING_FAILED"
  | "WAVEFORMS_STORE_FAILED";

export interface WaveformRefusal {
  code: WaveformRefusalCode;
  message: string;
}

/** An answer, or the refusal standing in for it. */
export type WaveformAnswer<T> =
  | { value: T; refusal: null }
  | { value: null; refusal: WaveformRefusal };

/**
 * A track's waveform state: a picture, or why there is none (WAVE-02).
 * `paused` is not among them: it is the analysis's, and travels beside.
 */
export type WaveformTrackState =
  | "ready"
  | "failed"
  | "missing"
  | "unchecked"
  | "waiting"
  | "unavailable";

/** One beat grid marker, as Rekordbox wrote it (WAVE-04). */
export interface BeatGridMarker {
  start_ms: number;
  bpm: number;
  /** The time signature as written, such as `4/4`. */
  meter: string | null;
  /** Which beat of the bar the marker is, 1–4. */
  beat: number | null;
}

/** A track's marks as a drawing needs them: every cue, and every grid marker. */
export interface WaveformMarks {
  /** Whether the library's marks have been read at all. */
  read: boolean;
  cues: TrackCue[];
  grid: BeatGridMarker[];
}

/** Why a measured track has no loudness value (WAVE-08). */
export type WaveformLoudnessReason = "too_quiet" | "silent" | "not_measured";

/**
 * A track's loudness, measured with its waveform (WAVE-08, DEC-124): shown,
 * never applied. A value with its peak, or a reason; a track too quiet to
 * measure may still have a peak.
 */
export interface WaveformLoudness {
  /** The whole track's integrated loudness, in LUFS, to 0.1. */
  integrated_lufs: number | null;
  /** Its highest sample, in dBFS, to 0.1. */
  peak_dbfs: number | null;
  reason: WaveformLoudnessReason | null;
}

/** One track's answer from `waveforms.get`. */
export interface WaveformTrack {
  track_id: number;
  state: WaveformTrackState;
  /** Why it failed, or why it is missing. */
  reason: string | null;
  /** A ready waveform's own length. */
  duration_ms: number | null;
  /** A ready waveform's loudness; null while it is still to be measured. */
  loudness: WaveformLoudness | null;
  /**
   * A ready waveform at the width asked: `width × 4` bytes, each column's full,
   * low, mid and high band, 0–255. Decoded from the engine's base64 in main, so
   * the renderer never parses a string. Null unless ready.
   */
  data: Uint8Array | null;
  /** The track's cues and grid, when asked for; null otherwise. */
  marks: WaveformMarks | null;
}

/**
 * What `waveforms.get` asks for: each track's picture at a width, or with
 * `data: false` its state and loudness alone, without reading a picture or
 * taking a width (WAVE-08).
 */
export type WaveformsQuery = {
  track_ids: number[];
  marks?: boolean;
} & ({ width: number; data?: true } | { width?: undefined; data: false });

/** A batch of waveforms at one width (`GET /api/v1/waveforms`). */
export interface WaveformBatch {
  /** The width asked for; null for a batch asked without pictures (`data: false`). */
  width: number | null;
  /** The analysis's pause: a `waiting` track waits for a paused analysis. */
  paused: boolean;
  /** In the order asked, each once; ids that are no track are left out. */
  waveforms: WaveformTrack[];
  /** Ids asked for that are no track, so a caller stops asking. */
  unknown: number[];
}

/** What a request queued (`POST /api/v1/waveforms/request`). */
export interface WaveformsRequested {
  requested: number[];
  /** The job analysing them, or null when nothing can (no decoder). */
  job_id: string | null;
}

/** What "Delete waveform data" deleted. */
export interface WaveformDataDeleted {
  waveforms: number;
  freed_bytes: number;
}

/** "Delete waveform data"'s answer: what went, and the analysis after. */
export interface WaveformDataDeletion {
  deleted: WaveformDataDeleted;
  analysis: WaveformAnalysisStatus;
}

// ---------------------------------------------------------------------------
// A Set over the wire (PREP-08)
//
// Mirrors `sets_api.py` and the models it serializes, declared in both
// processes because neither can import the other's: `desktopContract.test.ts`
// holds the two copies together, and `test_sets_contract.py` holds them to what
// the engine actually sends. Every Set method answers a `SetAnswer`: a refusal
// a person can act on keeps its code and reason across IPC.
// ---------------------------------------------------------------------------

/** The codes a Set refusal can carry; any other failure throws. */
export type SetRefusalCode =
  | "INVALID_REQUEST"
  | "SET_NOT_FOUND"
  | "SET_INSERTION_POINT_REFUSED"
  | "SET_LIST_DESTINATION_REFUSED"
  | "SET_LIST_WRITE_FAILED";

/** What a `SET_NOT_FOUND` names: gone in another window, or by a refresh. */
export type SetNotFoundReason = "set" | "chapter" | "entry";

/** Why a gap cannot be fitted as named (PREP-04); `stale` is the cue to reload. */
export type SetInsertionPointReason = "empty_set" | "no_neighbour" | "stale";

/** Why a set list cannot be saved where the dialog chose (PREP-06). */
export type SetListDestinationReason =
  | "destination_blank"
  | "destination_not_set_list"
  | "destination_is_folder"
  | "destination_folder_missing";

export interface SetRefusal {
  code: SetRefusalCode;
  message: string;
  /** Which kind of refusal, for the three codes that have more than one. */
  reason: SetNotFoundReason | SetInsertionPointReason | SetListDestinationReason | null;
  /** For a set list: the file refused, or not written. */
  path: string | null;
}

/** An answer, or the refusal standing in for it. */
export type SetAnswer<T> =
  | { value: T; refusal: null }
  | { value: null; refusal: SetRefusal };

/** A chapter as a plan reads it: its targets, its entries and how long they run. */
export interface SetChapterPlan {
  id: number;
  position: number;
  /** Empty for an unnamed chapter, drawn without a heading (DEC-103). */
  name: string;
  notes: string | null;
  target_seconds: SetSeconds | null;
  bpm_min: number | null;
  bpm_max: number | null;
  entry_ids: number[];
  running_time: SetRunningTime;
  /** When it starts, from the Set's start; null after an untimed entry. */
  starts_at: SetSeconds | null;
}

/** An entry as a plan reads it: its place, chapter, times and note (DEC-107). */
export interface SetPlannedEntry {
  entry_id: number;
  track_id: number;
  position: number;
  chapter_id: number;
  in_seconds: SetSeconds | null;
  out_seconds: SetSeconds | null;
  note: string | null;
  planned_seconds: SetSeconds | null;
  starts_at: SetSeconds | null;
  length_seconds: SetSeconds | null;
}

/** A Set's whole plan (PREP-03). */
export interface SetPlan {
  set_id: number;
  name: string;
  notes: string | null;
  chapters: SetChapterPlan[];
  entries: SetPlannedEntry[];
  running_time: SetRunningTime;
}

/** One entry of the running order, beside the Library's own row for its track. */
export interface SetEntry extends SetPlannedEntry {
  track: LibraryTrackRow;
}

/** The whole Set in its running order, repeats included. */
export interface SetEntries {
  set_id: number;
  name: string;
  entries: SetEntry[];
  /** The most entries a Set holds (PREP-02). */
  limit: number;
}

/** Which neighbour of a gap a suggestion is fitted against. */
export type SetSuggestionSideName = "before" | "after";

/** A suggestion against one neighbour: DEC-096's score, and its reasons. */
export interface SetSuggestionSide {
  score: number;
  reasons: SimilarReason[];
}

export interface SetSuggestion {
  track_id: number;
  /** The mean of the fitted sides' scores. */
  score: number;
  /** How many times the track is already in the Set; 0 when it is not. */
  in_set: number;
  before: SetSuggestionSide | null;
  after: SetSuggestionSide | null;
  /** The Library's own row for the track (PREP-11), as an entry carries it. */
  track: LibraryTrackRow;
}

/** How two keys relate on the wheel, in the words the warnings use. */
export type SetKeyRelation = "same" | "adjacent" | "relative";

/** Why nothing fits a gap: its neighbours' tempos are too far apart. */
export interface SetNoFit {
  tempo: { from: number; to: number; gap_percent: number };
  /** Null when either key is unknown; `relation` is null when they clash. */
  key: { from: string; to: string; relation: SetKeyRelation | null } | null;
}

/** The chapter's BPM range that narrowed the pool, inclusive, open at either end. */
export interface SetBpmRange {
  chapter_id: number;
  min: number | null;
  max: number | null;
}

/** What fits at one gap of a Set, best first (PREP-04, DEC-105). */
export interface SetSuggestions {
  set_id: number;
  before_entry_id: number | null;
  after_entry_id: number | null;
  sides: SetSuggestionSideName[];
  chapter_id: number;
  bpm_range: SetBpmRange | null;
  notation: SimilarKeyNotation;
  unused: Partial<Record<SetSuggestionSideName, SimilarComponent[]>>;
  considered: number;
  duplicates_excluded: number;
  index_current: boolean;
  no_fit: SetNoFit | null;
  suggestions: SetSuggestion[];
}

/** A gap, named by the entries either side, and the Library's own pool parameters. */
export interface SetSuggestionsRequest {
  set_id: number;
  before_entry_id?: number | null;
  after_entry_id?: number | null;
  chapter_id?: number | null;
  against?: SetSuggestionSideName | null;
  limit?: number;
  q?: string;
  playlist_id?: number | null;
  filters?: FilterRuleSet | null;
  scope?: "collection" | "smart" | null;
  collection_id?: number | null;
}

/** The plain-text set list, for the clipboard (DEC-110). */
export interface SetListText {
  set_id: number;
  text: string;
}

/** What "New Set from…" copies (PREP-02): a selection in the table's order. */
export type SetSource =
  | { kind: "collection"; id: number }
  | { kind: "playlist"; id: number }
  | { kind: "selection"; track_ids: number[] };

/** A Set made, or a copy of one: the node as the tree draws it. */
export interface SetCreated {
  set: CollectionNode;
}

/** What a source was called when "New Set from…" copied it. */
export interface SetSourceUsed {
  kind: SetSource["kind"];
  id: number | null;
  name: string | null;
}

export interface SetCreatedFrom {
  set: CollectionNode;
  source: SetSourceUsed;
  /** How many entries the Set was given, repeats counted. */
  track_count: number;
}

/** A Set's notes, and when they last changed. */
export interface SetDetails {
  set_id: number;
  notes: string | null;
  updated_at: string;
}

export interface SetNotesChanged {
  details: SetDetails;
}

/** A chapter as it is stored. */
export interface SetChapter {
  id: number;
  set_id: number;
  position: number;
  name: string;
  notes: string | null;
  target_seconds: SetSeconds | null;
  bpm_min: number | null;
  bpm_max: number | null;
  created_at: string;
  updated_at: string;
}

export interface SetChapterChanged {
  chapter: SetChapter;
}

/** A chapter deleted, and the neighbour its entries joined. */
export interface SetChapterDeleted {
  deleted_chapter_id: number;
  joined: SetChapter;
}

/**
 * What PREP-10's heading dialog changes, in one write. Only the fields sent
 * change, and null clears one; `target` is typed as `m:ss` or `h:mm:ss`.
 */
export interface SetChapterUpdate {
  chapter_id: number;
  name?: string | null;
  notes?: string | null;
  target?: string | null;
  bpm_min?: number | null;
  bpm_max?: number | null;
}

/** An entry moved, and the chapter it is now in. */
export interface SetEntryMoved {
  entry: CollectionEntry;
  chapter_id: number;
}

/** An entry's chapter, planned times and note. */
export interface SetEntryPlan {
  entry_id: number;
  set_id: number;
  chapter_id: number;
  in_seconds: SetSeconds | null;
  out_seconds: SetSeconds | null;
  planned_seconds: SetSeconds | null;
  note: string | null;
}

export interface SetEntryPlanChanged {
  plan: SetEntryPlan;
}

/** The warnings between two entries, which are the only ones a person accepts. */
export type SetTransitionWarningKind = "tempo_jump" | "key_clash" | "tempo_unknown";

/** One transition's warning, named by its two entries (DEC-106). */
export interface SetTransitionWarningRef {
  from_entry_id: number;
  to_entry_id: number;
  warning: SetTransitionWarningKind;
}

/** A warning accepted, with the values it accepted: it lapses when they change. */
export interface SetAcknowledgement {
  id: number;
  set_id: number;
  from_entry_id: number;
  to_entry_id: number;
  warning: SetTransitionWarningKind;
  compared: Record<string, unknown>;
  created_at: string;
}

export interface SetAcknowledged {
  acknowledgement: SetAcknowledgement;
}

export interface SetUnacknowledged {
  /** False when there was nothing to withdraw. */
  removed: boolean;
}

/** The three forms a set list is saved in, named by the file's extension. */
export type SetListFormat = "text" | "csv" | "m3u8";

/** What a set list save wrote. */
export interface SetListSaved {
  set_id: number;
  /** The file written, absolute. */
  path: string;
  format: SetListFormat;
  entries: number;
  missing_files: number;
  untimed: number;
  bytes_written: number;
}

export interface SetListSave {
  saved: SetListSaved;
}

/** What the set list save dialog is opened with. */
export interface SetListDialogRequest {
  /** The Set's name, which the suggested file is named after. */
  setName: string;
  /** A file chosen before, to reopen at after a refusal. */
  currentPath?: string | null;
}

/** What the set list save dialog answers: a file, or that none was chosen. */
export type SetListDestinationChoice =
  | { canceled: true }
  | { canceled: false; filePath: string };

export class EngineClient {
  constructor(
    private readonly port: number,
    private readonly token: string,
    private readonly sessionId?: string,
  ) {}

  private url(path: string): string {
    return `http://127.0.0.1:${this.port}${path}`;
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
    if (this.sessionId) {
      headers["X-Session-Id"] = this.sessionId;
    }
    return { ...currentTraceHeaders(), ...headers };
  }

  /**
   * Library search (DEC-023).
   *
   * The response shape is a public contract — Phase 4 extends this endpoint
   * rather than adding a second search path — so it is typed here rather than
   * returned as an opaque record.
   */
  async searchLibrary(params: {
    q: string;
    limit?: number;
    offset?: number;
  }): Promise<LibrarySearchResponse> {
    const query = new URLSearchParams({ q: params.q });
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.offset != null) query.set("offset", String(params.offset));
    const res = await fetch(this.url(`/api/v1/library/search?${query.toString()}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  /**
   * Browse the library (LIBUI-03, DEC-040).
   *
   * The same endpoint as `searchLibrary`, in browse mode: one query path
   * (DEC-023), and the only difference is what a blank query means — nothing
   * for a search box, everything in scope for a table.
   */
  async browseLibrary(params: LibraryBrowseParams): Promise<LibrarySearchResponse> {
    const query = new URLSearchParams({ mode: "browse" });
    if (params.q) query.set("q", params.q);
    if (params.playlistId != null) query.set("playlist_id", String(params.playlistId));
    if (params.sort) query.set("sort", params.sort);
    if (params.dir) query.set("dir", params.dir);
    if (params.filters && params.filters.rules.length > 0) {
      query.set("filters", JSON.stringify(params.filters));
    }
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.offset != null) query.set("offset", String(params.offset));
    if (params.fields) query.set("fields", params.fields);
    if (params.scope) query.set("scope", params.scope);
    if (params.collectionId != null) query.set("collection_id", String(params.collectionId));
    const res = await fetch(this.url(`/api/v1/library/search?${query.toString()}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  /** The mirrored Rekordbox playlist tree, read-only (LIBUI-03, DEC-044). */
  async getLibraryPlaylists(): Promise<LibraryPlaylistTree> {
    const res = await fetch(this.url("/api/v1/library/playlists"), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  /**
   * The values one field takes in the current view, with counts (DEC-043).
   *
   * Scoped by everything except this field's own filters, so choosing one
   * genre leaves the others choosable.
   */
  async getLibraryFacet(params: {
    field: string;
    q?: string;
    playlistId?: number | null;
    filters?: FilterRuleSet | null;
    limit?: number;
    scope?: "collection" | "smart";
    collectionId?: number | null;
  }): Promise<LibraryFacet> {
    const query = new URLSearchParams({ field: params.field });
    if (params.q) query.set("q", params.q);
    if (params.playlistId != null) query.set("playlist_id", String(params.playlistId));
    if (params.filters && params.filters.rules.length > 0) {
      query.set("filters", JSON.stringify(params.filters));
    }
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.scope) query.set("scope", params.scope);
    if (params.collectionId != null) query.set("collection_id", String(params.collectionId));
    const res = await fetch(this.url(`/api/v1/library/facets?${query.toString()}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  /**
   * What the Key, BPM and Genre quick filters offer for a view (FLW-4): the
   * view's keys in Camelot order with counts, its BPM range and its genres.
   * A POST because the view is a filter body; it changes nothing.
   */
  async getLibraryQuickFacets(params: {
    q?: string;
    playlistId?: number | null;
    filters?: FilterRuleSet | null;
    scope?: "collection" | "smart";
    collectionId?: number | null;
  }): Promise<LibraryQuickFacets> {
    return this.postJson("/api/v1/library/facets", {
      q: params.q ?? "",
      playlist_id: params.playlistId ?? null,
      filters: params.filters ?? null,
      scope: params.scope ?? null,
      collection_id: params.collectionId ?? null,
    });
  }

  /**
   * The keys that mix with a key, from the engine's rule (PAGES-10, DEC-096).
   * Any notation the app parses; an unparseable key is a 400 the caller sees as an error.
   */
  async getCompatibleKeys(params: { key: string }): Promise<CompatibleKeys> {
    return this.getJson(
      `/api/v1/library/keys/compatible?${new URLSearchParams({ key: params.key }).toString()}`,
    );
  }

  /**
   * The keys of chosen playlists, Collections and Sets, each counted once
   * (PAGES-16). A POST because the sources are a list; it changes nothing.
   */
  async getKeysPopulation(params: { sources: KeySource[] }): Promise<KeysPopulation> {
    return this.postJson("/api/v1/library/keys/population", { sources: params.sources });
  }

  /** What can be filtered, and with which operators (DEC-043). */
  async getLibraryFilterFields(): Promise<LibraryFilterVocabulary> {
    const res = await fetch(this.url("/api/v1/library/filter-fields"), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  /** One track and the playlists holding it — the Inspector's content (DEC-047). */
  async getLibraryTrack(params: { trackId: number }): Promise<LibraryTrackDetail> {
    const res = await fetch(
      this.url(`/api/v1/library/tracks/${encodeURIComponent(String(params.trackId))}`),
      { headers: this.headers() },
    );
    return readJson(res);
  }

  /**
   * A track's artwork thumbnail as JPEG bytes, or null when it has none (CLEAN-09).
   *
   * The engine answers 204 for "no artwork", which is an empty state rather
   * than an error; offline, a Beatport image that cannot be fetched is the same.
   */
  async getTrackArtwork(params: {
    trackId: number;
    size: ArtworkSize;
  }): Promise<Uint8Array | null> {
    const query = new URLSearchParams({ size: params.size });
    const res = await fetch(
      this.url(
        `/api/v1/library/tracks/${encodeURIComponent(String(params.trackId))}/artwork?${query.toString()}`,
      ),
      { headers: this.headers() },
    );
    if (res.status === 204) {
      return null;
    }
    if (!res.ok) {
      // Always throws: the answer says why.
      await readJson(res);
    }
    if (!(res.headers.get("Content-Type") ?? "").startsWith("image/jpeg")) {
      throw new Error("The engine answered artwork with something other than a JPEG");
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  /**
   * Start a Rekordbox import (LIBRARY-06, DEC-033).
   *
   * Returns the job identity only. Progress is followed through the existing
   * job endpoints and their SSE stream, so there is no second progress
   * mechanism for the renderer to keep in step with.
   */
  async startLibraryImport(params: {
    xml_path: string;
  }): Promise<LibraryImportStarted> {
    const res = await fetch(this.url("/api/v1/library/import"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    return readJson(res);
  }

  /**
   * Compute a refresh diff without applying it (LIBRARY-10, DEC-032).
   *
   * Returns the job identity only. The diff itself arrives as the job's
   * result, from `getJobResults` — it is far too large to put on the status
   * payload that the shell polls for every job.
   *
   * `xml_path` is optional: with no path the engine re-reads the file the
   * library was imported from, which is what DEC-035 recorded it for.
   */
  async startLibraryRefreshPreview(params?: {
    xml_path?: string;
    force?: boolean;
  }): Promise<LibraryRefreshStarted> {
    const res = await fetch(this.url("/api/v1/library/refresh/preview"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(params ?? {}),
    });
    return readJson(res);
  }

  /**
   * Apply a previewed diff (LIBRARY-10, DEC-003).
   *
   * `diff_id` comes from the preview's result and is required — there is no
   * "apply the last one", because that would delete tracks on the strength of
   * a diff the caller never named. A stale or unknown id is refused before any
   * job starts.
   */
  async startLibraryRefreshApply(params: {
    diff_id: string;
    confirm_references?: boolean;
  }): Promise<LibraryRefreshStarted> {
    const res = await fetch(this.url("/api/v1/library/refresh/apply"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    return readJson(res);
  }


  // -------------------------------------------------------------------------
  // CuePoint's own organization (ORG-08)
  //
  // Mutations are POSTs to action paths. Reads are GETs, so a pane redrawing
  // itself can repeat one safely.
  // -------------------------------------------------------------------------

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    });
    return readJson<T>(res);
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path), { headers: this.headers() });
    return readJson<T>(res);
  }

  /** A POST whose typed refusals come back as a value (EXPORT-06). */
  private async postRefusable<T>(path: string, body: unknown) {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    });
    return readRefusable<T>(res);
  }

  // -------------------------------------------------------------------------
  // Discover (DISCOVER-09)
  //
  // Reads are GETs and actions are POSTs, as every other route. Each answers
  // a `DiscoverAnswer`, so a refusal keeps its code and class across IPC.
  // -------------------------------------------------------------------------

  private async discoverGet<T>(path: string): Promise<DiscoverAnswer<T>> {
    const res = await fetch(this.url(path), { headers: this.headers() });
    return readDiscover<T>(res);
  }

  private async discoverPost<T>(path: string, body: unknown): Promise<DiscoverAnswer<T>> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    });
    return readDiscover<T>(res);
  }

  /** What a "New run" panel starts from: token state, genres, facets, defaults. */
  async getDiscoverOptions(): Promise<DiscoverAnswer<DiscoverOptions>> {
    return this.discoverGet("/api/v1/discover/options");
  }

  /** A window of kept runs, newest first, with how many there are. */
  async listDiscoveryRuns(params?: {
    limit?: number;
    offset?: number;
  }): Promise<DiscoverAnswer<DiscoverRunList>> {
    return this.discoverGet(
      `/api/v1/discover/runs${discoverQuery({ limit: params?.limit, offset: params?.offset })}`,
    );
  }

  /** One run, with the artists and labels its scope resolved to. */
  async getDiscoveryRun(params: { run_id: number }): Promise<DiscoverAnswer<DiscoverRunHeader>> {
    return this.discoverGet(`/api/v1/discover/runs/${encodeURIComponent(String(params.run_id))}`);
  }

  /** A window of a run's tracks; owned tracks are hidden unless asked (DEC-092). */
  async getDiscoveryRunTracks(params: {
    run_id: number;
    owned?: DiscoverOwnedFilter;
    sort?: DiscoverRunSort;
    dir?: DiscoverSortDirection;
    offset?: number;
    limit?: number;
  }): Promise<DiscoverAnswer<DiscoverRunTracksPage>> {
    const { run_id, ...window } = params;
    return this.discoverGet(
      `/api/v1/discover/runs/${encodeURIComponent(String(run_id))}/tracks${discoverQuery(window)}`,
    );
  }

  /** Start a discovery run; follow it through the job routes (DISCOVER-05). */
  async startDiscoveryRun(
    params?: DiscoverRunRequest,
  ): Promise<DiscoverAnswer<DiscoverJobStarted>> {
    return this.discoverPost("/api/v1/discover/runs/start", params ?? {});
  }

  /** Delete an ended run and its tracks; the catalog rows stay. */
  async deleteDiscoveryRun(params: { run_id: number }): Promise<DiscoverAnswer<DiscoverRunDeleted>> {
    return this.discoverPost(
      `/api/v1/discover/runs/${encodeURIComponent(String(params.run_id))}/delete`,
      {},
    );
  }

  /** A window of the wantlist, newest first, owned computed now (DEC-093). */
  async getWantlist(params?: {
    owned?: DiscoverOwnedFilter;
    bought?: DiscoverOwnedFilter;
    sort?: WantlistSort;
    dir?: DiscoverSortDirection;
    offset?: number;
    limit?: number;
  }): Promise<DiscoverAnswer<WantlistPage>> {
    return this.discoverGet(`/api/v1/discover/wantlist${discoverQuery({ ...params })}`);
  }

  /** Add Beatport tracks, from a run or a page; any not cached are read. */
  async addToWantlist(params: {
    track_ids: number[];
    run_id?: number | null;
  }): Promise<DiscoverAnswer<WantlistChange>> {
    return this.discoverPost("/api/v1/discover/wantlist/add", params);
  }

  async removeFromWantlist(params: { track_ids: number[] }): Promise<DiscoverAnswer<WantlistChange>> {
    return this.discoverPost("/api/v1/discover/wantlist/remove", params);
  }

  /** Set a note; null or blank text clears it. */
  async setWantlistNote(params: {
    track_id: number;
    note: string | null;
  }): Promise<DiscoverAnswer<WantlistChange>> {
    return this.discoverPost("/api/v1/discover/wantlist/note", params);
  }

  /** Mark entries bought or not; owned is never touched (DEC-093). */
  async setWantlistBought(params: {
    track_ids: number[];
    bought: boolean;
  }): Promise<DiscoverAnswer<WantlistChange>> {
    return this.discoverPost("/api/v1/discover/wantlist/bought", params);
  }

  /** Push tracks to a new Beatport playlist, as a job (DISCOVER-06, DEC-099). */
  async startBeatportPlaylistPush(
    params: BeatportPlaylistRequest,
  ): Promise<DiscoverAnswer<DiscoverJobStarted>> {
    return this.discoverPost("/api/v1/discover/playlist/start", params);
  }

  /** Resolve the library's accepted matches on Beatport, as a job (DISCOVER-04). */
  async startBeatportResolve(): Promise<DiscoverAnswer<DiscoverJobStarted>> {
    return this.discoverPost("/api/v1/discover/resolve/start", {});
  }

  /** An Artist or Label page's identity and library half (DISCOVER-07). */
  async getEntityPage(params: {
    kind: EntityKind;
    ref: string;
  }): Promise<DiscoverAnswer<EntityPage>> {
    return this.discoverGet(
      `/api/v1/discover/entity${discoverQuery({ kind: params.kind, ref: params.ref })}`,
    );
  }

  /** A page's recent Beatport tracks, or the state standing in for them. */
  async getEntityBeatport(params: {
    kind: EntityKind;
    ref: string;
    refresh?: boolean;
    owned?: DiscoverOwnedFilter;
    offset?: number;
    limit?: number;
  }): Promise<DiscoverAnswer<EntityBeatportHalf>> {
    return this.discoverGet(`/api/v1/discover/entity/beatport${discoverQuery({ ...params })}`);
  }

  /** A seed's suggestions, best first, within the Library's own scope (DISCOVER-08). */
  async getSimilarTracks(params: SimilarTracksRequest): Promise<DiscoverAnswer<SimilarTracks>> {
    const { filters, ...rest } = params;
    return this.discoverGet(
      `/api/v1/discover/similar${discoverQuery({
        ...rest,
        filters: filters && filters.rules.length > 0 ? JSON.stringify(filters) : undefined,
      })}`,
    );
  }

  // -------------------------------------------------------------------------
  // A Set (PREP-08)
  //
  // Reads are GETs named by `set_id`; actions are POSTs. Each answers a
  // `SetAnswer`, so a refusal keeps its code and reason across IPC. Adding and
  // removing entries stays on the Collection methods below (PREP-02).
  // -------------------------------------------------------------------------

  private async setsGet<T>(path: string): Promise<SetAnswer<T>> {
    const res = await fetch(this.url(path), { headers: this.headers() });
    return readSetAnswer<T>(res);
  }

  private async setsPost<T>(path: string, body: unknown): Promise<SetAnswer<T>> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    });
    return readSetAnswer<T>(res);
  }

  /** A Set's notes, chapters, entries' plans and running times (PREP-03). */
  async getSetPlan(params: { set_id: number }): Promise<SetAnswer<SetPlan>> {
    return this.setsGet(`/api/v1/sets/plan${discoverQuery({ set_id: params.set_id })}`);
  }

  /** The running order, each entry beside the Library's own row for its track. */
  async getSetEntries(params: { set_id: number }): Promise<SetAnswer<SetEntries>> {
    return this.setsGet(`/api/v1/sets/entries${discoverQuery({ set_id: params.set_id })}`);
  }

  /** Every transition, entry and chapter checked (PREP-05). */
  async getSetAnalysis(params: { set_id: number }): Promise<SetAnswer<SetAnalysis>> {
    return this.setsGet(`/api/v1/sets/analysis${discoverQuery({ set_id: params.set_id })}`);
  }

  /** What fits at a gap, over a pool of the Library's own parameters (PREP-04). */
  async getSetSuggestions(params: SetSuggestionsRequest): Promise<SetAnswer<SetSuggestions>> {
    const { filters, ...rest } = params;
    return this.setsGet(
      `/api/v1/sets/suggestions${discoverQuery({
        ...rest,
        filters: filters && filters.rules.length > 0 ? JSON.stringify(filters) : undefined,
      })}`,
    );
  }

  /** The plain-text set list, for the clipboard (PREP-06). */
  async getSetListText(params: { set_id: number }): Promise<SetAnswer<SetListText>> {
    return this.setsGet(`/api/v1/sets/set-list/text${discoverQuery({ set_id: params.set_id })}`);
  }

  /** An empty Set with one unnamed chapter. */
  async createSet(params: { name: string; parent_id?: number | null }): Promise<SetAnswer<SetCreated>> {
    return this.setsPost("/api/v1/sets/create", params);
  }

  /** "New Set from…" a Collection, a playlist or a selection (DEC-104). */
  async createSetFrom(params: {
    source: SetSource;
    name?: string | null;
    parent_id?: number | null;
  }): Promise<SetAnswer<SetCreatedFrom>> {
    return this.setsPost("/api/v1/sets/create-from", params);
  }

  /** A copy of a Set, chapters, plan and acknowledgements included. */
  async duplicateSet(params: { set_id: number; name?: string | null }): Promise<SetAnswer<SetCreated>> {
    return this.setsPost("/api/v1/sets/duplicate", params);
  }

  /** Write a Set's notes; null clears them. */
  async setSetNotes(params: { set_id: number; notes: string | null }): Promise<SetAnswer<SetNotesChanged>> {
    return this.setsPost("/api/v1/sets/notes", params);
  }

  /** An empty chapter at a place, after a chapter, or at the end. */
  async createSetChapter(params: {
    set_id: number;
    name?: string;
    position?: number | null;
    after_chapter_id?: number | null;
  }): Promise<SetAnswer<SetChapterChanged>> {
    return this.setsPost("/api/v1/sets/chapters/create", params);
  }

  /** A chapter's name, notes and targets, in one write. */
  async updateSetChapter(params: SetChapterUpdate): Promise<SetAnswer<SetChapterChanged>> {
    return this.setsPost("/api/v1/sets/chapters/update", params);
  }

  /** Move a chapter, its entries with it. */
  async moveSetChapter(params: { chapter_id: number; position: number }): Promise<SetAnswer<SetChapterChanged>> {
    return this.setsPost("/api/v1/sets/chapters/move", params);
  }

  /** Delete a chapter; its entries join a neighbour. */
  async deleteSetChapter(params: { chapter_id: number }): Promise<SetAnswer<SetChapterDeleted>> {
    return this.setsPost("/api/v1/sets/chapters/delete", params);
  }

  /** Start a chapter at an entry. */
  async splitSetChapter(params: { entry_id: number; name?: string }): Promise<SetAnswer<SetChapterChanged>> {
    return this.setsPost("/api/v1/sets/chapters/split", params);
  }

  /** Move an entry, into a chapter that reaches its new place. */
  async moveSetEntry(params: {
    entry_id: number;
    position: number;
    chapter_id?: number | null;
  }): Promise<SetAnswer<SetEntryMoved>> {
    return this.setsPost("/api/v1/sets/entries/move", params);
  }

  /** Plan an entry's times, typed; both are written, and null or blank clears one. */
  async setSetEntryTimes(params: {
    entry_id: number;
    in_time: string | null;
    out_time: string | null;
  }): Promise<SetAnswer<SetEntryPlanChanged>> {
    return this.setsPost("/api/v1/sets/entries/times", params);
  }

  /** Write an entry's note; null clears it. */
  async setSetEntryNote(params: { entry_id: number; note: string | null }): Promise<SetAnswer<SetEntryPlanChanged>> {
    return this.setsPost("/api/v1/sets/entries/note", params);
  }

  /** Accept a transition warning that is there now (DEC-106). */
  async acknowledgeSetWarning(params: SetTransitionWarningRef): Promise<SetAnswer<SetAcknowledged>> {
    return this.setsPost("/api/v1/sets/acknowledge", params);
  }

  /** Withdraw an acknowledgement. */
  async unacknowledgeSetWarning(params: SetTransitionWarningRef): Promise<SetAnswer<SetUnacknowledged>> {
    return this.setsPost("/api/v1/sets/unacknowledge", params);
  }

  /** Save a set list where the dialog chose; the engine judges the path. */
  async saveSetList(params: { set_id: number; destination_path: string }): Promise<SetAnswer<SetListSave>> {
    return this.setsPost("/api/v1/sets/set-list/save", params);
  }

  // -------------------------------------------------------------------------
  // Waveforms and their analysis (WAVE-03, WAVE-05)
  //
  // Two reads and four actions, each answering a `WaveformAnswer`.
  // -------------------------------------------------------------------------

  private async waveformsPost<T>(path: string, body: object = {}): Promise<WaveformAnswer<T>> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return readWaveformAnswer<T>(res);
  }

  /** Each track's state and, when ready, its picture at `width`; with `marks`, its cues and grid. */
  async getWaveforms(params: WaveformsQuery): Promise<WaveformAnswer<WaveformBatch>> {
    const query = new URLSearchParams({ track_ids: params.track_ids.join(",") });
    // Without pictures (WAVE-08): states and loudness, and no width to give.
    if (params.data === false) query.set("data", "0");
    else query.set("width", String(params.width));
    query.set("marks", params.marks ? "1" : "0");
    const res = await fetch(this.url(`/api/v1/waveforms?${query}`), { headers: this.headers() });
    type Wire = Omit<WaveformBatch, "waveforms"> & {
      waveforms: (Omit<WaveformTrack, "data"> & { data: string | null })[];
    };
    const answer = await readWaveformAnswer<Wire>(res);
    if (answer.refusal) return answer;
    return {
      value: {
        ...answer.value,
        waveforms: answer.value.waveforms.map((track) => ({
          ...track,
          data: waveformBytes(track.data),
        })),
      },
      refusal: null,
    };
  }

  /** Analyse these tracks first, at most 50, even while the analysis is paused. */
  async requestWaveforms(params: {
    track_ids: number[];
  }): Promise<WaveformAnswer<WaveformsRequested>> {
    return this.waveformsPost("/api/v1/waveforms/request", { track_ids: params.track_ids });
  }

  /** Empty the waveform data; the analysis starts again unless paused. */
  async deleteWaveformData(): Promise<WaveformAnswer<WaveformDataDeletion>> {
    return this.waveformsPost("/api/v1/waveforms/delete-data");
  }

  /** The analysis as a whole: its state, counts and rate. */
  async getWaveformAnalysis(): Promise<WaveformAnswer<WaveformAnalysisStatus>> {
    const res = await fetch(this.url("/api/v1/waveforms/analysis"), { headers: this.headers() });
    return readWaveformAnswer<WaveformAnalysisStatus>(res);
  }

  /** Pause, persisted across a restart, and stop a running run. */
  async pauseWaveformAnalysis(): Promise<WaveformAnswer<WaveformAnalysisStatus>> {
    return this.waveformsPost("/api/v1/waveforms/analysis/pause");
  }

  /** Clear the pause and start a run. */
  async resumeWaveformAnalysis(): Promise<WaveformAnswer<WaveformAnalysisStatus>> {
    return this.waveformsPost("/api/v1/waveforms/analysis/resume");
  }

  /** The whole Collection tree, with counts and broken-rule state (ORG-04). */
  async getCollections(): Promise<CollectionTree> {
    return this.getJson("/api/v1/collections");
  }

  /** One window of a Collection's membership, in its own order (DEC-058). */
  async getCollectionEntries(params: {
    collectionId: number;
    limit?: number;
    offset?: number;
  }): Promise<CollectionEntryPage> {
    const query = new URLSearchParams({ collection_id: String(params.collectionId) });
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.offset != null) query.set("offset", String(params.offset));
    return this.getJson(`/api/v1/collections/entries?${query.toString()}`);
  }

  async createCollection(params: {
    kind: "folder" | "collection";
    name: string;
    parent_id?: number | null;
  }): Promise<{ collection: CollectionNode }> {
    return this.postJson("/api/v1/collections/create", params);
  }

  /**
   * A plain Collection holding these tracks in the order given, made in one
   * step (STATS-05): the Collection and its tracks, or neither.
   */
  async createCollectionFrom(params: {
    name: string;
    parent_id?: number | null;
    track_ids: number[];
  }): Promise<{ collection: CollectionNode }> {
    return this.postJson("/api/v1/collections/create-from", params);
  }

  async renameCollection(params: {
    id: number;
    name: string;
  }): Promise<{ collection: CollectionNode }> {
    return this.postJson("/api/v1/collections/rename", params);
  }

  async moveCollection(params: {
    id: number;
    parent_id?: number | null;
    position?: number | null;
  }): Promise<{ collection: CollectionNode }> {
    return this.postJson("/api/v1/collections/move", params);
  }

  /** Delete a node and everything under it, echoing what went (ORG-09). */
  async deleteCollection(params: {
    id: number;
  }): Promise<{ removed: CollectionSubtree }> {
    return this.postJson("/api/v1/collections/delete", params);
  }

  /** What a delete would take, before it takes it. */
  async previewCollectionDelete(params: {
    id: number;
  }): Promise<{ removes: CollectionSubtree }> {
    return this.postJson("/api/v1/collections/delete/preview", params);
  }

  async addTracksToCollection(params: {
    collection_id: number;
    track_ids: number[];
  }): Promise<CollectionAdded> {
    return this.postJson("/api/v1/collections/tracks/add", params);
  }

  /** The deliberate duplicate DEC-058 allows: a drop between two rows. */
  async insertTrackInCollection(params: {
    collection_id: number;
    track_id: number;
    position: number;
    /** In a Set, the chapter for a place on a boundary (PREP-08). */
    chapter_id?: number | null;
  }): Promise<{ entry: CollectionEntry }> {
    return this.postJson("/api/v1/collections/tracks/insert", params);
  }

  async removeCollectionEntries(params: {
    entry_ids: number[];
  }): Promise<{ removed: number }> {
    return this.postJson("/api/v1/collections/tracks/remove", params);
  }

  async reorderCollectionEntry(params: {
    entry_id: number;
    position: number;
  }): Promise<{ entry: CollectionEntry }> {
    return this.postJson("/api/v1/collections/tracks/reorder", params);
  }

  /** Save the filter bar as a Smart Collection (DEC-043, DEC-061). */
  async saveSmartCollection(params: {
    name: string;
    rules: FilterRuleSet;
    parent_id?: number | null;
    sort?: string | null;
    dir?: "asc" | "desc" | null;
  }): Promise<{ collection: CollectionNode }> {
    return this.postJson("/api/v1/collections/smart/save", params);
  }

  async updateSmartCollection(params: {
    id: number;
    rules: FilterRuleSet;
    sort?: string | null;
    dir?: "asc" | "desc" | null;
  }): Promise<{ collection: CollectionNode }> {
    return this.postJson("/api/v1/collections/smart/update", params);
  }

  async duplicateSmartCollection(params: {
    id: number;
    name?: string | null;
  }): Promise<{ collection: CollectionNode }> {
    return this.postJson("/api/v1/collections/smart/duplicate", params);
  }

  /** Store today's answer as a plain Collection. A copy, not a link. */
  async freezeSmartCollection(params: {
    id: number;
    name?: string | null;
  }): Promise<FrozenCollection> {
    return this.postJson("/api/v1/collections/smart/freeze", params);
  }

  /** The tag vocabulary with usage counts (ORG-03). */
  async getTags(): Promise<TagVocabulary> {
    return this.getJson("/api/v1/tags");
  }

  /** Create-or-get: typing a tag that exists means the one that exists. */
  async createTag(params: {
    name: string;
    category?: string | null;
    colour?: string | null;
  }): Promise<{ tag: Tag }> {
    return this.postJson("/api/v1/tags/create", params);
  }

  async updateTag(params: {
    id: number;
    name?: string;
    category?: string | null;
    colour?: string | null;
  }): Promise<{ tag: Tag }> {
    return this.postJson("/api/v1/tags/update", params);
  }

  /** Deleting a tag removes it from tracks and deletes none of them. */
  async deleteTag(params: { id: number }): Promise<{ untagged: number }> {
    return this.postJson("/api/v1/tags/delete", params);
  }

  async mergeTags(params: {
    source_id: number;
    target_id: number;
  }): Promise<{ moved: number }> {
    return this.postJson("/api/v1/tags/merge", params);
  }

  async assignTag(params: {
    tag_id: number;
    track_ids: number[];
  }): Promise<{ changed: number; track_ids: number[] }> {
    return this.postJson("/api/v1/tags/assign", params);
  }

  async unassignTag(params: {
    tag_id: number;
    track_ids: number[];
  }): Promise<{ changed: number; track_ids: number[] }> {
    return this.postJson("/api/v1/tags/unassign", params);
  }

  /**
   * Set any of one track's rating, favorite and note (DEC-057).
   *
   * Only the fields sent are changed. `rating: null` clears the override and
   * lets Rekordbox's show through; leaving `rating` out says nothing about it.
   */
  async setTrackMetadata(params: {
    trackId: number;
    rating?: number | null;
    favorite?: boolean;
    notes?: string | null;
  }): Promise<{ metadata: TrackMetadata }> {
    const { trackId, ...body } = params;
    return this.postJson(
      `/api/v1/library/tracks/${encodeURIComponent(String(trackId))}/metadata`,
      body,
    );
  }

  /** One track's field history, newest first (DEC-008). */
  async getTrackHistory(params: {
    trackId: number;
    limit?: number;
  }): Promise<TrackHistory> {
    const id = encodeURIComponent(String(params.trackId));
    const query = params.limit != null ? `?limit=${params.limit}` : "";
    return this.getJson(`/api/v1/library/tracks/${id}/history${query}`);
  }

  /**
   * Apply one operation to a selection of any size (ORG-07, DEC-063).
   *
   * Answers with counts when it applied inline, and with a job id when the
   * selection was large enough to need one — followed through the existing job
   * endpoints, so there is no second progress mechanism.
   */
  async applyBatch(params: {
    selection: BatchSelection;
    operation: BatchOperation;
  }): Promise<BatchOutcome> {
    return this.postJson("/api/v1/library/batch", params);
  }

  /** What the library holds and where it came from (DEC-035). */
  async getLibrarySummary(): Promise<LibrarySummary> {
    const res = await fetch(this.url("/api/v1/library/summary"), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  // -------------------------------------------------------------------------
  // Clean (CLEAN-11)
  //
  // Mutations are POSTs to action paths and reads are GETs, as ORG-08's. Work
  // that runs as a job answers with its identity and is followed through the
  // existing job endpoints, so there is no second progress mechanism.
  // -------------------------------------------------------------------------

  /** Match a selection on Beatport as a resumable job (DEC-065). */
  async startCleanMatch(params: {
    selection: BatchSelection;
    rematch?: boolean;
  }): Promise<MatchStarted> {
    return this.postJson("/api/v1/clean/match", params);
  }

  /** Start a job over the tracks an interrupted match job left. */
  async resumeCleanMatch(params: { job_id: string }): Promise<MatchStarted> {
    return this.postJson("/api/v1/clean/match/resume", params);
  }

  /** Match jobs with tracks still waiting, newest first. */
  async getResumableMatches(): Promise<ResumableMatches> {
    return this.getJson("/api/v1/clean/match/resumable");
  }

  /** A track's state, its decided candidate, and every attempt, newest first. */
  async getTrackMatches(params: { trackId: number }): Promise<TrackMatches> {
    const id = encodeURIComponent(String(params.trackId));
    return this.getJson(`/api/v1/library/tracks/${id}/matches`);
  }

  /** One attempt's candidates, in the order the matcher scored them. */
  async getMatchCandidates(params: { attemptId: number }): Promise<AttemptCandidates> {
    const id = encodeURIComponent(String(params.attemptId));
    return this.getJson(`/api/v1/clean/attempts/${id}/candidates`);
  }

  /** The file, or the nearest folder still there, for "show in folder" (CLEAN-12). */
  async getTrackFolder(params: { trackId: number }): Promise<TrackFolder> {
    const id = encodeURIComponent(String(params.trackId));
    return this.getJson(`/api/v1/library/tracks/${id}/folder`);
  }

  /** Accept a candidate, reject, or clear — one track, or a selection (DEC-067). */
  async decideMatch(params: {
    decision: "accept" | "reject" | "clear";
    track_id?: number;
    candidate_id?: number;
    selection?: BatchSelection;
  }): Promise<DecisionOutcome> {
    return this.postJson("/api/v1/clean/decide", params);
  }

  /** Copy chosen fields from decided candidates into CuePoint's layer (DEC-004). */
  async applyMatch(params: {
    fields: Array<"key" | "bpm" | "genre" | "label" | "year">;
    track_id?: number;
    selection?: BatchSelection;
  }): Promise<ApplyOutcome> {
    return this.postJson("/api/v1/clean/apply", params);
  }

  /** Hand-edit a track's key, BPM, genre, label or year; `null` clears (DEC-068). */
  async setTrackOverrides(params: {
    trackId: number;
    key?: string | null;
    bpm?: number | null;
    genre?: string | null;
    label?: string | null;
    year?: number | null;
  }): Promise<{ track: LibraryTrackRow }> {
    const { trackId, ...body } = params;
    return this.postJson(
      `/api/v1/library/tracks/${encodeURIComponent(String(trackId))}/overrides`,
      body,
    );
  }

  /** Revert one recorded change to a CuePoint field (CLEAN-06). */
  async revertChange(params: { change_id: number }): Promise<{ revert: FieldRevert }> {
    return this.postJson("/api/v1/library/revert", params);
  }

  /** Revert every change a batch made, inline or as a job (CLEAN-06). */
  async revertBatch(params: { batch_id: string }): Promise<BatchRevertOutcome> {
    return this.postJson("/api/v1/library/revert/batch", params);
  }

  /** Check the files of a selection (DEC-073). */
  async startFileCheck(params: { selection: BatchSelection }): Promise<FileCheckStarted> {
    return this.postJson("/api/v1/clean/files/check", params);
  }

  /** Scan for duplicates by some signals, or all of them (DEC-074). */
  async startDuplicateScan(params?: {
    signals?: Array<"path" | "beatport" | "text">;
  }): Promise<DuplicateScanStarted> {
    return this.postJson("/api/v1/clean/duplicates/scan", params ?? {});
  }

  /** The stored duplicate groups, dismissed ones only when asked. */
  async getDuplicateGroups(params?: {
    signal?: "path" | "beatport" | "text";
    includeDismissed?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<DuplicateGroupList> {
    const query = new URLSearchParams();
    if (params?.signal) query.set("signal", params.signal);
    if (params?.includeDismissed) query.set("include_dismissed", "true");
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.offset != null) query.set("offset", String(params.offset));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.getJson(`/api/v1/clean/duplicates${suffix}`);
  }

  async dismissDuplicateGroup(params: { group_id: number }): Promise<{ group: DuplicateGroup }> {
    return this.postJson("/api/v1/clean/duplicates/dismiss", params);
  }

  async restoreDuplicateGroup(params: { group_id: number }): Promise<{ group: DuplicateGroup }> {
    return this.postJson("/api/v1/clean/duplicates/restore", params);
  }

  /** Read a selection's artwork, optionally fetching Beatport's (DEC-076). */
  async startArtworkScan(params: {
    selection: BatchSelection;
    fetch_beatport?: boolean;
  }): Promise<ArtworkScanStarted> {
    return this.postJson("/api/v1/clean/artwork/scan", params);
  }

  /** What a tag write would change: inline, or a job whose id is the preview's. */
  async previewTagWrite(params: {
    selection: BatchSelection;
    options?: TagWriteOptions;
  }): Promise<TagPreviewOutcome> {
    return this.postJson("/api/v1/clean/tags/preview", params);
  }

  /** Write what a preview planned, once (DEC-070). */
  async startTagWrite(params: { preview_id: string }): Promise<TagWriteStarted> {
    return this.postJson("/api/v1/clean/tags/write", params);
  }

  /** Restore what a write job, or every write to a track, replaced. */
  async startTagRestore(params: {
    job_id?: string;
    track_id?: number;
  }): Promise<TagRestoreStarted> {
    return this.postJson("/api/v1/clean/tags/restore", params);
  }

  /** A page of a write job's or a track's record, unconfirmed rows counted. */
  async getTagWrites(params: {
    jobId?: string;
    trackId?: number;
    limit?: number;
    offset?: number;
  }): Promise<TagWriteRecord> {
    const query = new URLSearchParams();
    if (params.jobId) query.set("job_id", params.jobId);
    if (params.trackId != null) query.set("track_id", String(params.trackId));
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.offset != null) query.set("offset", String(params.offset));
    return this.getJson(`/api/v1/clean/tags/writes?${query.toString()}`);
  }

  /** Library Health: counts, each with the rules a click opens (DEC-075). */
  async getLibraryHealth(): Promise<LibraryHealth> {
    return this.getJson("/api/v1/clean/health");
  }

  /** The Statistics page's plays: top tracks, artists and labels (STATS-02). */
  async getStatisticsPlays(params: StatisticsPlaysParams = {}): Promise<StatisticsPlays> {
    const query = new URLSearchParams();
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.since) query.set("since", params.since);
    if (params.tz) query.set("tz", params.tz);
    if (params.sinceRead) query.set("since_read", params.sinceRead);
    if (params.scope) query.set("scope", params.scope);
    return this.getJson(`/api/v1/statistics/plays?${query.toString()}`);
  }

  /** How a scope spreads by genre, tempo, year, date added, rating and loudness (STATS-03). */
  async getStatisticsSpreads(params: { scope?: StatisticsScope } = {}): Promise<StatisticsSpreads> {
    const query = new URLSearchParams();
    if (params.scope) query.set("scope", params.scope);
    return this.getJson(`/api/v1/statistics/spreads?${query.toString()}`);
  }

  /** File, Beatport and analysis counts over a scope (STATS-03). */
  async getStatisticsHealth(params: { scope?: StatisticsScope } = {}): Promise<StatisticsHealth> {
    const query = new URLSearchParams();
    if (params.scope) query.set("scope", params.scope);
    return this.getJson(`/api/v1/statistics/health?${query.toString()}`);
  }

  /** "Export review list": a selection's match states and decided candidates. */
  async exportReviewList(params: {
    selection: BatchSelection;
    format: ReviewExportFormat;
    file_path: string;
    overwrite?: boolean;
  }): Promise<ReviewExportResult> {
    return this.postJson("/api/v1/clean/export", params);
  }

  /**
   * What a Rekordbox export of these Collections would write (DEC-084). Not
   * `exportReviewList` above, which is the CSV, JSON and Excel file.
   */
  async previewRekordboxExport(params: {
    collection_ids?: number[] | null;
    key_format?: RekordboxKeyFormat | null;
  }): Promise<RekordboxExportPreviewAnswer> {
    const answer = await this.postRefusable<{ preview: RekordboxExportPreview }>(
      "/api/v1/rekordbox-export/preview",
      params,
    );
    return answer.refusal
      ? { preview: null, refusal: answer.refusal }
      : { preview: answer.body.preview, refusal: null };
  }

  /** Start a Rekordbox export to the file a person chose, as a job. */
  async startRekordboxExport(params: {
    collection_ids?: number[] | null;
    key_format?: RekordboxKeyFormat | null;
    destination_path: string;
  }): Promise<RekordboxExportStartAnswer> {
    const answer = await this.postRefusable<RekordboxExportStarted>(
      "/api/v1/rekordbox-export/start",
      params,
    );
    return answer.refusal
      ? { started: null, refusal: answer.refusal }
      : { started: answer.body, refusal: null };
  }

  /** Recent Rekordbox exports, and what the next one starts from (DEC-083). */
  async getRekordboxExportHistory(params?: { limit?: number }): Promise<RekordboxExportHistory> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.getJson(`/api/v1/rekordbox-export/history${suffix}`);
  }

  /**
   * Recent activity (SHELL-08). Not `/history`: that endpoint means past match
   * runs, which are exported CSV files, and is a different thing entirely.
   */
  async getRecentActivity(params?: {
    limit?: number;
    type?: string;
  }): Promise<ActivityFeed> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.type) query.set("type", params.type);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(this.url(`/api/v1/activity/recent${suffix}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  /**
   * List jobs (SHELL-07). Unlike `getJob`, this needs no id, which is what
   * lets the status strip report on a job it did not start — one begun before
   * a renderer reload, or by another window.
   */
  async listJobs(params?: {
    state?: "active" | "all";
    limit?: number;
  }): Promise<EngineJobList> {
    const query = new URLSearchParams();
    if (params?.state) query.set("state", params.state);
    if (params?.limit != null) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(this.url(`/api/v1/jobs${suffix}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async getJob(jobId: string): Promise<Record<string, unknown>> {
    const res = await fetch(this.url(`/api/v1/jobs/${jobId}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async getJobResults(jobId: string): Promise<{
    id: string;
    state: string;
    /** What the job produced, for a job that produces something. */
    result?: Record<string, unknown>;
  }> {
    const res = await fetch(this.url(`/api/v1/jobs/${jobId}/results`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  /**
   * Ask a running job to stop.
   *
   * Named for the route rather than for its first caller (ORG-13): the engine
   * has one job store and one cancel, and every job type checks it — a match,
   * an import, a refresh, and a batch over everything a query matches. It was
   * called `cancelMatchJob` while inKey was the only thing that ran one, which
   * made it read as unavailable to everything since.
   */
  async cancelJob(jobId: string): Promise<{ id: string; state: string }> {
    const res = await fetch(this.url(`/api/v1/jobs/${jobId}/cancel`), {
      method: "POST",
      headers: this.headers(),
      body: "{}",
    });
    return readJson(res);
  }

  async getBeatportTokenStatus(): Promise<{ configured: boolean; masked: string | null }> {
    const res = await fetch(this.url("/api/v1/config/beatport-token"), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async setBeatportToken(token: string): Promise<{ configured: boolean; masked: string | null }> {
    const res = await fetch(this.url("/api/v1/config/beatport-token"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ token }),
    });
    return readJson(res);
  }

  async testBeatportToken(body?: {
    token?: string;
  }): Promise<{ ok: boolean; message: string; reason?: "missing" | "rejected" | "unreachable" }> {
    const res = await fetch(this.url("/api/v1/config/beatport-token/test"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body ?? {}),
    });
    return readJson(res);
  }

  async exportSupportBundle(body: {
    output_dir: string;
    include_logs?: boolean;
    include_config?: boolean;
    sanitize?: boolean;
  }): Promise<{ bundle_path: string; file_name: string; size_bytes: number }> {
    const res = await fetch(this.url("/api/v1/support/bundle"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return readJson(res);
  }

  async getLogsDir(): Promise<{ logs_dir: string }> {
    const res = await fetch(this.url("/api/v1/logs/dir"), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async getCuepointLog(body?: {
    level?: string;
    search?: string;
    tailLines?: number;
    maxBytes?: number;
    sanitize?: boolean;
  }): Promise<{ logs_dir: string; cuepoint_log: string; size_bytes: number }> {
    const query = new URLSearchParams();
    if (body?.level) query.set("level", body.level);
    if (body?.search) query.set("search", body.search);
    if (body?.tailLines != null) query.set("tail_lines", String(body.tailLines));
    if (body?.maxBytes != null) query.set("max_bytes", String(body.maxBytes));
    if (body?.sanitize != null) query.set("sanitize", body.sanitize ? "1" : "0");
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(this.url(`/api/v1/logs/cuepoint${suffix}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async clearCuepointLogs(): Promise<{ ok: boolean }> {
    const res = await fetch(this.url("/api/v1/privacy/clear-logs"), {
      method: "POST",
      headers: this.headers(),
      body: "{}",
    });
    return readJson(res);
  }

  /** Tell the engine the error-reporting choice (REPORT-01, DEC-128). */
  async setErrorReporting(enabled: boolean): Promise<{ enabled: boolean }> {
    const res = await fetch(this.url("/api/v1/reporting"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ enabled }),
    });
    return readJson(res);
  }

  async clearCuepointCache(): Promise<{ ok: boolean }> {
    const res = await fetch(this.url("/api/v1/privacy/clear-cache"), {
      method: "POST",
      headers: this.headers(),
      body: "{}",
    });
    return readJson(res);
  }

  async streamJobEvents(
    jobId: string,
    signal: AbortSignal,
    onEvent: (event: Record<string, unknown>) => void,
  ): Promise<void> {
    const res = await fetch(this.url(`/api/v1/jobs/${jobId}/events`), {
      headers: {
        ...currentTraceHeaders(),
        Authorization: `Bearer ${this.token}`,
        Accept: "text/event-stream",
      },
      signal,
    });
    if (!res.ok) {
      await readJson(res);
      return;
    }
    await collectSseUntilTerminal(
      res,
      (state) => state === "succeeded" || state === "failed" || state === "cancelled",
      onEvent,
    );
  }
}

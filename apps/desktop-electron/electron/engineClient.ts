/** Authenticated HTTP client for the loopback engine (main process only). */

import { collectSseUntilTerminal } from "./sseClient.js";

export interface EngineApiError {
  code: string;
  message: string;
}

/** The two thumbnail sizes the engine makes (CLEAN-09): a table row, the Inspector. */
export type ArtworkSize = "row" | "inspector";

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: EngineApiError };
  if (!res.ok) {
    const message = body.error?.message ?? `Engine request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
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
export type CollectionKind = "folder" | "collection" | "smart";

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

export interface LibraryFilterField {
  name: string;
  type: "text" | "number" | "date" | "bool" | "tag" | "collection";
  label: string;
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

export interface LibraryTrackDetail {
  track: LibraryTrackRow;
  playlists: LibraryPlaylistNode[];
  playlist_count: number;
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

export type ReviewExportFormat = "csv" | "json" | "excel";

export interface ReviewExportResult {
  file_path: string;
  format: ReviewExportFormat;
  count: number;
  columns: string[];
}

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
    return headers;
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
      await readJson(res);
      throw new Error(`Engine request failed (${res.status})`);
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

  async getIncrateInventory(params?: {
    limit?: number;
    search?: string;
    demo?: boolean;
  }): Promise<Record<string, unknown>> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.search) query.set("search", params.search);
    if (params?.demo) query.set("demo", "true");
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(this.url(`/api/v1/incrate/inventory${suffix}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async importIncrateXml(body: {
    xml_path: string;
    enrich?: boolean;
  }): Promise<Record<string, unknown>> {
    const res = await fetch(this.url("/api/v1/incrate/import"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return readJson(res);
  }

  async resetIncrateInventory(): Promise<{ ok: boolean; stats: { total: number } }> {
    const res = await fetch(this.url("/api/v1/incrate/reset"), {
      method: "POST",
      headers: this.headers(),
      body: "{}",
    });
    return readJson(res);
  }

  async getIncrateDiscoverOptions(): Promise<Record<string, unknown>> {
    const res = await fetch(this.url("/api/v1/incrate/discover/options"), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async runIncrateDiscover(body: {
    demo?: boolean;
    genre_ids?: number[];
    charts_from?: string;
    charts_to?: string;
    new_releases_days?: number;
    artist_names?: string[];
    label_names?: string[];
  }): Promise<{ tracks: Record<string, unknown>[]; count: number; demo?: boolean }> {
    const res = await fetch(this.url("/api/v1/incrate/discover"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return readJson(res);
  }

  async createIncratePlaylist(body: {
    name: string;
    tracks: Record<string, unknown>[];
  }): Promise<Record<string, unknown>> {
    const res = await fetch(this.url("/api/v1/incrate/playlist"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
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
  }): Promise<{ ok: boolean; message: string }> {
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

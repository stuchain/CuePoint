/**
 * A job's progress, as the engine's `progress_to_dict` sends it. Every job type
 * reports through this one shape; most fill only the counts and the message.
 */
export interface ProgressInfo {
  completed_tracks: number;
  total_tracks: number;
  matched_count: number;
  unmatched_count: number;
  current_track: { title: string; artists: string };
  elapsed_time: number;
  eta_seconds: number | null;
  status_message: string | null;
  reliability_state: string | null;
  percentage: number;
}

/** Health of the bundled audio player (PLAYER-03). */
export interface PlayerStatus {
  available: boolean;
  running: boolean;
  reconnecting: boolean;
  restartAttempts: number;
  error?: string;
  source?: string;
}

/** What is playing, as mirrored from mpv. */
export interface PlaybackState {
  filePath: string | null;
  playing: boolean;
  paused: boolean;
  positionSeconds: number | null;
  durationSeconds: number | null;
  volume: number;
  muted: boolean;
}

export type RepeatMode = "off" | "one" | "all";

export type QueueItemStatus = "pending" | "playing" | "failed";

/** One entry in the playback queue (PLAYER-04). */
export interface QueueItem {
  id: string;
  trackId: number | null;
  filePath: string;
  title: string;
  artist: string;
  /** What the player bar and the queue panel show for a DJ (PLAYER-06). */
  key: string | null;
  bpm: number | null;
  durationSeconds: number | null;
  status: QueueItemStatus;
}

/**
 * The shape of the queue, pushed on every change (PLAYER-08).
 *
 * Not its contents: at PLAYER-05's 50,000-track cap those are about 14.5 MB,
 * and this is pushed several times a second while a track plays. The panel
 * reads what it can see through `queueWindow`.
 */
export interface QueueSnapshot {
  length: number;
  currentId: string | null;
  currentIndex: number;
  /** The playing entry, so the bar needs no window request. */
  currentItem: QueueItem | null;
  shuffle: boolean;
  repeat: RepeatMode;
}

/** One page of the queue, in play order (PLAYER-08). */
export interface QueueWindow {
  offset: number;
  total: number;
  items: QueueItem[];
}

/** What a caller adds to the queue; ids and status are assigned in main. */
export interface QueueItemInput {
  trackId?: number | null;
  filePath: string;
  title?: string;
  artist?: string;
  key?: string | null;
  bpm?: number | null;
  durationSeconds?: number | null;
}

export interface PlayerSnapshot {
  status: PlayerStatus;
  playback: PlaybackState;
  queue: QueueSnapshot;
  /** The output settings and what they actually resolved to (PLAYER-11). */
  audio: AudioState;
}

export type PlayerPlayResult =
  | { ok: true }
  | { ok: false; code: string; error: string };

/**
 * The result of queueing a whole view (PLAYER-05).
 *
 * `truncated` and `message` exist because a view can be larger than a queue is
 * allowed to be, and doing less than was asked without saying so is the one
 * outcome that is not acceptable.
 */
export type PlayerPlayViewResult =
  | {
      ok: true;
      queued: number;
      total: number;
      truncated: boolean;
      message: string | null;
    }
  | { ok: false; code: string; error: string };

/**
 * The player bridge (PLAYER-03, extended by PLAYER-04).
 *
 * Everything that plays goes through the queue, which is why there is no
 * single-file `play`: one path means the queue and what is actually playing
 * cannot disagree.
 */
/** Mirrors `MediaKeyState` in `electron/mediaKeys.ts`. */
export type MediaKeyStatus = "held" | "unavailable" | "taken" | "idle";

/**
 * Something the player wants said once (PLAYER-10, DEC-054).
 *
 * `track-failed` covers files that would not play — one message per run of
 * failures, however many tracks it covers. `player-unavailable` is mpv itself
 * being gone, which is a different problem with a different answer.
 *
 * Mirrors `PlayerNoticeKind` in `electron/playbackFailures.ts`.
 */
export type PlayerNoticeKind =
  | "track-failed"
  | "player-unavailable"
  | "audio-fallback"
  | "media-keys-unavailable";

export interface PlayerNotice {
  /** Rises with every notice, so a repeat can be told from a re-delivery. */
  id: number;
  kind: PlayerNoticeKind;
  message: string;
  /** How many tracks it covers; zero when it is not about tracks. */
  count: number;
  /** True when playback stopped as a result. */
  stopped: boolean;
}

/**
 * The audio output as chosen and as it actually is (PLAYER-11, DEC-055).
 *
 * The two come apart when a fallback happens — exclusive output refused by a
 * busy device, a chosen interface unplugged — and the settings panel shows
 * both, because a toggle that says "on" while the audio is shared is a lie.
 */
export interface AudioSettings {
  device: string;
  exclusive: boolean;
}

export interface AudioState extends AudioSettings {
  activeDevice: string;
  activeExclusive: boolean;
  /** False on Linux, where there is no exclusive mode to offer. */
  exclusiveSupported: boolean;
}

export interface AudioDevice {
  name: string;
  description: string;
}

export interface AudioDevicesResult {
  ok: boolean;
  devices: AudioDevice[];
  error?: string;
  code?: string;
}

export interface PlayerBridge {
  getState: () => Promise<PlayerSnapshot>;
  /**
   * Whether the machine's media keys are driving CuePoint.
   *
   * `"unavailable"` is macOS refusing them until Accessibility is granted;
   * `"taken"` is another application owning them, which is not a problem.
   */
  mediaKeyStatus?: () => Promise<MediaKeyStatus>;
  /** Play a view's worth of tracks, starting at one of them (DEC-012). */
  playQueue: (items: QueueItemInput[], startIndex?: number) => Promise<PlayerPlayResult>;
  /**
   * Play the whole of the view described by `params` (PLAYER-05).
   *
   * Send the query, not the rows: the table holds a window, and the queue is
   * the whole view in the view's own order.
   */
  playView: (
    params: LibraryBrowseParams,
    startIndex?: number,
  ) => Promise<PlayerPlayViewResult>;
  /** One page of the queue, in play order (PLAYER-08). */
  queueWindow: (offset: number, limit: number) => Promise<QueueWindow>;
  /** DEC-013's two append actions. */
  playNext: (items: QueueItemInput[]) => Promise<void>;
  addToQueue: (items: QueueItemInput[]) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  jumpTo: (index: number) => Promise<void>;
  removeFromQueue: (id: string) => Promise<void>;
  moveInQueue: (from: number, to: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  setShuffle: (on: boolean) => Promise<void>;
  setRepeat: (mode: RepeatMode) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  toggle: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  /** The output devices mpv can see right now (PLAYER-11, DEC-055). */
  audioDevices: () => Promise<AudioDevicesResult>;
  setAudioSettings: (settings: Partial<AudioSettings>) => Promise<PlayerPlayResult>;
  /** Subscribe to state pushes; returns an unsubscribe function. */
  subscribeState: (onState: (snapshot: PlayerSnapshot) => void) => () => void;
  /**
   * Subscribe to one-off notices (PLAYER-10): a track that would not play, or
   * a player that is gone. Not replayed on subscribe — a notice is an event,
   * and a reloaded window must not show a toast about something it missed.
   *
   * One exception, delivered once to the first subscriber:
   * `media-keys-unavailable` is decided at startup, before any renderer exists,
   * and describes a permission that is still missing when the window opens.
   * Query `mediaKeyStatus` for it instead of relying on catching the notice.
   */
  subscribeNotices: (onNotice: (notice: PlayerNotice) => void) => () => void;
}

export interface EngineStatus {
  connected: boolean;
  version?: string;
  sessionId?: string;
  error?: string;
  /** True while a bounded auto-restart is in progress (DEC-028). */
  reconnecting?: boolean;
  restartAttempts?: number;
}

export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** One job's status, from `getJob` and from its event stream. */
export interface JobStatus {
  id: string;
  /** The job's kind, e.g. `clean_match` or `library_import`. */
  type?: string;
  state: JobState;
  progress?: Partial<ProgressInfo>;
  error?: { code: string; message: string };
  demo?: boolean;
}

export interface JobResultsResponse {
  id: string;
  state: JobState;
  /**
   * What a job produced when its answer is not a list of matched tracks — a
   * refresh preview's diff, or what an apply did. Served here rather than on
   * the status payload, which is polled for every job.
   */
  result?: RefreshDiff | RefreshApplied | TagWritePreview | TagWriteResult | TagRestoreResult | Record<string, unknown>;
}

/** The file type the save dialog filters on; Clean's export names Excel `xlsx` here. */
export type ExportFormat = "csv" | "json" | "xlsx";

export interface IncrateInventoryRow {
  id: number;
  track_id?: string;
  artist: string;
  title: string;
  label?: string;
  beatport_url?: string | null;
}

export interface IncrateInventoryResponse {
  stats: { total: number; with_label?: number };
  rows: IncrateInventoryRow[];
  limit?: number;
  search?: string;
  demo?: boolean;
}

export interface IncrateDiscoverTrack {
  beatport_track_id: number;
  beatport_url: string;
  title: string;
  artists: string;
  source_type: string;
  source_name: string;
  source_label_name?: string | null;
  source_url?: string | null;
}

export interface IncrateDiscoverOptions {
  inventory_stats: { total: number; with_label?: number };
  artists: { name: string }[];
  labels: { name: string }[];
  genres: { id: number; name: string; slug: string }[];
  token_configured: boolean;
  defaults: {
    charts_from: string;
    charts_to: string;
    new_releases_days: number;
  };
}

export interface IncrateDiscoverResponse {
  tracks: IncrateDiscoverTrack[];
  count: number;
  demo?: boolean;
}

export interface IncratePlaylistResponse {
  success: boolean;
  playlist_url?: string | null;
  playlist_id?: string | null;
  added_count: number;
  error?: string | null;
}

export type OpenXmlDialogResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

export interface SupportBundleExportResult {
  canceled: boolean;
  bundle_path?: string;
  file_name?: string;
  size_bytes?: number;
}

export interface LogsDirResponse {
  logs_dir: string;
}

export interface CuepointLogResponse {
  logs_dir: string;
  cuepoint_log: string;
  size_bytes: number;
}

export interface ClearOkResponse {
  ok: boolean;
}

export interface PrivacyExitPrefs {
  clearCacheOnExit: boolean;
  clearLogsOnExit: boolean;
}

export type SaveExportDialogResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

export interface BeatportTokenStatus {
  configured: boolean;
  masked: string | null;
}

export interface BeatportTokenTestResult {
  ok: boolean;
  message: string;
}

/**
 * Library search (DEC-023, SHELL-04).
 *
 * Mirrors the engine's `/api/v1/library/search` response. That shape is a
 * public contract — Phase 4's Library UI extends the same endpoint rather than
 * introducing another search path — so these types are kept in step with
 * `library_api.py` and `engineClient.ts` deliberately, not incidentally.
 */
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
  /** Stars, 0-5. The parser converts Rekordbox's 0/51/…/255 at import. */
  rating: number | null;
  play_count: number | null;
  colour: string | null;
  date_added: string | null;
  comment: string | null;
  bitrate: number | null;
  file_path: string;
  /**
   * CuePoint's own layer, resolved (ORG-08, DEC-057). `rating` above stays
   * exactly what Rekordbox imported; this is what to draw, and
   * `rating_source` says which of the two it came from. Notes are not here on
   * purpose — the Inspector reads one track and can afford them.
   */
  effective_rating: number | null;
  rating_source: "cuepoint" | "rekordbox" | null;
  favorite: boolean;
  /**
   * The five fields CuePoint can override, as a user sees them (CLEAN-05,
   * DEC-068): the override when there is one, otherwise the plain field above,
   * which stays what Rekordbox imported. `overridden` names the fields an
   * override supplies. Optional only because fixtures written before CLEAN-05
   * describe valid rows; the engine always sends them.
   */
  effective_key?: string | null;
  effective_bpm?: number | null;
  effective_genre?: string | null;
  effective_label?: string | null;
  effective_year?: number | null;
  overridden?: Array<"key" | "bpm" | "genre" | "label" | "year">;
  /**
   * Where each override came from (CLEAN-13): applied from a Beatport match, or
   * typed by a person — the latest history row for it. Only overridden fields
   * are named.
   */
  override_sources?: Partial<Record<"key" | "bpm" | "genre" | "label" | "year", OverrideSource>>;
  /**
   * Where the track stands with Clean (CLEAN-11), each read through its filter's
   * own expression, so a row marked "needs review" is a row that filter finds.
   * Null when the engine did not read them for this row. Optional for
   * CLEAN-05's reason: fixtures written before this step describe valid rows.
   */
  match_state?: MatchState | null;
  match_disputed?: boolean | null;
  /** The score of the candidate the state points at (CLEAN-13). */
  match_score?: number | null;
  file_status?: FileStatus | null;
  artwork?: ArtworkState | null;
}

/** Where an override came from (CLEAN-05): applied from Beatport, or typed. */
export type OverrideSource = "beatport" | "cuepoint";

export interface LibrarySearchResponse {
  query: string;
  total: number;
  limit: number;
  offset: number;
  tracks: LibraryTrackRow[];
  /** True when nothing has been imported yet — a different problem from "no
   *  matches", and one the UI has to answer differently. */
  library_empty: boolean;
  /**
   * What the engine was asked, echoed back (LIBUI-03) so a late response can
   * be recognized by what it answers rather than by bookkeeping the renderer
   * keeps in step. Optional because the fixtures written against SHELL-04's
   * shape describe valid requests; the engine always sends these.
   */
  mode?: "search" | "browse";
  scope?: number | null;
  sort?: string;
  dir?: "asc" | "desc";
  /**
   * The rule set the response was computed for, echoed like the rest — a
   * filter changes neither scope, sort nor text, so without it two requests
   * produce responses nothing can tell apart (LIBUI-05).
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
}

/**
 * The library filter model (DEC-043, DEC-016).
 *
 * The same structure Phase 6 saves as a Smart Collection. Flat and AND-only
 * for v1, with `match` on the wire from the start so adding "any" later
 * changes no shape. The renderer never invents a field or an operator: both
 * come from `getLibraryFilterFields()`.
 */
export interface FilterRule {
  field: string;
  operator: string;
  value?: unknown;
}

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
  /** Ask for ids instead of rows — a selection crossing unloaded rows. */
  fields?: "id";
  /**
   * CuePoint's own scope (ORG-08). A Collection opens in the order the user
   * arranged unless `sort` says otherwise; a Smart Collection resolves to the
   * rules it saved and is narrowed further by anything in `filters`.
   */
  scope?: "collection" | "smart";
  collectionId?: number | null;
}

/** One node of the mirrored Rekordbox tree; read-only source data (DEC-031). */
export interface LibraryPlaylistNode {
  id: number;
  parent_id: number | null;
  name: string;
  kind: "folder" | "playlist";
  depth: number;
  position: number;
  /** Derived and not guaranteed unique — a name may contain the separator. */
  path: string;
  track_count: number;
}

export interface LibraryPlaylistTree {
  playlists: LibraryPlaylistNode[];
  total: number;
}

export interface LibraryFacetValue {
  /** Null is the "no value" bucket, which the `is_empty` operator filters by. */
  value: string | null;
  count: number;
  /**
   * What to show, when that is not the value itself. A tag's value is its id,
   * because that is what a rule carries and what survives a rename; its label
   * is the tag's name. Absent for every field that is its own label.
   */
  label?: string;
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
  /** True when the field has more values than were returned. */
  truncated: boolean;
  total_values: number;
  /** Present for number fields only. */
  range: LibraryFacetRange | null;
}

export interface LibraryFilterField {
  name: string;
  /** All six kinds, each with a control in the bar since ORG-12. */
  type: "text" | "number" | "date" | "bool" | "tag" | "collection";
  label: string;
  facetable: boolean;
  integer: boolean;
  /**
   * What the number means, when a plain number is not the whole of it.
   * `"stars"` is a rating on the five-star scale, so the bar offers five stars
   * rather than a box to type `4` into — for every field the engine says is
   * one, which is how all three rating layers get the same control without the
   * renderer holding a list of their names (DEC-043). Null is a plain value,
   * and so is a unit this build does not recognize.
   */
  unit: string | null;
  operators: string[];
  /**
   * The fixed values a text field holds, each with its name (CLEAN-13), or null
   * for a field whose values are the library's own. A field with choices is
   * offered as a choice rather than a text box, and a chip reads the name.
   * Optional because vocabularies recorded before CLEAN-13 describe valid
   * fields; the engine always sends it.
   */
  choices?: LibraryFilterChoice[] | null;
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

/** A track and where it sits in the collection — the Inspector (DEC-047). */
export interface LibraryTrackDetail {
  track: LibraryTrackRow;
  playlists: LibraryPlaylistNode[];
  playlist_count: number;
  /** CuePoint's own layer, notes included (ORG-08, DEC-057). */
  metadata: TrackMetadata;
  tags: Array<Pick<Tag, "id" | "name" | "category" | "colour">>;
  collections: Array<Pick<CollectionNode, "id" | "name" | "kind">>;
}

/**
 * CuePoint's own organization (ORG-08).
 *
 * Mirrors `organization_api.py`'s explicit field lists, and `engineClient.ts`'s
 * copy of them. Two declarations of one shape, one in each process, because
 * neither can import the other's — the desktop contract test compares them.
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

/** What a subtree delete would take, or did — ORG-09's confirmation. */
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
  /** The override, or null. Different from zero, which is a rating. */
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

/**
 * A selection: the tracks in hand, or the query that names them (DEC-045).
 *
 * The query form is what keeps a 47,913-track operation from crossing the
 * bridge as 47,913 numbers.
 */
export interface BatchSelection {
  track_ids?: number[];
  query?: {
    q?: string;
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
    // CLEAN-04's decisions, which take no value, and CLEAN-05's apply (the
    // field list) and hand edit ({ field, value }).
    | "accept_match"
    | "reject_match"
    | "apply_match"
    | "set_override";
  value?: number | boolean | null | string[] | { field: string; value: unknown };
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

/** A preview or an apply, both of which run as background jobs (DEC-033). */
export interface LibraryRefreshStarted {
  job_id: string;
  id: string;
  state: string;
}

/** One track in a diff, named well enough to show in a list. */
export interface RefreshTrackSummary {
  rekordbox_track_id: string;
  title: string;
  artist: string;
  file_path: string;
}

/** A track whose Rekordbox fields differ, and which ones. */
export interface RefreshTrackChange {
  rekordbox_track_id: string;
  title: string;
  artist: string;
  /** Field name to `{ from, to }`. */
  fields: Record<string, { from: unknown; to: unknown }>;
  /** False when every difference is incidental, e.g. only the play count. */
  is_notable: boolean;
}

/** A track kept through a Rekordbox renumbering (DEC-002). */
export interface RefreshRelinkedTrack {
  rekordbox_track_id: string;
  previous_rekordbox_track_id: string;
  file_path: string;
}

export interface RefreshPlaylistSummary {
  rekordbox_path: string;
  kind: string;
  track_count: number;
}

export interface RefreshPlaylistChange extends RefreshPlaylistSummary {
  change: string;
  previous_track_count: number;
}

/**
 * An exact count with a bounded sample of what is in it.
 *
 * `count` is always the whole truth; `items` is capped so a diff over a large
 * collection stays a payload rather than a second copy of the library.
 * `truncated` says the two differ.
 */
export interface RefreshCategory<T> {
  count: number;
  items: T[];
  truncated: boolean;
}

/** Which Collections or Sets hold the tracks a refresh would delete, and how many. */
export interface RefreshReferences {
  collection_count: number;
  set_count: number;
  referenced_track_count: number;
  referenced_track_ids: number[];
  /**
   * The Collections themselves (ORG-13).
   *
   * Always as long as `collection_count`. A Collection a refresh emptied says
   * so rather than reading as one nobody has filled yet, and that needs the
   * ids rather than the arithmetic.
   */
  collection_ids: number[];
  has_references: boolean;
  /**
   * The rest of what a user authored on those tracks (DEC-011 as amended,
   * CLEAN-05). Each counts tracks, and a track carrying several is one
   * referenced track. Always sent: a sentence that names a kind has its
   * number.
   */
  collection_track_count: number;
  rated_track_count: number;
  tagged_track_count: number;
  reviewed_track_count: number;
  edited_track_count: number;
}

/**
 * What a refresh would change, having changed nothing (DEC-032).
 *
 * Arrives as a preview job's `result`. `diff_id` is what an apply names, and
 * it is only good while the file is untouched — the engine refuses a stale one
 * rather than deleting on the strength of numbers that no longer hold.
 */
export interface RefreshDiff {
  diff_id: string;
  xml_path: string;
  is_empty: boolean;
  duration_seconds: number;
  /**
   * Whether the export was actually read (LIBRARY-12).
   *
   * False when the answer came from the file's recorded modified time and size
   * alone, which is what happens when nothing has touched it since the import —
   * reading a 50,000-track collection to be told nothing changed costs as much
   * as importing it. Only ever false on an empty diff, so it never accompanies
   * a claim that something changed.
   */
  contents_compared: boolean;
  computed_at: string;
  xml_modified_at: string | null;
  xml_size_bytes: number | null;
  tracks: {
    added: RefreshCategory<RefreshTrackSummary>;
    changed: RefreshCategory<RefreshTrackChange>;
    /** The deletions DEC-003 makes irreversible, and the reason for the preview. */
    removed: RefreshCategory<RefreshTrackSummary>;
    relinked: RefreshCategory<RefreshRelinkedTrack>;
    /** Changed tracks whose difference is more than incidental. A floor when truncated. */
    notable_changed_count: number;
  };
  playlists: {
    added: RefreshCategory<RefreshPlaylistSummary>;
    changed: RefreshCategory<RefreshPlaylistChange>;
    removed: RefreshCategory<RefreshPlaylistSummary>;
  };
  references: RefreshReferences | null;
}

/** What an apply did. Arrives as the apply job's `result`. */
export interface RefreshApplied {
  diff_id: string;
  xml_path: string;
  track_count: number;
  tracks_inserted: number;
  tracks_updated: number;
  /** Reported on its own because it is the irreversible number (DEC-003). */
  tracks_deleted: number;
  relinked_count: number;
  playlists: {
    nodes: number;
    playlists: number;
    folders: number;
    entries: number;
  };
  references: RefreshReferences;
  duration_seconds: number;
  summary_line: string;
}

export interface EngineJobSummary {
  id: string;
  type: string;
  state: JobState;
  created_at: string;
  updated_at: string;
  demo?: boolean;
  /** Same shape `progress_to_dict` sends for a running job. */
  progress?: Partial<ProgressInfo>;
  error?: { code?: string; message?: string };
}

export interface EngineJobList {
  jobs: EngineJobSummary[];
  /** Active jobs in total, regardless of the state filter or the limit. */
  active_count: number;
}

/** The two thumbnail sizes the engine makes (CLEAN-09): a table row, the Inspector. */
export type ArtworkSize = "row" | "inspector";

/**
 * Clean (CLEAN-11).
 *
 * Mirrors `clean_api.py`'s explicit field lists, and `engineClient.ts`'s copy of
 * them; the desktop contract test compares the two. Every value a renderer
 * might offer a user to choose — a state, a signal, a key format — is spelled
 * here as the engine spells it.
 */
export type MatchState = "not_matched" | "no_match" | "needs_review" | "accepted" | "rejected";
export type FileStatus = "present" | "missing" | "unreadable" | "not_checked";
export type ArtworkState = "embedded" | "beatport" | "none" | "unknown";
export type DuplicateSignal = "path" | "beatport" | "text";
export type OverrideField = "key" | "bpm" | "genre" | "label" | "year";

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

/** Where one track stands with Beatport, and who put it there (DEC-067). */
export interface TrackMatchState {
  track_id: number;
  state: MatchState;
  decided_by: "auto" | "user" | null;
  attempt_id: number | null;
  candidate_id: number | null;
  newer_attempt_id: number | null;
  disputed: boolean;
  decided_at: string | null;
}

/** One run of the matcher for one track: what was asked, what came back. */
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

/** Everything the matcher scored, rejected candidates and their reasons included. */
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
  /** The version its title names, as written: "Extended Mix" (CLEAN-12). */
  mix: string | null;
  /** How it differs from the track's imported values, answered by the engine. */
  differs: CandidateDifferences | null;
}

/**
 * Per field, whether a candidate differs from the track (CLEAN-12).
 *
 * `null` means one side has nothing to compare, which is not a difference. The
 * engine answers it, because the same key in two notations is not a difference
 * and only the engine knows the notations.
 */
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

/** A track's imported values: the side of the comparison candidates are marked against. */
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

/**
 * Where "show in folder" can take a person for one track (CLEAN-12).
 *
 * The file itself when it exists; otherwise the nearest folder on its path that
 * does, and `null` when nothing on the path exists — the drive is gone.
 */
export interface TrackFolder {
  track_id: number;
  file_path: string;
  file_exists: boolean;
  folder: string | null;
}

export interface TrackMatches {
  track_id: number;
  track: ComparedTrack;
  state: TrackMatchState;
  /** The candidate the state points at: accepted, rejected, or proposed. */
  candidate: MatchCandidate | null;
  /** Newest first. */
  attempts: MatchAttempt[];
  total: number;
}

export interface AttemptCandidates {
  attempt_id: number;
  track_id: number;
  candidates: MatchCandidate[];
  total: number;
}

/** One track decided (`match`), or a selection applied inline or as a job. */
export interface DecisionOutcome {
  match?: TrackMatchState;
  applied?: BatchResult;
  job_id?: string;
  id?: string;
  state?: string;
}

/** One track applied (`track`, as the Library draws it), or a selection. */
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
  /** False when the field already held the value, so nothing was written. */
  changed: boolean;
}

/** ORG-07's batch result plus what a revert adds: the stale rows it skipped. */
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

/** Tracks one signal put together, as it is now (DEC-074). */
export interface DuplicateGroup {
  id: number;
  signal: DuplicateSignal;
  group_key: string;
  computed_at: string;
  track_ids: number[];
  dismissed: boolean;
}

/** A group as the listing answers it, with its members as Library rows (CLEAN-12). */
export interface ListedDuplicateGroup extends DuplicateGroup {
  members: LibraryTrackRow[];
}

export interface DuplicateGroupList {
  groups: ListedDuplicateGroup[];
  /** Every group, whatever page was asked for. */
  total: number;
  /** Null when every group was asked for. */
  limit: number | null;
  offset: number;
}

export interface DuplicateScanStarted extends CleanJobStarted {
  signals: DuplicateSignal[];
}

export interface ArtworkScanStarted extends CleanJobStarted {
  tracks: number;
  fetch_beatport: boolean;
}

/** What a tag write writes (DEC-070). Absent options take the engine's defaults. */
export interface TagWriteOptions {
  key_format?: "normal" | "camelot" | "short";
  write_key?: boolean;
  write_year?: boolean;
  write_bpm?: boolean;
  write_label?: boolean;
  write_genre?: boolean;
  write_comment?: boolean;
  comment_text?: string;
  /** Off by default: putting a picture into a file is something a person asks for. */
  embed_missing_artwork?: boolean;
}

/** What a tag write would do, before it does anything. A write names `preview_id`. */
export interface TagWritePreview {
  preview_id: string;
  options: Required<TagWriteOptions>;
  total: number;
  /** Files a write will change. */
  files: number;
  /** For each field, artwork included, how many files it will be written into. */
  fields: Record<string, number>;
  /** For each reason, how many files will be skipped, with a few examples. */
  skipped: Record<
    string,
    { count: number; examples: Array<{ track_id: number | null; file_path: string }> }
  >;
  field_skipped: Record<string, Record<string, number>>;
  /** A bounded sample of what changes, file by file. */
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
  /** Present when the preview was answered inline. */
  preview?: TagWritePreview;
  /** Present, with the job's identity, when it runs as a job. */
  preview_id?: string;
  job_id?: string;
  id?: string;
  state?: string;
}

export interface TagWriteStarted extends CleanJobStarted {
  preview_id: string;
}

export interface TagRestoreStarted extends CleanJobStarted {
  /** Recorded writes the restore will undo. */
  writes: number;
  /** Of those, written by a job the engine never saw finish. */
  unconfirmed: number;
  restored_job_id: string | null;
  track_id: number | null;
}

export interface TagWriteProblem {
  track_id: number | null;
  file_path: string;
  field: string | null;
  message: string;
}

/** A tag write job's answer, from its results. */
export interface TagWriteResult {
  job_id: string;
  preview_id: string;
  total: number;
  completed: number;
  written: number;
  failed: number;
  skipped: Record<string, number>;
  fields: Record<string, number>;
  field_skipped: Record<string, Record<string, number>>;
  failed_fields: number;
  problems: TagWriteProblem[];
  problems_truncated: boolean;
  cancelled: boolean;
  duration_seconds: number;
  summary_line: string;
}

/** A tag restore job's answer, from its results. */
export interface TagRestoreResult {
  job_id: string;
  restored_job_id: string | null;
  track_id: number | null;
  total: number;
  completed: number;
  restored: number;
  already: number;
  skipped: number;
  failed: number;
  files: number;
  problems: TagWriteProblem[];
  problems_truncated: boolean;
  cancelled: boolean;
  duration_seconds: number;
  summary_line: string;
}

/** One row of the record of what a tag write replaced in a file. */
export interface FileWriteRecord {
  id: number;
  job_id: string;
  track_id: number | null;
  file_path: string;
  field: string;
  old_value: unknown;
  /** False when the file was never read, so there is nothing to restore. */
  old_value_read: boolean;
  new_value: unknown;
  outcome: "written" | "skipped" | "failed" | "restored";
  reason: string | null;
  written_at: string;
  /** A write that may not have happened: the engine stopped before confirming it. */
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

/** One Library Health count and the rules that produced it (DEC-075). */
export interface HealthCount {
  id: string;
  label: string;
  count: number;
  rules: FilterRuleSet;
}

/** A scan behind the counts, and when it last ran; null when it never has (CLEAN-12). */
export interface HealthDetection {
  id: string;
  label: string;
  /** The job that runs it again. */
  job_type: string;
  last_run_at: string | null;
  last_summary: string | null;
}

/** A disconnected drive or share, as one finding rather than thousands (DEC-073). */
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

export interface CuePointBridge {
  getEngineStatus: () => Promise<EngineStatus>;
  /** Absent when running in a browser tab, or in an older shell. */
  player?: PlayerBridge;
  restartEngine?: () => Promise<EngineStatus>;
  getJob: (jobId: string) => Promise<JobStatus>;
  getJobResults: (jobId: string) => Promise<JobResultsResponse>;
  getIncrateInventory: (params?: {
    limit?: number;
    search?: string;
    demo?: boolean;
  }) => Promise<IncrateInventoryResponse>;
  importIncrateXml: (body: {
    xml_path: string;
    enrich?: boolean;
  }) => Promise<{ imported: number; enriched: number; errors: string[] }>;
  resetIncrateInventory: () => Promise<{ ok: boolean; stats: { total: number; with_label?: number } }>;
  getIncrateDiscoverOptions: () => Promise<IncrateDiscoverOptions>;
  runIncrateDiscover: (body: {
    demo?: boolean;
    genre_ids?: number[];
    charts_from?: string;
    charts_to?: string;
    new_releases_days?: number;
    artist_names?: string[];
    label_names?: string[];
  }) => Promise<IncrateDiscoverResponse>;
  createIncratePlaylist: (body: {
    name: string;
    tracks: IncrateDiscoverTrack[];
  }) => Promise<IncratePlaylistResponse>;
  /**
   * Ask a running job to stop — any job, not only a match (ORG-13).
   *
   * One store, one cancel, and every job type checks it. Work already applied
   * stays applied and the job says how far it got (DEC-063).
   */
  cancelJob: (jobId: string) => Promise<{ id: string; state: string }>;
  getBeatportTokenStatus: () => Promise<BeatportTokenStatus>;
  setBeatportToken: (token: string) => Promise<BeatportTokenStatus>;
  testBeatportToken: (body?: { token?: string }) => Promise<BeatportTokenTestResult>;
  getRecentActivity?: (params?: {
    limit?: number;
    type?: string;
  }) => Promise<ActivityFeed>;
  listJobs?: (params?: {
    state?: "active" | "all";
    limit?: number;
  }) => Promise<EngineJobList>;
  searchLibrary?: (params: {
    q: string;
    limit?: number;
    offset?: number;
  }) => Promise<LibrarySearchResponse>;
  browseLibrary?: (params: LibraryBrowseParams) => Promise<LibrarySearchResponse>;
  getLibraryPlaylists?: () => Promise<LibraryPlaylistTree>;
  getLibraryFacet?: (params: {
    field: string;
    q?: string;
    playlistId?: number | null;
    filters?: FilterRuleSet | null;
    limit?: number;
    /**
     * CuePoint's own scope (ORG-08, used by ORG-12). A tag list inside a
     * Collection offers the tags that Collection's tracks carry; the library's
     * would offer one that empties the table the moment it is chosen.
     */
    scope?: "collection" | "smart";
    collectionId?: number | null;
  }) => Promise<LibraryFacet>;
  getLibraryFilterFields?: () => Promise<LibraryFilterVocabulary>;
  getLibraryTrack?: (params: { trackId: number }) => Promise<LibraryTrackDetail>;
  /**
   * A track's artwork thumbnail as an object URL, or null when it has none
   * (CLEAN-09). The file's own picture first, then Beatport's for an accepted
   * match. The URL holds the image in memory until `releaseTrackArtwork` is
   * called with it.
   */
  getTrackArtwork?: (params: {
    trackId: number;
    size: ArtworkSize;
  }) => Promise<string | null>;
  releaseTrackArtwork?: (url: string) => void;
  // CuePoint's own organization (ORG-08). Optional like every method added
  // after the bridge existed: the renderer runs in a browser tab too, and an
  // older shell exposes none of these.
  getCollections?: () => Promise<CollectionTree>;
  getCollectionEntries?: (params: {
    collectionId: number;
    limit?: number;
    offset?: number;
  }) => Promise<CollectionEntryPage>;
  createCollection?: (params: {
    kind: "folder" | "collection";
    name: string;
    parent_id?: number | null;
  }) => Promise<{ collection: CollectionNode }>;
  renameCollection?: (params: {
    id: number;
    name: string;
  }) => Promise<{ collection: CollectionNode }>;
  moveCollection?: (params: {
    id: number;
    parent_id?: number | null;
    position?: number | null;
  }) => Promise<{ collection: CollectionNode }>;
  deleteCollection?: (params: { id: number }) => Promise<{ removed: CollectionSubtree }>;
  previewCollectionDelete?: (params: {
    id: number;
  }) => Promise<{ removes: CollectionSubtree }>;
  addTracksToCollection?: (params: {
    collection_id: number;
    track_ids: number[];
  }) => Promise<CollectionAdded>;
  insertTrackInCollection?: (params: {
    collection_id: number;
    track_id: number;
    position: number;
  }) => Promise<{ entry: CollectionEntry }>;
  removeCollectionEntries?: (params: {
    entry_ids: number[];
  }) => Promise<{ removed: number }>;
  reorderCollectionEntry?: (params: {
    entry_id: number;
    position: number;
  }) => Promise<{ entry: CollectionEntry }>;
  saveSmartCollection?: (params: {
    name: string;
    rules: FilterRuleSet;
    parent_id?: number | null;
    sort?: string | null;
    dir?: "asc" | "desc" | null;
  }) => Promise<{ collection: CollectionNode }>;
  updateSmartCollection?: (params: {
    id: number;
    rules: FilterRuleSet;
    sort?: string | null;
    dir?: "asc" | "desc" | null;
  }) => Promise<{ collection: CollectionNode }>;
  duplicateSmartCollection?: (params: {
    id: number;
    name?: string | null;
  }) => Promise<{ collection: CollectionNode }>;
  freezeSmartCollection?: (params: {
    id: number;
    name?: string | null;
  }) => Promise<FrozenCollection>;
  getTags?: () => Promise<TagVocabulary>;
  createTag?: (params: {
    name: string;
    category?: string | null;
    colour?: string | null;
  }) => Promise<{ tag: Tag }>;
  updateTag?: (params: {
    id: number;
    name?: string;
    category?: string | null;
    colour?: string | null;
  }) => Promise<{ tag: Tag }>;
  deleteTag?: (params: { id: number }) => Promise<{ untagged: number }>;
  mergeTags?: (params: {
    source_id: number;
    target_id: number;
  }) => Promise<{ moved: number }>;
  assignTag?: (params: {
    tag_id: number;
    track_ids: number[];
  }) => Promise<{ changed: number; track_ids: number[] }>;
  unassignTag?: (params: {
    tag_id: number;
    track_ids: number[];
  }) => Promise<{ changed: number; track_ids: number[] }>;
  setTrackMetadata?: (params: {
    trackId: number;
    rating?: number | null;
    favorite?: boolean;
    notes?: string | null;
  }) => Promise<{ metadata: TrackMetadata }>;
  getTrackHistory?: (params: {
    trackId: number;
    limit?: number;
  }) => Promise<TrackHistory>;
  applyBatch?: (params: {
    selection: BatchSelection;
    operation: BatchOperation;
  }) => Promise<BatchOutcome>;
  // Clean (CLEAN-11). Optional, like every method added after the bridge
  // existed. What a state, a hand edit or a tag write may be is the engine's.
  startCleanMatch?: (params: {
    selection: BatchSelection;
    rematch?: boolean;
  }) => Promise<MatchStarted>;
  resumeCleanMatch?: (params: { job_id: string }) => Promise<MatchStarted>;
  getResumableMatches?: () => Promise<ResumableMatches>;
  getTrackMatches?: (params: { trackId: number }) => Promise<TrackMatches>;
  getMatchCandidates?: (params: { attemptId: number }) => Promise<AttemptCandidates>;
  getTrackFolder?: (params: { trackId: number }) => Promise<TrackFolder>;
  decideMatch?: (params: {
    decision: "accept" | "reject" | "clear";
    track_id?: number;
    candidate_id?: number;
    selection?: BatchSelection;
  }) => Promise<DecisionOutcome>;
  applyMatch?: (params: {
    fields: OverrideField[];
    track_id?: number;
    selection?: BatchSelection;
  }) => Promise<ApplyOutcome>;
  setTrackOverrides?: (params: {
    trackId: number;
    key?: string | null;
    bpm?: number | null;
    genre?: string | null;
    label?: string | null;
    year?: number | null;
  }) => Promise<{ track: LibraryTrackRow }>;
  revertChange?: (params: { change_id: number }) => Promise<{ revert: FieldRevert }>;
  revertBatch?: (params: { batch_id: string }) => Promise<BatchRevertOutcome>;
  startFileCheck?: (params: { selection: BatchSelection }) => Promise<FileCheckStarted>;
  startDuplicateScan?: (params?: {
    signals?: DuplicateSignal[];
  }) => Promise<DuplicateScanStarted>;
  getDuplicateGroups?: (params?: {
    signal?: DuplicateSignal;
    includeDismissed?: boolean;
    limit?: number;
    offset?: number;
  }) => Promise<DuplicateGroupList>;
  dismissDuplicateGroup?: (params: { group_id: number }) => Promise<{ group: DuplicateGroup }>;
  restoreDuplicateGroup?: (params: { group_id: number }) => Promise<{ group: DuplicateGroup }>;
  startArtworkScan?: (params: {
    selection: BatchSelection;
    fetch_beatport?: boolean;
  }) => Promise<ArtworkScanStarted>;
  previewTagWrite?: (params: {
    selection: BatchSelection;
    options?: TagWriteOptions;
  }) => Promise<TagPreviewOutcome>;
  startTagWrite?: (params: { preview_id: string }) => Promise<TagWriteStarted>;
  startTagRestore?: (params: {
    job_id?: string;
    track_id?: number;
  }) => Promise<TagRestoreStarted>;
  getTagWrites?: (params: {
    jobId?: string;
    trackId?: number;
    limit?: number;
    offset?: number;
  }) => Promise<TagWriteRecord>;
  getLibraryHealth?: () => Promise<LibraryHealth>;
  exportReviewList?: (params: {
    selection: BatchSelection;
    format: ReviewExportFormat;
    file_path: string;
    overwrite?: boolean;
  }) => Promise<ReviewExportResult>;
  startLibraryImport?: (params: {
    xml_path: string;
  }) => Promise<LibraryImportStarted>;
  startLibraryRefreshPreview?: (params?: {
    xml_path?: string;
    /** Read the export even when its recorded state says it cannot have changed. */
    force?: boolean;
  }) => Promise<LibraryRefreshStarted>;
  startLibraryRefreshApply?: (params: {
    diff_id: string;
    confirm_references?: boolean;
  }) => Promise<LibraryRefreshStarted>;
  getLibrarySummary?: () => Promise<LibrarySummary>;
  exportSupportBundle?: (options?: {
    include_logs?: boolean;
    include_config?: boolean;
    sanitize?: boolean;
  }) => Promise<SupportBundleExportResult>;
  showItemInFolder?: (filePath: string) => Promise<void>;
  getLogsDir?: () => Promise<LogsDirResponse>;
  getCuepointLog?: (options?: {
    level?: string;
    search?: string;
    tailLines?: number;
    maxBytes?: number;
    sanitize?: boolean;
  }) => Promise<CuepointLogResponse>;
  clearCuepointLogs?: () => Promise<ClearOkResponse>;
  clearCuepointCache?: () => Promise<ClearOkResponse>;
  setPrivacyExitPrefs?: (prefs: PrivacyExitPrefs) => Promise<{ ok: boolean }>;
  subscribeJobEvents: (
    jobId: string,
    onEvent: (event: JobStatus) => void,
  ) => () => void;
  openXmlFileDialog: () => Promise<OpenXmlDialogResult>;
  resolveDroppedFilePath?: (file: File) => string | null;
  saveExportFileDialog: (options: {
    defaultPath?: string;
    format: ExportFormat;
  }) => Promise<SaveExportDialogResult>;
}

declare global {
  interface Window {
    cuepoint?: CuePointBridge;
  }
}

/**
 * True inside the desktop app. Asked of `getJob`, which every build of the
 * bridge has; it used to be asked of the file-based match job, which retired
 * with inKey (DEC-071).
 */
export function hasEngineBridge(): boolean {
  return typeof window.cuepoint?.getJob === "function";
}

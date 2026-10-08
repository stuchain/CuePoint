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
  /** Why it could not be played, in plain words, while `status` is "failed" (BAR-9). */
  failure?: string;
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
  /**
   * True while the engine has been started but has not answered yet.
   *
   * Distinct from `connected: false` on its own, which means the engine is not
   * there: this one resolves by waiting. A packaged macOS engine needs about
   * ten seconds on a cold start.
   */
  starting?: boolean;
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
  result?: RefreshDiff | RefreshApplied | TagWritePreview | TagWriteResult | TagRestoreResult | RekordboxExportResult | DiscoveryRunResult | BeatportPlaylistResult | BeatportResolveResult | Record<string, unknown>;
}

/** The file type the save dialog filters on; Clean's export names Excel `xlsx` here. */
export type ExportFormat = "csv" | "json" | "xlsx";

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

/** Which build this is, as Electron main reports it (REPORT-07). */
export interface AppBuildInfo {
  /** The app's version, the same as the engine's. */
  version: string;
  /** `cuepoint@<version>`: the release name every report carries. */
  release: string;
  /** The short commit the build was made from, or null for a build that recorded none. */
  dist: string | null;
  environment: "production" | "development";
}

export interface MenuSizeState {
  /** The sizes View → Size offers, in order, each with its words (`scaleOptionLabel`). */
  options: ReadonlyArray<{ value: number; label: string }>;
  /** The size in use now, one of `options`. */
  current: number;
}

/**
 * Whether error reports may be sent (REPORT-01, DEC-128). Stored by Electron
 * main, which tells the engine; on from the first launch.
 */
export interface ErrorReportingState {
  enabled: boolean;
  /**
   * Whether Electron main has set error reporting up (REPORT-06): with no
   * address to send to, the page's reporter does not start. Absent from an
   * older main, which reads as not set up.
   */
  configured?: boolean;
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
  /** Why a failed test failed: Beatport said no, or it could not be asked. */
  reason?: "missing" | "rejected" | "unreachable";
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
  /**
   * Whose key `effective_key` is (PAGES-15, DEC-201): `yours` for a correction,
   * `beatport` for the accepted match's, null when the track has none. `key_name`
   * is its name ("A minor"). `key` above stays Rekordbox's, and is not used.
   */
  key_source?: "yours" | "beatport" | null;
  key_name?: string | null;
  /** FLW-5: what a search matched this row on besides its words; null for its words. */
  matched_on?: "key" | "bpm" | null;
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
  /**
   * All nine kinds, each with a control in the bar since ORG-12. `name`
   * (DISCOVER-03) is an artist or a label compared by identity: typed as text,
   * and the engine folds case, accents and punctuation before it compares.
   * `beatport` (DISCOVER-07) is an artist or a label by its Beatport id, the
   * rule an Artist or Label page hands the Library once resolution knows it.
   */
  type: "text" | "number" | "date" | "bool" | "tag" | "collection" | "name" | "beatport" | "source";
  label: string;
  /**
   * The group the Field list shows this under (LIB-7), sent by the engine so
   * the bar keeps no copy of the grouping. Optional because vocabularies
   * recorded before it describe valid fields; the engine always sends it.
   * `source` (FLW-7) is "In playlist": a list of `{kind, id}` playlists,
   * Collections and Sets.
   */
  group?: string;
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

/** A track's beat grid, summed up; the markers travel with its waveform. */
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

/** A track and where it sits in the collection — the Inspector (DEC-047). */
export interface LibraryTrackDetail {
  track: LibraryTrackRow;
  playlists: LibraryPlaylistNode[];
  playlist_count: number;
  /** CuePoint's own layer, notes included (ORG-08, DEC-057). */
  metadata: TrackMetadata;
  tags: Array<Pick<Tag, "id" | "name" | "category" | "colour">>;
  collections: Array<Pick<CollectionNode, "id" | "name" | "kind">>;
  /**
   * Its artists and label as links to their pages (DISCOVER-11). Absent
   * from an engine older than the pages, which the Inspector draws as text.
   */
  credits?: TrackCreditLinks;
  /**
   * Its cue points and beat grid, read-only from Rekordbox (WAVE-04). Absent
   * from an engine older than them, which the Inspector shows as nothing.
   */
  marks?: TrackMarksSummary;
}

/**
 * CuePoint's own organization (ORG-08).
 *
 * Mirrors `organization_api.py`'s explicit field lists, and `engineClient.ts`'s
 * copy of them. Two declarations of one shape, one in each process, because
 * neither can import the other's — the desktop contract test compares them.
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

/** What a subtree delete would take, or did — ORG-09's confirmation. */
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
  /**
   * Sets as their own kind (PREP-02): how many of the tracks a Set holds, and
   * which Sets, beside `set_count`. The Collection counts never include a Set.
   */
  set_track_count: number;
  set_ids: number[];
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
    /**
     * Kept tracks whose cue points or beat grid differ (WAVE-04). One count,
     * shown as one line: marks are read-only copies of Rekordbox's, not
     * something a user would refuse (DEC-118). A diff of only these is still
     * one to apply.
     */
    marks_changed: number;
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
  /** Cue points and grid markers written, and unreadable marks skipped (WAVE-04). */
  marks: MarksWritten;
  duration_seconds: number;
  summary_line: string;
}

/** What an import or refresh wrote of the tracks' marks (WAVE-04). */
export interface MarksWritten {
  cues: number;
  markers: number;
  /** Marks CuePoint does not know or cannot read: counted, never stored. */
  skipped: number;
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
  /** Entries with no key (DEC-201): they get no key check, and no warning. */
  without_key: number;
  files: SetFileCheck;
  transitions: { from_entry_id: number; to_entry_id: number; warnings: SetWarning[] }[];
  entries: { entry_id: number; warnings: SetWarning[]; notices: SetNotice[] }[];
  chapters: { chapter_id: number; running_time: SetRunningTime; warnings: SetWarning[] }[];
  /** The values the checks read, for the tempo and key lanes (PREP-11). */
  shape: SetShape;
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

/**
 * A Set's methods (PREP-08), on `window.cuepoint.sets`. Each answers its value
 * or the refusal standing in for it. Adding and removing entries stays on the
 * Collection methods (PREP-02).
 */
/**
 * The waveform analysis (WAVE-03).
 *
 * Mirrors `waveforms_api.py` and `AnalysisStatus.to_dict`, and
 * `engineClient.ts`'s copy of both; `desktopContract.test.ts` holds the three
 * together. WAVE-05 adds the waveforms themselves.
 */
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

/** `window.cuepoint.waveforms`: every method answers `{ value, refusal }`. */
export interface WaveformsBridge {
  /** The analysis as a whole: its state, counts and rate. */
  analysis: () => Promise<WaveformAnswer<WaveformAnalysisStatus>>;
  /** Pause, persisted across a restart, and stop a running run. */
  pause: () => Promise<WaveformAnswer<WaveformAnalysisStatus>>;
  /** Clear the pause and start a run. */
  resume: () => Promise<WaveformAnswer<WaveformAnalysisStatus>>;
  /**
   * At most 200 tracks' states, loudness and pictures at a width of 16–1,200;
   * with `marks`, their cues and grid; with `data: false`, no pictures.
   */
  get: (params: WaveformsQuery) => Promise<WaveformAnswer<WaveformBatch>>;
  /** Analyse these tracks first, at most 50, even while paused. */
  request: (params: { track_ids: number[] }) => Promise<WaveformAnswer<WaveformsRequested>>;
  /** Empty the waveform data; the analysis starts again unless paused. */
  deleteData: () => Promise<WaveformAnswer<WaveformDataDeletion>>;
}

export interface SetsBridge {
  plan: (params: { set_id: number }) => Promise<SetAnswer<SetPlan>>;
  entries: (params: { set_id: number }) => Promise<SetAnswer<SetEntries>>;
  analysis: (params: { set_id: number }) => Promise<SetAnswer<SetAnalysis>>;
  suggestions: (params: SetSuggestionsRequest) => Promise<SetAnswer<SetSuggestions>>;
  setListText: (params: { set_id: number }) => Promise<SetAnswer<SetListText>>;
  create: (params: { name: string; parent_id?: number | null }) => Promise<SetAnswer<SetCreated>>;
  createFrom: (params: { source: SetSource; name?: string | null; parent_id?: number | null }) => Promise<SetAnswer<SetCreatedFrom>>;
  duplicate: (params: { set_id: number; name?: string | null }) => Promise<SetAnswer<SetCreated>>;
  setNotes: (params: { set_id: number; notes: string | null }) => Promise<SetAnswer<SetNotesChanged>>;
  createChapter: (params: {
    set_id: number;
    name?: string;
    position?: number | null;
    after_chapter_id?: number | null;
  }) => Promise<SetAnswer<SetChapterChanged>>;
  updateChapter: (params: SetChapterUpdate) => Promise<SetAnswer<SetChapterChanged>>;
  moveChapter: (params: { chapter_id: number; position: number }) => Promise<SetAnswer<SetChapterChanged>>;
  deleteChapter: (params: { chapter_id: number }) => Promise<SetAnswer<SetChapterDeleted>>;
  splitChapter: (params: { entry_id: number; name?: string }) => Promise<SetAnswer<SetChapterChanged>>;
  moveEntry: (params: { entry_id: number; position: number; chapter_id?: number | null }) => Promise<SetAnswer<SetEntryMoved>>;
  setEntryTimes: (params: { entry_id: number; in_time: string | null; out_time: string | null }) => Promise<SetAnswer<SetEntryPlanChanged>>;
  setEntryNote: (params: { entry_id: number; note: string | null }) => Promise<SetAnswer<SetEntryPlanChanged>>;
  acknowledge: (params: SetTransitionWarningRef) => Promise<SetAnswer<SetAcknowledged>>;
  unacknowledge: (params: SetTransitionWarningRef) => Promise<SetAnswer<SetUnacknowledged>>;
  saveSetList: (params: { set_id: number; destination_path: string }) => Promise<SetAnswer<SetListSave>>;
  /** Where to save a set list: the dialog only chooses, the engine judges. */
  chooseSetListDestination: (request: SetListDialogRequest) => Promise<SetListDestinationChoice>;
}

/**
 * What an engine error says about itself (REPORT-04, DEC-126): the HTTP status
 * (below 500 is a refusal), the code, and the engine's own report of a 500.
 * Each is null when the error did not come from the engine, or had none.
 */
export interface BridgeErrorFields {
  status: number | null;
  code: string | null;
  reportId: string | null;
}

/**
 * A rejection from the bridge, as the preload builds it. `message` is the
 * engine's words, as it always was. The fields are properties on the preload's
 * side; `contextBridge` rebuilds an Error from its message alone, so a page
 * reads them through `bridgeErrorFields` (`./bridgeError.ts`).
 */
export interface BridgeError extends Error, BridgeErrorFields {}

export interface CuePointBridge {
  /**
   * The fields of an engine error the page caught, found by its message (REPORT-04).
   * Null for any other error. Prefer `bridgeErrorFields`, which asks this only when the
   * error itself has none. Absent in a browser tab, or in an older shell.
   */
  engineErrorFields?: (message: string) => BridgeErrorFields | null;
  getEngineStatus: () => Promise<EngineStatus>;
  /** Absent when running in a browser tab, or in an older shell. */
  player?: PlayerBridge;
  /** A Set's reads and edits (PREP-08). Absent in a browser tab, or in an older shell. */
  sets?: SetsBridge;
  /** The waveform analysis (WAVE-03). Absent in a browser tab, or in an older shell. */
  waveforms?: WaveformsBridge;
  restartEngine?: () => Promise<EngineStatus>;
  getJob: (jobId: string) => Promise<JobStatus>;
  getJobResults: (jobId: string) => Promise<JobResultsResponse>;
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
  /** The Key, BPM and Genre quick filters for a view (FLW-4). */
  getLibraryQuickFacets?: (params: {
    q?: string;
    playlistId?: number | null;
    filters?: FilterRuleSet | null;
    scope?: "collection" | "smart";
    collectionId?: number | null;
  }) => Promise<LibraryQuickFacets>;
  /** The keys that mix with a key, by the engine's rule (PAGES-10). */
  getCompatibleKeys?: (params: { key: string }) => Promise<CompatibleKeys>;
  /** The keys of chosen sources, counted once per track (PAGES-16). */
  getKeysPopulation?: (params: { sources: KeySource[] }) => Promise<KeysPopulation>;
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
    /** In a Set, the chapter for a place on a boundary (PREP-08). */
    chapter_id?: number | null;
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
  /** What a Rekordbox export would write; a refusal is an answer, not a throw. */
  previewRekordboxExport?: (params: {
    collection_ids?: number[] | null;
    key_format?: RekordboxKeyFormat | null;
  }) => Promise<RekordboxExportPreviewAnswer>;
  /** Start one, to a file `chooseRekordboxExportDestination` returned. */
  startRekordboxExport?: (params: {
    collection_ids?: number[] | null;
    key_format?: RekordboxKeyFormat | null;
    destination_path: string;
  }) => Promise<RekordboxExportStartAnswer>;
  getRekordboxExportHistory?: (params?: { limit?: number }) => Promise<RekordboxExportHistory>;
  /**
   * The native save dialog for a Rekordbox export, starting in the folder the
   * last export went to. `currentPath` reopens it where a previous choice was.
   */
  chooseRekordboxExportDestination?: (request?: {
    currentPath?: string | null;
  }) => Promise<RekordboxExportDestinationChoice>;
  // Discover (DISCOVER-09). Every answer is a DiscoverAnswer: a refusal a
  // person can act on arrives as a value with its code and Beatport class.
  /** What a new run starts from; whether a token is set and Beatport took it. */
  getDiscoverOptions?: () => Promise<DiscoverAnswer<DiscoverOptions>>;
  listDiscoveryRuns?: (params?: {
    limit?: number;
    offset?: number;
  }) => Promise<DiscoverAnswer<DiscoverRunList>>;
  getDiscoveryRun?: (params: { run_id: number }) => Promise<DiscoverAnswer<DiscoverRunHeader>>;
  getDiscoveryRunTracks?: (params: {
    run_id: number;
    owned?: DiscoverOwnedFilter;
    sort?: DiscoverRunSort;
    dir?: DiscoverSortDirection;
    offset?: number;
    limit?: number;
  }) => Promise<DiscoverAnswer<DiscoverRunTracksPage>>;
  /** Start a discovery run; a refusal is an answer, and nothing starts. */
  startDiscoveryRun?: (
    params?: DiscoverRunRequest,
  ) => Promise<DiscoverAnswer<DiscoverJobStarted>>;
  deleteDiscoveryRun?: (params: {
    run_id: number;
  }) => Promise<DiscoverAnswer<DiscoverRunDeleted>>;
  getWantlist?: (params?: {
    owned?: DiscoverOwnedFilter;
    bought?: DiscoverOwnedFilter;
    sort?: WantlistSort;
    dir?: DiscoverSortDirection;
    offset?: number;
    limit?: number;
  }) => Promise<DiscoverAnswer<WantlistPage>>;
  addToWantlist?: (params: {
    track_ids: number[];
    run_id?: number | null;
  }) => Promise<DiscoverAnswer<WantlistChange>>;
  removeFromWantlist?: (params: {
    track_ids: number[];
  }) => Promise<DiscoverAnswer<WantlistChange>>;
  /** Set a note; null or blank text clears it. */
  setWantlistNote?: (params: {
    track_id: number;
    note: string | null;
  }) => Promise<DiscoverAnswer<WantlistChange>>;
  setWantlistBought?: (params: {
    track_ids: number[];
    bought: boolean;
  }) => Promise<DiscoverAnswer<WantlistChange>>;
  /** Push to a new Beatport playlist, by ids or by a run's table. */
  startBeatportPlaylistPush?: (
    params: BeatportPlaylistRequest,
  ) => Promise<DiscoverAnswer<DiscoverJobStarted>>;
  /** Resolve the library's accepted matches on Beatport, only when asked. */
  startBeatportResolve?: () => Promise<DiscoverAnswer<DiscoverJobStarted>>;
  getEntityPage?: (params: {
    kind: EntityKind;
    ref: string;
  }) => Promise<DiscoverAnswer<EntityPage>>;
  getEntityBeatport?: (params: {
    kind: EntityKind;
    ref: string;
    refresh?: boolean;
    owned?: DiscoverOwnedFilter;
    offset?: number;
    limit?: number;
  }) => Promise<DiscoverAnswer<EntityBeatportHalf>>;
  /** A seed's suggestions; read their rows through getLibraryTrack. */
  getSimilarTracks?: (params: SimilarTracksRequest) => Promise<DiscoverAnswer<SimilarTracks>>;
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
  /**
   * Open a Beatport page in the system browser (DISCOVER-10). Only an https
   * page on beatport.com opens; anything else answers false, unopened.
   */
  openBeatportPage?: (url: string) => Promise<boolean>;
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
  /** Which build this is (REPORT-07): shown in About. Absent from an older main. */
  buildInfo?: () => Promise<AppBuildInfo>;
  errorReporting?: {
    get: () => Promise<ErrorReportingState>;
    set: (enabled: boolean) => Promise<ErrorReportingState>;
  };
  /**
   * The one menu bar, which main builds (FLW-20, DEC-204). The renderer tells main the sizes and
   * the current one whenever the size changes, and main sends back the id of each command the
   * user picks, which `api/menuCommands.ts` lists. Absent in a browser tab and from an older main.
   */
  menu?: {
    setSizeState: (state: MenuSizeState) => Promise<void>;
    /** Listen for the menu's commands; returns the function that stops listening. */
    onCommand: (listener: (id: string) => void) => () => void;
  };
  /** End-to-end runs only: `enabled()` answers true, and the page may be made to throw (REPORT-06). */
  testHooks?: {
    enabled: () => Promise<boolean>;
  };
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

import type { ProgressInfo, TrackResult } from "../mocks/types";

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

export interface MatchJobStatus {
  id: string;
  state: JobState;
  progress?: Partial<ProgressInfo>;
  error?: { code: string; message: string };
  demo?: boolean;
}

export interface StartMatchJobRequest {
  demo?: boolean;
  demo_batch?: boolean;
  xml_path?: string;
  m3u_path?: string;
  playlist_name?: string;
  playlist_names?: string[];
}

export interface XmlPlaylistEntry {
  path: string;
  name: string;
  display_name: string;
  track_count: number;
}

export interface XmlPlaylistsResponse {
  xml_path: string;
  playlists: XmlPlaylistEntry[];
  count: number;
  tree?: unknown[];
  playlist_paths?: string[];
}

export interface StartMatchJobResponse {
  id: string;
  state: string;
}

export interface JobResultsResponse {
  id: string;
  state: JobState;
  results: TrackResult[];
  batch_results?: Record<string, TrackResult[]>;
  /**
   * What a job produced when its answer is not a list of matched tracks — a
   * refresh preview's diff, or what an apply did. Served here rather than on
   * the status payload, which is polled for every job.
   */
  result?: RefreshDiff | RefreshApplied | Record<string, unknown>;
}

export type ExportFormat = "csv" | "json" | "xlsx";

export interface ExportResultsRequest {
  format: ExportFormat;
  file_path: string;
  job_id?: string;
  results?: TrackResult[];
  playlist_name?: string;
  overwrite?: boolean;
}

export interface ExportResultsResponse {
  file_path: string;
  format: string;
  count: number;
}

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

export type OpenCsvDialogResult = OpenXmlDialogResult;

export type OpenM3uDialogResult = OpenXmlDialogResult;

export interface HistoryFileEntry {
  file_path: string;
  file_name: string;
  modified_at: string;
  size_bytes: number;
  playlist_name?: string | null;
}

export interface HistoryRecentResponse {
  directory: string;
  files: HistoryFileEntry[];
  count: number;
}

export interface HistoryLoadResponse {
  file_path: string;
  file_name: string;
  modified_at: string;
  row_count: number;
  matched_count: number;
  unmatched_count: number;
  review_count?: number;
  results: TrackResult[];
  meta?: {
    playlist_name?: string;
    xml_path?: string;
    m3u_path?: string;
    source?: string;
  } | null;
  related_files?: {
    review_csv?: string | null;
    review_candidates_csv?: string | null;
    review_queries_csv?: string | null;
    candidates_csv?: string | null;
  };
  rerun?: {
    source?: string;
    xml_path?: string | null;
    playlist_name?: string | null;
    m3u_path?: string | null;
    xml_exists?: boolean;
    m3u_exists?: boolean;
    can_rerun?: boolean;
  };
}

export interface SyncTagsResponse {
  written: number;
  failed: number;
  errors: string[];
  errors_truncated?: boolean;
  wav_skipped: string[];
  wav_skipped_count?: number;
}

export type SyncKeyFormat = "normal" | "camelot" | "short";

/**
 * Tag-writing options. Part of the bridge contract because they travel to the
 * engine inside `SyncTagsRequest`; `syncTagsUtils` owns loading and persisting
 * them and re-exports this type for the UI.
 */
export interface SyncTagsOptions {
  key_format: SyncKeyFormat;
  write_key: boolean;
  write_year: boolean;
  write_bpm: boolean;
  write_label: boolean;
  write_genre: boolean;
  write_comment: boolean;
  comment_text: string;
}

export interface SyncTagsRequest {
  sync_options: SyncTagsOptions;
  source?: "collection" | "playlist_file";
  mode?: "single" | "batch" | "paths";
  xml_path?: string;
  playlist_name?: string;
  results?: TrackResult[];
  batch_results?: Record<string, TrackResult[]>;
}

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

export interface InKeyRerunRequest {
  xmlPath?: string;
  playlistName?: string;
  m3uPath?: string;
  source?: string;
  autoStart?: boolean;
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
  album: string | null;
  label: string | null;
  genre: string | null;
  key: string | null;
  bpm: number | null;
  year: number | null;
  duration_seconds: number | null;
  file_path: string;
}

export interface LibrarySearchResponse {
  query: string;
  total: number;
  limit: number;
  offset: number;
  tracks: LibraryTrackRow[];
  /** True when nothing has been imported yet — a different problem from "no
   *  matches", and one the UI has to answer differently. */
  library_empty: boolean;
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

/** How many Collections or Sets hold the tracks a refresh would delete. */
export interface RefreshReferences {
  collection_count: number;
  set_count: number;
  referenced_track_count: number;
  referenced_track_ids: number[];
  has_references: boolean;
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

export interface CuePointBridge {
  getEngineStatus: () => Promise<EngineStatus>;
  restartEngine?: () => Promise<EngineStatus>;
  startMatchJob: (body: StartMatchJobRequest) => Promise<StartMatchJobResponse>;
  getJob: (jobId: string) => Promise<MatchJobStatus>;
  getJobResults: (jobId: string) => Promise<JobResultsResponse>;
  exportResults: (body: ExportResultsRequest) => Promise<ExportResultsResponse>;
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
  cancelMatchJob: (jobId: string) => Promise<{ id: string; state: string }>;
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
  startLibraryImport?: (params: {
    xml_path: string;
  }) => Promise<LibraryImportStarted>;
  startLibraryRefreshPreview?: (params?: {
    xml_path?: string;
  }) => Promise<LibraryRefreshStarted>;
  startLibraryRefreshApply?: (params: {
    diff_id: string;
    confirm_references?: boolean;
  }) => Promise<LibraryRefreshStarted>;
  getLibrarySummary?: () => Promise<LibrarySummary>;
  getHistoryRecent: (params?: { limit?: number }) => Promise<HistoryRecentResponse>;
  loadHistoryCsv: (csvPath: string) => Promise<HistoryLoadResponse>;
  getXmlPlaylists: (xmlPath: string) => Promise<XmlPlaylistsResponse>;
  syncTags: (body: SyncTagsRequest) => Promise<SyncTagsResponse>;
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
    onEvent: (event: MatchJobStatus & { type?: string }) => void,
  ) => () => void;
  openXmlFileDialog: () => Promise<OpenXmlDialogResult>;
  openCsvFileDialog: () => Promise<OpenCsvDialogResult>;
  openM3uFileDialog: () => Promise<OpenM3uDialogResult>;
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

export function hasEngineBridge(): boolean {
  return typeof window.cuepoint?.startMatchJob === "function";
}

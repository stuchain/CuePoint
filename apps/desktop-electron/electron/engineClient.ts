/** Authenticated HTTP client for the loopback engine (main process only). */

import { collectSseUntilTerminal } from "./sseClient.js";

export interface EngineApiError {
  code: string;
  message: string;
}

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
  type: "text" | "number" | "date";
  label: string;
  facetable: boolean;
  integer: boolean;
  operators: string[];
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
   * The rule set the response was computed for, echoed like the rest — a
   * filter changes neither scope, sort nor text, so without it two requests
   * produce responses nothing can tell apart (LIBUI-05).
   */
  filters?: FilterRuleSet | null;
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

  async startMatchJob(body: {
    demo?: boolean;
    demo_batch?: boolean;
    xml_path?: string;
    playlist_name?: string;
    playlist_names?: string[];
  }): Promise<{ id: string; state: string }> {
    const res = await fetch(this.url("/api/v1/jobs/match"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return readJson(res);
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
  }): Promise<LibraryFacet> {
    const query = new URLSearchParams({ field: params.field });
    if (params.q) query.set("q", params.q);
    if (params.playlistId != null) query.set("playlist_id", String(params.playlistId));
    if (params.filters && params.filters.rules.length > 0) {
      query.set("filters", JSON.stringify(params.filters));
    }
    if (params.limit != null) query.set("limit", String(params.limit));
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

  /** What the library holds and where it came from (DEC-035). */
  async getLibrarySummary(): Promise<LibrarySummary> {
    const res = await fetch(this.url("/api/v1/library/summary"), {
      headers: this.headers(),
    });
    return readJson(res);
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
    results: Record<string, unknown>[];
  }> {
    const res = await fetch(this.url(`/api/v1/jobs/${jobId}/results`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async exportResults(body: {
    format: "csv" | "json" | "excel" | "xlsx";
    file_path: string;
    job_id?: string;
    results?: Record<string, unknown>[];
    playlist_name?: string;
    overwrite?: boolean;
  }): Promise<{ file_path: string; format: string; count: number }> {
    const payload = {
      ...body,
      format: body.format === "xlsx" ? "excel" : body.format,
    };
    const res = await fetch(this.url("/api/v1/export"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
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

  async cancelMatchJob(jobId: string): Promise<{ id: string; state: string }> {
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

  async getHistoryRecent(params?: { limit?: number }): Promise<{
    directory: string;
    files: Array<{
      file_path: string;
      file_name: string;
      modified_at: string;
      size_bytes: number;
      playlist_name?: string | null;
    }>;
    count: number;
  }> {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const res = await fetch(this.url(`/api/v1/history/recent${suffix}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async loadHistoryCsv(csvPath: string): Promise<Record<string, unknown>> {
    const query = new URLSearchParams({ path: csvPath });
    const res = await fetch(this.url(`/api/v1/history/load?${query.toString()}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async getXmlPlaylists(xmlPath: string): Promise<{
    xml_path: string;
    playlists: Array<{
      path: string;
      name: string;
      display_name: string;
      track_count: number;
    }>;
    count: number;
  }> {
    const query = new URLSearchParams({ path: xmlPath });
    const res = await fetch(this.url(`/api/v1/xml/playlists?${query.toString()}`), {
      headers: this.headers(),
    });
    return readJson(res);
  }

  async syncTags(body: Record<string, unknown>): Promise<{
    written: number;
    failed: number;
    errors: string[];
    errors_truncated?: boolean;
    wav_skipped: string[];
    wav_skipped_count?: number;
  }> {
    const res = await fetch(this.url("/api/v1/tags/sync"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
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

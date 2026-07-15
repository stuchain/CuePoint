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

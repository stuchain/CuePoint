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
  ) {}

  private url(path: string): string {
    return `http://127.0.0.1:${this.port}${path}`;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  async startMatchJob(body: {
    demo?: boolean;
    xml_path?: string;
    playlist_name?: string;
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

  async cancelMatchJob(jobId: string): Promise<{ id: string; state: string }> {
    const res = await fetch(this.url(`/api/v1/jobs/${jobId}/cancel`), {
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

import type {
  SyncKeyFormat,
  SyncTagsOptions,
  SyncTagsRequest,
  SyncTagsResponse,
} from "./cuepointBridge.types";
import type { TrackResult } from "../mocks/types";

// The sync contract lives with the rest of the bridge types; this module owns
// the behaviour around it. `SyncTagsResponse` used to be declared here as well
// as there, two identical copies free to drift apart. Re-exported so the UI can
// keep importing these from the module it already uses.
export type { SyncKeyFormat, SyncTagsOptions, SyncTagsRequest, SyncTagsResponse };

export interface MatchMeta {
  source: "collection" | "playlist_file";
  xmlPath?: string;
  m3uPath?: string;
  playlistName?: string;
}

const STORAGE_KEY = "cuepoint-sync-with-rekordbox";

const DEFAULT_OPTIONS: SyncTagsOptions = {
  key_format: "normal",
  write_key: true,
  write_year: true,
  write_bpm: false,
  write_label: true,
  write_genre: false,
  write_comment: true,
  comment_text: "ok",
};

function normalizeKeyFormat(value: unknown): SyncKeyFormat {
  const raw = String(value ?? "normal")
    .trim()
    .toLowerCase();
  if (raw === "camelot" || raw === "short") return raw;
  return "normal";
}

export function loadSyncOptions(): SyncTagsOptions {
  if (typeof localStorage === "undefined") return { ...DEFAULT_OPTIONS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<SyncTagsOptions>;
    return {
      key_format: normalizeKeyFormat(parsed.key_format),
      write_key: parsed.write_key ?? DEFAULT_OPTIONS.write_key,
      write_year: parsed.write_year ?? DEFAULT_OPTIONS.write_year,
      write_bpm: parsed.write_bpm ?? DEFAULT_OPTIONS.write_bpm,
      write_label: parsed.write_label ?? DEFAULT_OPTIONS.write_label,
      write_genre: parsed.write_genre ?? DEFAULT_OPTIONS.write_genre,
      write_comment: parsed.write_comment ?? DEFAULT_OPTIONS.write_comment,
      comment_text: (parsed.comment_text ?? DEFAULT_OPTIONS.comment_text).trim() || "ok",
    };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveSyncOptions(options: SyncTagsOptions): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
}

export function defaultWriteChecked(row: { matched?: boolean; error?: string | null }): boolean {
  if (row.error === "FILE_NOT_FOUND") return false;
  return Boolean(row.matched);
}

export function withDefaultWriteFlags<T extends { matched?: boolean; error?: string | null; write?: boolean }>(
  rows: T[],
): T[] {
  return rows.map((row) => ({
    ...row,
    write: row.write ?? defaultWriteChecked(row),
  }));
}

export function selectedWriteRows(rows: { write?: boolean }[]): boolean {
  return rows.some((row) => row.write);
}

export function filterWriteRows<T extends { write?: boolean }>(rows: T[]): T[] {
  return rows.filter((row) => row.write);
}

export function usesPathBasedSync<Row extends { file_path?: string | null }>(
  rows: Row[],
): boolean {
  return rows.some((row) => Boolean(row.file_path?.trim()));
}

/**
 * Build the engine request for a tag sync.
 *
 * Rows were typed `Record<string, unknown>[]` here, which could not accept the
 * `TrackResult[]` every caller actually passes: an interface has no implicit
 * index signature, so the assignment never type-checked. The request type the
 * bridge already declares is the honest one.
 */
export function buildSyncRequest(params: {
  options: SyncTagsOptions;
  meta: MatchMeta;
  mode: "single" | "batch";
  results?: TrackResult[];
  batchResults?: Record<string, TrackResult[]>;
  playlistName?: string;
}): SyncTagsRequest {
  const { options, meta, mode } = params;
  const singleRows = params.results ?? [];

  if (meta.source === "playlist_file" || usesPathBasedSync(singleRows)) {
    return {
      sync_options: options,
      source: "playlist_file",
      mode: "paths",
      results: singleRows,
    };
  }

  if (!meta.xmlPath?.trim()) {
    throw new Error("Select a Rekordbox XML file for collection sync.");
  }
  const xmlPath = meta.xmlPath.trim();

  if (mode === "batch" && params.batchResults) {
    return {
      sync_options: options,
      source: "collection",
      mode: "batch",
      xml_path: xmlPath,
      batch_results: params.batchResults,
    };
  }

  return {
    sync_options: options,
    source: "collection",
    mode: "single",
    xml_path: xmlPath,
    playlist_name: params.playlistName ?? meta.playlistName ?? "Playlist",
    results: singleRows,
  };
}

export function syncSummaryMessage(response: SyncTagsResponse): string {
  if (response.written === 0 && response.failed === 0) {
    return "No matched tracks to write.";
  }
  return `${response.written} written, ${response.failed} failed. Reload tags in Rekordbox after sync.`;
}

export type SyncKeyFormat = "normal" | "camelot" | "short";

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

export interface SyncTagsResponse {
  written: number;
  failed: number;
  errors: string[];
  errors_truncated?: boolean;
  wav_skipped: string[];
  wav_skipped_count?: number;
}

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

export function usesPathBasedSync(rows: { file_path?: string | null }[]): boolean {
  return rows.some((row) => Boolean(row.file_path?.trim()));
}

export function buildSyncRequest(params: {
  options: SyncTagsOptions;
  meta: MatchMeta;
  mode: "single" | "batch";
  results?: Record<string, unknown>[];
  batchResults?: Record<string, Record<string, unknown>[]>;
  playlistName?: string;
}): Record<string, unknown> {
  const { options, meta, mode } = params;
  const payload: Record<string, unknown> = { sync_options: options };

  const singleRows = params.results ?? [];
  const pathBased =
    meta.source === "playlist_file" || usesPathBasedSync(singleRows as { file_path?: string }[]);

  if (pathBased) {
    payload.source = "playlist_file";
    payload.mode = "paths";
    payload.results = singleRows;
    return payload;
  }

  payload.source = "collection";
  if (!meta.xmlPath?.trim()) {
    throw new Error("Select a Rekordbox XML file for collection sync.");
  }
  payload.xml_path = meta.xmlPath.trim();

  if (mode === "batch" && params.batchResults) {
    payload.mode = "batch";
    payload.batch_results = params.batchResults;
    return payload;
  }

  payload.mode = "single";
  payload.playlist_name = params.playlistName ?? meta.playlistName ?? "Playlist";
  payload.results = singleRows;
  return payload;
}

export function syncSummaryMessage(response: SyncTagsResponse): string {
  if (response.written === 0 && response.failed === 0) {
    return "No matched tracks to write.";
  }
  return `${response.written} written, ${response.failed} failed. Reload tags in Rekordbox after sync.`;
}

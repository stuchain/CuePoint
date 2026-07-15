import type { ProgressInfo, TrackResult } from "../mocks/types";

export interface EngineStatus {
  connected: boolean;
  version?: string;
  error?: string;
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
  xml_path?: string;
  playlist_name?: string;
}

export interface StartMatchJobResponse {
  id: string;
  state: string;
}

export interface JobResultsResponse {
  id: string;
  state: JobState;
  results: TrackResult[];
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

export type OpenXmlDialogResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

export type SaveExportDialogResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

export interface CuePointBridge {
  getEngineStatus: () => Promise<EngineStatus>;
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
  cancelMatchJob: (jobId: string) => Promise<{ id: string; state: string }>;
  subscribeJobEvents: (
    jobId: string,
    onEvent: (event: MatchJobStatus & { type?: string }) => void,
  ) => () => void;
  openXmlFileDialog: () => Promise<OpenXmlDialogResult>;
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

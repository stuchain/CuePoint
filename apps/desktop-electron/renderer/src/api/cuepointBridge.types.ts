import type { ProgressInfo, TrackResult } from "../mocks/types";

export interface EngineStatus {
  connected: boolean;
  version?: string;
  error?: string;
}

export type JobState = "queued" | "running" | "succeeded" | "failed";

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

export type OpenXmlDialogResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

export interface CuePointBridge {
  getEngineStatus: () => Promise<EngineStatus>;
  startMatchJob: (body: StartMatchJobRequest) => Promise<StartMatchJobResponse>;
  getJob: (jobId: string) => Promise<MatchJobStatus>;
  getJobResults: (jobId: string) => Promise<JobResultsResponse>;
  openXmlFileDialog: () => Promise<OpenXmlDialogResult>;
}

declare global {
  interface Window {
    cuepoint?: CuePointBridge;
  }
}

export function hasEngineBridge(): boolean {
  return typeof window.cuepoint?.startMatchJob === "function";
}

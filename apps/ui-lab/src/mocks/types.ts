/** TypeScript mirrors of src/cuepoint/ui/gui_interface.py shapes. */

export type ReliabilityState =
  | "idle"
  | "preflight"
  | "running"
  | "retrying"
  | "paused"
  | "resuming"
  | "completed"
  | "failed";

export interface ProgressInfo {
  completed_tracks: number;
  total_tracks: number;
  matched_count: number;
  unmatched_count: number;
  current_track: { title: string; artists: string };
  elapsed_time: number;
  eta_seconds: number | null;
  status_message: string | null;
  reliability_state: ReliabilityState | null;
  percentage: number;
}

export interface TrackResult {
  playlist_index: number;
  title: string;
  artist: string;
  matched: boolean;
  beatport_url?: string;
  beatport_title?: string;
  beatport_artists?: string;
  beatport_key?: string;
  beatport_key_camelot?: string;
  beatport_bpm?: string;
  match_score?: number;
  confidence?: "high" | "medium" | "low";
}

export type ErrorType =
  | "network"
  | "authentication"
  | "validation"
  | "processing"
  | "cancelled"
  | "unknown";

export interface ProcessingError {
  error_type: ErrorType;
  message: string;
  details?: string;
  recoverable: boolean;
}

export interface ToolOption {
  id: "inkey" | "incrate";
  name: string;
  description: string;
  available: boolean;
}

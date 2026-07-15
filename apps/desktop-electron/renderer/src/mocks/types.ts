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
  write?: boolean;
  file_path?: string;
  error?: string;
  beatport_url?: string;
  beatport_title?: string;
  beatport_artists?: string;
  beatport_key?: string;
  beatport_key_camelot?: string;
  beatport_year?: string;
  beatport_label?: string;
  beatport_bpm?: string;
  match_score?: number;
  title_sim?: number;
  artist_sim?: number;
  confidence?: "high" | "medium" | "low";
  candidates?: MatchCandidate[];
}

/** Alternative Beatport match row (engine/Qt candidate dict shape). */
export interface MatchCandidate {
  candidate_title?: string;
  beatport_title?: string;
  candidate_artists?: string;
  beatport_artists?: string;
  candidate_url?: string;
  beatport_url?: string;
  candidate_key?: string;
  beatport_key?: string;
  candidate_key_camelot?: string;
  beatport_key_camelot?: string;
  candidate_year?: string;
  beatport_year?: string;
  candidate_bpm?: string;
  beatport_bpm?: string;
  candidate_label?: string;
  beatport_label?: string;
  final_score?: number | string;
  match_score?: number | string;
  title_sim?: number | string;
  artist_sim?: number | string;
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

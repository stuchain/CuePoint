import type { ProgressInfo, ToolOption, TrackResult } from "./types";

export const toolOptions: ToolOption[] = [
  {
    id: "inkey",
    name: "inKey",
    description: "Match Rekordbox tracks to Beatport metadata and keys.",
    available: true,
  },
  {
    id: "incrate",
    name: "inCrate",
    description: "Discover and organize crate workflows (preview).",
    available: false,
  },
];

export const sampleProgress: ProgressInfo = {
  completed_tracks: 42,
  total_tracks: 128,
  matched_count: 36,
  unmatched_count: 6,
  current_track: {
    title: "Midnight Pulse",
    artists: "DJ Nova, Kira Lane",
  },
  elapsed_time: 184.5,
  eta_seconds: 312,
  status_message: "Searching Beatport…",
  reliability_state: "running",
  percentage: 32.8,
};

export const idleProgress: ProgressInfo = {
  completed_tracks: 0,
  total_tracks: 0,
  matched_count: 0,
  unmatched_count: 0,
  current_track: { title: "", artists: "" },
  elapsed_time: 0,
  eta_seconds: null,
  status_message: null,
  reliability_state: "idle",
  percentage: 0,
};

const titles = [
  ["Strobe", "Deadmau5"],
  ["One More Time", "Daft Punk"],
  ["Innerbloom", "RÜFÜS DU SOL"],
  ["Cola", "CamelPhat & Elderbrook"],
  ["Losing It", "Fisher"],
  ["Opus", "Eric Prydz"],
  ["Gypsy Woman", "Crystal Waters"],
  ["Show Me Love", "Robin S"],
  ["Finally", "Kings of Tomorrow"],
  ["Insomnia", "Faithless"],
];

const labels = ["Anjunabeats", "Toolroom", "Defected", "Drumcode", "Spinnin"];

export function generateTrackResults(count = 120): TrackResult[] {
  return Array.from({ length: count }, (_, i) => {
    const [title, artist] = titles[i % titles.length];
    const matched = i % 5 !== 4;
    return {
      playlist_index: i + 1,
      title: `${title} ${i > 9 ? `(Mix ${i})` : ""}`.trim(),
      artist,
      matched,
      write: matched && i % 3 !== 0,
      beatport_title: matched ? title : undefined,
      beatport_artists: matched ? artist : undefined,
      beatport_key: matched ? ["Am", "Em", "Dm", "G"][i % 4] : undefined,
      beatport_key_camelot: matched ? ["8A", "9A", "7A", "6A"][i % 4] : undefined,
      beatport_year: matched ? String(2018 + (i % 7)) : undefined,
      beatport_label: matched ? labels[i % labels.length] : undefined,
      beatport_bpm: matched ? String(120 + (i % 15)) : undefined,
      match_score: matched ? 85 + (i % 14) : undefined,
      confidence: matched ? (["high", "medium", "low"] as const)[i % 3] : undefined,
      beatport_url: matched ? `https://www.beatport.com/track/x/${1000 + i}` : undefined,
    };
  });
}

export const sampleResults = generateTrackResults(120);

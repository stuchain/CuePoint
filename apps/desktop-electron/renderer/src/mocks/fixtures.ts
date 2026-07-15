import type { MatchCandidate, TrackResult } from "./types";

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
    available: true,
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

function demoCandidates(index: number, primaryScore = 88): MatchCandidate[] {
  return [
    {
      candidate_title: titles[index % titles.length][0],
      candidate_artists: titles[index % titles.length][1],
      candidate_url: `https://www.beatport.com/track/fixture/${index}`,
      candidate_key: ["Am", "Em", "Dm", "G"][index % 4],
      candidate_key_camelot: ["8A", "9A", "7A", "6A"][index % 4],
      candidate_year: String(2018 + (index % 7)),
      candidate_bpm: String(120 + (index % 15)),
      candidate_label: labels[index % labels.length],
      final_score: primaryScore,
      match_score: primaryScore,
      title_sim: 95,
      artist_sim: 90,
    },
    {
      candidate_title: `Alt ${titles[index % titles.length][0]}`,
      candidate_artists: "Other Artist",
      candidate_url: `https://www.beatport.com/track/fixture-alt/${index}`,
      candidate_key: "Em",
      candidate_key_camelot: "9A",
      candidate_year: "2017",
      candidate_bpm: "124",
      candidate_label: "Alt Records",
      final_score: 71,
      match_score: 71,
      title_sim: 78,
      artist_sim: 62,
    },
  ];
}

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
      title_sim: matched ? 94 : undefined,
      artist_sim: matched ? 88 : undefined,
      confidence: matched ? (["high", "medium", "low"] as const)[i % 3] : undefined,
      beatport_url: matched ? `https://www.beatport.com/track/x/${1000 + i}` : undefined,
      candidates: matched && i % 2 === 0 ? demoCandidates(i) : undefined,
    };
  });
}

export const sampleResults = generateTrackResults(120);

export const sampleBatchResults: Record<string, TrackResult[]> = {
  "Warm Up": generateTrackResults(8).map((row, index) => ({
    ...row,
    playlist_index: index + 1,
    title: `Warm Up ${row.title}`,
  })),
  "Peak Time": generateTrackResults(8).map((row, index) => ({
    ...row,
    playlist_index: index + 1,
    title: `Peak ${row.title}`,
  })),
};

export const mockXmlPlaylists = [
  { path: "Warm Up", name: "Warm Up", display_name: "Warm Up", track_count: 24 },
  { path: "Peak Time", name: "Peak Time", display_name: "Peak Time", track_count: 18 },
  { path: "Closing/Afterhours", name: "Afterhours", display_name: "Closing / Afterhours", track_count: 12 },
];

export const mockPastHistoryFiles = [
  {
    file_path: "mock://weekend-set.csv",
    file_name: "weekend-set.csv",
    modified_at: new Date(Date.now() - 86400000).toISOString(),
    size_bytes: 48_000,
    playlist_name: "Weekend Set",
    xml_path: "C:\\Music\\collection.xml",
    preview: generateTrackResults(8).map((row, index) => ({
      ...row,
      playlist_index: index + 1,
      candidates: index % 2 === 0 ? demoCandidates(index) : undefined,
    })),
    rerun: {
      source: "collection",
      xml_path: "C:\\Music\\collection.xml",
      playlist_name: "Weekend Set",
      xml_exists: false,
      can_rerun: false,
    },
    related_files: {
      review_candidates_csv: "mock://weekend-set_review_candidates.csv",
    },
  },
  {
    file_path: "mock://warmup-tracks.csv",
    file_name: "warmup-tracks.csv",
    modified_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    size_bytes: 31_200,
    playlist_name: "Warm Up",
    preview: generateTrackResults(5).map((row, index) => ({
      ...row,
      playlist_index: index + 1,
      title: `Warm ${row.title}`,
      match_score: index === 2 ? 62 : row.match_score,
    })),
    rerun: {
      source: "collection",
      xml_path: "C:\\Music\\collection.xml",
      playlist_name: "Warm Up",
      xml_exists: false,
      can_rerun: false,
    },
  },
];

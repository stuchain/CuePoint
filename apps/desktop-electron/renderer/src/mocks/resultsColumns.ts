/** Column indices aligned with Qt results_view.py COL_* constants. */
export const COL_WRITE = 0;
export const COL_INDEX = 1;
export const COL_ORIGINAL_TITLE = 2;
export const COL_ORIGINAL_ARTISTS = 3;
export const COL_BEATPORT_TITLE = 4;
export const COL_BEATPORT_ARTISTS = 5;
export const COL_KEY = 6;
export const COL_CAMELOT_KEY = 7;
export const COL_RELEASE_YEAR = 8;
export const COL_LABEL = 9;
export const COL_MATCHED = 10;
export const COL_SCORE = 11;
export const COL_CONFIDENCE = 12;
export const COL_BPM = 13;

export interface ResultsColumnDef {
  id: string;
  colIndex: number;
  label: string;
  sortable: boolean;
  sticky?: boolean;
  /** Minimum width in CSS px before scale; defaults to 80. */
  minWidthPx?: number;
}

export const RESULTS_COLUMNS: ResultsColumnDef[] = [
  { id: "write", colIndex: COL_WRITE, label: "Write", sortable: false, sticky: true, minWidthPx: 36 },
  { id: "index", colIndex: COL_INDEX, label: "Index", sortable: true, sticky: true, minWidthPx: 48 },
  { id: "originalTitle", colIndex: COL_ORIGINAL_TITLE, label: "Original Title", sortable: true },
  { id: "originalArtists", colIndex: COL_ORIGINAL_ARTISTS, label: "Original Artists", sortable: true },
  { id: "beatportTitle", colIndex: COL_BEATPORT_TITLE, label: "Beatport Title", sortable: true },
  { id: "beatportArtists", colIndex: COL_BEATPORT_ARTISTS, label: "Beatport Artists", sortable: true },
  { id: "key", colIndex: COL_KEY, label: "Key", sortable: true, minWidthPx: 56 },
  { id: "camelotKey", colIndex: COL_CAMELOT_KEY, label: "Camelot Key", sortable: true, minWidthPx: 64 },
  { id: "releaseYear", colIndex: COL_RELEASE_YEAR, label: "Release Year", sortable: true, minWidthPx: 64 },
  { id: "label", colIndex: COL_LABEL, label: "Label", sortable: true },
  { id: "matched", colIndex: COL_MATCHED, label: "Matched", sortable: true, minWidthPx: 56 },
  { id: "score", colIndex: COL_SCORE, label: "Score", sortable: true, minWidthPx: 56 },
  { id: "confidence", colIndex: COL_CONFIDENCE, label: "Confidence", sortable: true, minWidthPx: 64 },
  { id: "bpm", colIndex: COL_BPM, label: "BPM", sortable: true, minWidthPx: 56 },
];

export const DEFAULT_SORT_COLUMN = COL_INDEX;

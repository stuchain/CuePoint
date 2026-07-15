import { RESULTS_COLUMNS } from "../mocks/resultsColumns";

export const RESULTS_LAYOUT_STORAGE_KEY = "cuepoint-ui-lab-results-layout";

/** Qt-style minimum column width in CSS pixels (before scale). */
export const COL_MIN_PX = 80;

export interface ResultsTableLayoutState {
  columnWidths: number[];
  tableWidth: number | null;
  tableHeight: number | null;
}

export function getColMinWidth(scale: number): number {
  return COL_MIN_PX * scale;
}

export function getColumnMinWidth(colIndex: number, scale: number): number {
  const base = RESULTS_COLUMNS[colIndex]?.minWidthPx ?? COL_MIN_PX;
  return Math.round(base * scale);
}

export function defaultColumnWidths(scale: number): number[] {
  const wide = Math.round(120 * scale);
  const wider = Math.round(140 * scale);
  const medium = Math.round(96 * scale);

  return RESULTS_COLUMNS.map((col, index) => {
    const min = getColumnMinWidth(index, scale);
    const defaults: Record<string, number> = {
      write: min,
      index: min,
      originalTitle: wider,
      originalArtists: wide,
      beatportTitle: wider,
      beatportArtists: wide,
      key: min,
      camelotKey: medium,
      releaseYear: medium,
      label: wide,
      matched: min,
      score: min,
      confidence: medium,
      bpm: min,
    };
    return Math.max(min, defaults[col.id] ?? getColMinWidth(scale));
  });
}

export function buildGridTemplateColumns(widths: number[]): string {
  return widths.map((w) => `${Math.round(w)}px`).join(" ");
}

export function totalTableWidth(widths: number[]): number {
  return widths.reduce((sum, w) => sum + w, 0);
}

export function clampColumnWidths(widths: number[], scale: number): number[] {
  return widths.map((w, i) => Math.max(getColumnMinWidth(i, scale), Math.round(w)));
}

export function loadResultsTableLayout(scale: number): ResultsTableLayoutState {
  const fallback: ResultsTableLayoutState = {
    columnWidths: defaultColumnWidths(scale),
    tableWidth: null,
    tableHeight: null,
  };

  try {
    const raw = localStorage.getItem(RESULTS_LAYOUT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ResultsTableLayoutState>;
    const widths = Array.isArray(parsed.columnWidths)
      ? clampColumnWidths(parsed.columnWidths, scale)
      : fallback.columnWidths;

    if (widths.length !== RESULTS_COLUMNS.length) return fallback;

    return {
      columnWidths: widths,
      tableWidth: typeof parsed.tableWidth === "number" ? parsed.tableWidth : null,
      tableHeight: typeof parsed.tableHeight === "number" ? parsed.tableHeight : null,
    };
  } catch {
    return fallback;
  }
}

export function saveResultsTableLayout(state: ResultsTableLayoutState): void {
  localStorage.setItem(RESULTS_LAYOUT_STORAGE_KEY, JSON.stringify(state));
}

export function patchResultsTableLayout(
  scale: number,
  patch: Partial<ResultsTableLayoutState>,
): void {
  saveResultsTableLayout({ ...loadResultsTableLayout(scale), ...patch });
}

export const FRAME_MIN_WIDTH = 320;
export const FRAME_MIN_HEIGHT = 280;
export const FRAME_MAX_WIDTH_RATIO = 0.8;
export const FRAME_MAX_HEIGHT = 4000;

export function getFrameMaxWidth(viewportWidth?: number): number {
  const vw = viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1200);
  return Math.floor(vw * FRAME_MAX_WIDTH_RATIO);
}

export function clampFrameWidth(width: number, viewportWidth?: number): number {
  return Math.min(getFrameMaxWidth(viewportWidth), Math.max(FRAME_MIN_WIDTH, Math.round(width)));
}

export function stickyLeftOffset(widths: number[], colIndex: number): number {
  let offset = 0;
  for (let i = 0; i < colIndex; i += 1) {
    if (RESULTS_COLUMNS[i]?.sticky) offset += widths[i] ?? 0;
  }
  return offset;
}

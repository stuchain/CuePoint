/**
 * Track Inspector layout state (DEC-018, DEC-024).
 *
 * DEC-018 names the mechanism explicitly: the same `localStorage` pattern the
 * results table already uses for column widths. So this follows
 * `resultsTableLayout.ts` — one key holding a small state object, a read that
 * never trusts what it finds, and clamping applied on the way out rather than
 * on the way in.
 *
 * Clamping on read is the important half. A width is stored in CSS pixels, but
 * the window it was sized against is not, so a width that was reasonable on a
 * wide monitor can leave no room for the content on a laptop. Storing the
 * clamped value instead would silently shrink the panel for good; clamping on
 * read keeps the user's choice and honors it again when there is room.
 */
export const INSPECTOR_STORAGE_KEY = "cuepoint-ui-shell-inspector";

/** Narrower than this and the panel cannot show a field and its value. */
export const INSPECTOR_MIN_WIDTH = 220;

/** The Inspector may never take more of the window than this. */
export const INSPECTOR_MAX_FRACTION = 0.5;

export const INSPECTOR_DEFAULT_WIDTH = 320;

export interface InspectorState {
  width: number;
  visible: boolean;
}

export const INSPECTOR_DEFAULT_STATE: InspectorState = {
  width: INSPECTOR_DEFAULT_WIDTH,
  visible: true,
};

/**
 * The widest the Inspector may be right now.
 *
 * Never below the minimum: on a very narrow window the two bounds cross, and a
 * maximum that undercuts the minimum would collapse the panel to nothing.
 */
export function inspectorMaxWidth(windowWidth: number): number {
  return Math.max(INSPECTOR_MIN_WIDTH, Math.floor(windowWidth * INSPECTOR_MAX_FRACTION));
}

export function clampInspectorWidth(width: number, windowWidth: number): number {
  const max = inspectorMaxWidth(windowWidth);
  if (!Number.isFinite(width)) return INSPECTOR_DEFAULT_WIDTH;
  return Math.min(max, Math.max(INSPECTOR_MIN_WIDTH, Math.round(width)));
}

export function loadInspectorState(): InspectorState {
  try {
    const raw = localStorage.getItem(INSPECTOR_STORAGE_KEY);
    if (!raw) return INSPECTOR_DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<InspectorState>;
    return {
      width:
        typeof parsed.width === "number" && Number.isFinite(parsed.width)
          ? parsed.width
          : INSPECTOR_DEFAULT_WIDTH,
      // Anything that is not explicitly `false` leaves the panel visible: a
      // corrupt value should not hide a whole region of the app.
      visible: parsed.visible !== false,
    };
  } catch {
    // Malformed JSON, or storage disabled outright.
    return INSPECTOR_DEFAULT_STATE;
  }
}

export function saveInspectorState(state: InspectorState): void {
  try {
    localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A forgotten panel width is not worth breaking the drag over.
  }
}

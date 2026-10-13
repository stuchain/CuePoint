/**
 * Track Inspector layout state (DEC-018, DEC-024).
 *
 * DEC-018 names the mechanism explicitly: the same `localStorage` pattern the
 * results table used for column widths. So this follows that module — one key
 * holding a small state object, a read that
 * never trusts what it finds, and clamping applied on the way out rather than
 * on the way in.
 *
 * Clamping on read is the important half. A width is stored in 1× units (R2-4,
 * DEC-273, which amends DEC-018's width unit): the panel is as wide as its text
 * needs, and the text scales, so a width kept in real pixels would leave the
 * same panel too narrow at Large and too wide at Small. The window it was
 * sized against does not scale, so a width that was reasonable on a wide monitor can leave no room for the content on a laptop. Storing the
 * clamped value instead would silently shrink the panel for good; clamping on
 * read keeps the user's choice and honors it again when there is room.
 */
export const INSPECTOR_STORAGE_KEY = "cuepoint-ui-shell-inspector";

/** Narrower than this and the panel cannot show a field and its value (1× units). */
export const INSPECTOR_MIN_WIDTH = 147;

/** The Inspector may never take more of the window than this. */
export const INSPECTOR_MAX_FRACTION = 0.5;

/** 1× units: 320px at the default 1.5× size, as before R2-4. */
export const INSPECTOR_DEFAULT_WIDTH = 213;

export interface InspectorState {
  /** In 1× units; `inspectorWidthPx` turns it into the pixels drawn. */
  width: number;
  visible: boolean;
  /** Marks `width` as 1× units. A stored state without it is legacy pixels (DEC-273). */
  unit: "1x";
}

export const INSPECTOR_DEFAULT_STATE: InspectorState = {
  width: INSPECTOR_DEFAULT_WIDTH,
  visible: true,
  unit: "1x",
};

/**
 * The widest the Inspector may be right now, in real pixels.
 *
 * Never below the minimum at this scale: on a very narrow window the two bounds
 * cross, and a maximum that undercuts the minimum would collapse the panel.
 */
export function inspectorMaxWidth(windowWidth: number, scale = 1): number {
  return Math.max(
    Math.round(INSPECTOR_MIN_WIDTH * scale),
    Math.floor(windowWidth * INSPECTOR_MAX_FRACTION),
  );
}

/** The drawn width in real pixels: the 1× width times the scale, clamped to the window. */
export function inspectorWidthPx(width1x: number, scale: number, windowWidth: number): number {
  if (!Number.isFinite(width1x)) return Math.round(INSPECTOR_DEFAULT_WIDTH * scale);
  return Math.min(
    inspectorMaxWidth(windowWidth, scale),
    Math.max(Math.round(INSPECTOR_MIN_WIDTH * scale), Math.round(width1x * scale)),
  );
}

/** A width the user chose in real pixels, back to 1× units for storing (DEC-273). */
export function inspectorWidthFromPx(px: number, scale: number): number {
  return px / scale;
}

/** The pixel default before R2-4. */
const LEGACY_DEFAULT_PX = 320;

/**
 * The stored state. A state without `unit: "1x"` holds real pixels from before
 * R2-4: it is divided by the current scale once here and saved back marked, so
 * the panel the user sized keeps its look at the size they are on now. A legacy
 * 320 is the old default (saved on mount, so nearly every install has it), not a
 * choice: it becomes the 1x default and so follows the scale.
 */
export function loadInspectorState(scale = 1): InspectorState {
  try {
    const raw = localStorage.getItem(INSPECTOR_STORAGE_KEY);
    if (!raw) return INSPECTOR_DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<InspectorState>;
    const stored =
      typeof parsed.width === "number" && Number.isFinite(parsed.width) ? parsed.width : null;
    const legacy = parsed.unit !== "1x";
    const state: InspectorState = {
      width:
        stored === null
          ? INSPECTOR_DEFAULT_WIDTH
          : legacy
            ? stored === LEGACY_DEFAULT_PX
              ? INSPECTOR_DEFAULT_WIDTH
              : inspectorWidthFromPx(stored, scale)
            : stored,
      // Anything that is not explicitly `false` leaves the panel visible: a
      // corrupt value should not hide a whole region of the app.
      visible: parsed.visible !== false,
      unit: "1x",
    };
    if (legacy && stored !== null) saveInspectorState(state);
    return state;
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

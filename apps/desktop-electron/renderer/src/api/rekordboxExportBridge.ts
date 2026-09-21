/**
 * The bridge methods the Rekordbox export calls (EXPORT-06).
 *
 * Listed once, so the export UI reaches the bridge through one door and a test
 * can hold the list against what the preload actually exposes. A method the UI
 * calls that the preload lacks type-checks here — every bridge method is
 * optional — and fails only at runtime, in the packaged app, as `undefined is
 * not a function`; the test is what turns that into a failure before it ships.
 *
 * The Rekordbox export, not the CSV, JSON and Excel one (`exportReviewList`,
 * `saveExportFileDialog`), which this deliberately does not name.
 */
import type { CuePointBridge } from "./cuepointBridge.types";

export const REKORDBOX_EXPORT_BRIDGE_METHODS = [
  "chooseRekordboxExportDestination",
  "previewRekordboxExport",
  "startRekordboxExport",
  "getRekordboxExportHistory",
  // Following the job the export runs as, and stopping it.
  "getJob",
  "getJobResults",
  "subscribeJobEvents",
  "cancelJob",
] as const satisfies readonly (keyof CuePointBridge)[];

export type RekordboxExportBridgeMethod = (typeof REKORDBOX_EXPORT_BRIDGE_METHODS)[number];

/** The bridge with every method the export calls present. */
export type RekordboxExportBridge = Required<Pick<CuePointBridge, RekordboxExportBridgeMethod>>;

/**
 * The bridge, when it can run an export; `null` in a browser tab or an older
 * shell, so the UI can say so rather than fail half way through.
 */
export function rekordboxExportBridge(
  bridge: Partial<CuePointBridge> | undefined = typeof window === "undefined"
    ? undefined
    : window.cuepoint,
): RekordboxExportBridge | null {
  if (!bridge) return null;
  const complete = REKORDBOX_EXPORT_BRIDGE_METHODS.every(
    (method) => typeof bridge[method] === "function",
  );
  return complete ? (bridge as RekordboxExportBridge) : null;
}

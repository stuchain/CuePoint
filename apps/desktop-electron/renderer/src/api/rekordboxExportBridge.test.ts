/**
 * Every bridge method the Rekordbox export calls exists (EXPORT-06).
 *
 * The runtime preload is evaluated here with a stand-in for `electron`, as the
 * real one is loaded, and the export's list of methods is held against what it
 * actually exposes — not against the bridge type, which marks every method
 * optional and so would accept one that nothing provides.
 */
import { describe, expect, it, vi } from "vitest";

// Read as text through Vite: the renderer has no Node types, deliberately.
import preload from "../../../electron/preload.cjs?raw";
import {
  REKORDBOX_EXPORT_BRIDGE_METHODS,
  rekordboxExportBridge,
} from "./rekordboxExportBridge";

type Exposed = Record<string, unknown>;

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

function loadPreload(invoke: Invoke = vi.fn(async () => undefined)): Exposed {
  let exposed: Exposed | null = null;
  const electron = {
    contextBridge: { exposeInMainWorld: (_name: string, api: Exposed) => (exposed = api) },
    ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() },
    webUtils: { getPathForFile: () => null },
  };
  new Function("require", preload)((name: string) => {
    if (name !== "electron") throw new Error(`unexpected require ${name}`);
    return electron;
  });
  return exposed!;
}

describe("the Rekordbox export's bridge", () => {
  it.each(REKORDBOX_EXPORT_BRIDGE_METHODS)("the preload exposes %s", (method) => {
    expect(typeof loadPreload()[method]).toBe("function");
  });

  it("names exactly what the export dialog needs, cancelling included", () => {
    // Pinned rather than iterated: a method dropped from the list would
    // otherwise shrink every check above along with it.
    expect([...REKORDBOX_EXPORT_BRIDGE_METHODS].sort()).toEqual(
      [
        "cancelJob",
        "chooseRekordboxExportDestination",
        "getJob",
        "getJobResults",
        "getRekordboxExportHistory",
        "previewRekordboxExport",
        "startRekordboxExport",
        "subscribeJobEvents",
      ].sort(),
    );
  });

  it("is complete over the real preload", () => {
    expect(rekordboxExportBridge(loadPreload())).not.toBeNull();
  });

  it.each(REKORDBOX_EXPORT_BRIDGE_METHODS)("is absent when %s is missing", (method) => {
    const partial = { ...loadPreload() };
    delete partial[method];

    expect(rekordboxExportBridge(partial)).toBeNull();
  });

  it("is absent without a bridge at all, as in a browser tab", () => {
    expect(rekordboxExportBridge(undefined)).toBeNull();
  });

  it("names the Rekordbox export and not the CSV, JSON and Excel one", () => {
    const methods: readonly string[] = REKORDBOX_EXPORT_BRIDGE_METHODS;
    expect(methods).not.toContain("exportReviewList");
    expect(methods).not.toContain("saveExportFileDialog");
  });

  it.each([
    ["chooseRekordboxExportDestination", "dialog:saveRekordboxExport"],
    ["previewRekordboxExport", "engine:previewRekordboxExport"],
    ["startRekordboxExport", "engine:startRekordboxExport"],
    ["getRekordboxExportHistory", "engine:getRekordboxExportHistory"],
  ])("%s invokes %s with what it was given", async (method, channel) => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const api = loadPreload(invoke) as Record<string, (arg: unknown) => Promise<unknown>>;

    await api[method]!({ given: method });

    expect(invoke).toHaveBeenCalledWith(channel, { given: method });
  });
});

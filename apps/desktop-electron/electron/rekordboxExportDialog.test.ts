import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SaveDialogOptions, SaveDialogReturnValue } from "electron";

import type { RememberedRekordboxExport } from "./engineClient";
import {
  REKORDBOX_EXPORT_DIALOG_TITLE,
  REKORDBOX_EXPORT_FILTERS,
  chooseRekordboxExportDestination,
  rekordboxExportDialogOptions,
  rekordboxExportFileName,
  type RekordboxExportDialogDeps,
} from "./rekordboxExportDialog";

/**
 * The Rekordbox export's save dialog (EXPORT-06, DEC-083).
 *
 * What the dialog is opened with — its filter, its dated name, the folder it
 * starts in — and that it answers with a file or with nothing, and never
 * judges the file or starts anything. Whether a path may be written is the
 * engine's, and is tested there.
 */

const DOCUMENTS = path.resolve("/home/dj/Documents");
const EXPORTS = path.resolve("/music/exports");
const SATURDAY = new Date(2026, 8, 5, 23, 59); // 5 September 2026, local time

function remembered(overrides: Partial<RememberedRekordboxExport> = {}): RememberedRekordboxExport {
  return { folder: null, folder_exists: false, key_format: "normal", export_id: null, ...overrides };
}

function deps(
  overrides: Partial<RekordboxExportDialogDeps> = {},
  answer: SaveDialogReturnValue = { canceled: true, filePath: "" },
) {
  const showSaveDialog = vi.fn(async (_options: SaveDialogOptions) => answer);
  const history = vi.fn(async () => ({ remembered: remembered() }));
  return {
    showSaveDialog,
    history,
    deps: {
      history,
      fallbackFolder: () => DOCUMENTS,
      showSaveDialog,
      now: () => SATURDAY,
      ...overrides,
    } satisfies RekordboxExportDialogDeps,
  };
}

describe("the dated name", () => {
  it("is CuePoint Export and the local date", () => {
    expect(rekordboxExportFileName(SATURDAY)).toBe("CuePoint Export 2026-09-05.xml");
  });

  it("pads the month and the day", () => {
    expect(rekordboxExportFileName(new Date(2027, 0, 3))).toBe("CuePoint Export 2027-01-03.xml");
  });

  it("is dated in local time, the date on the person's calendar", () => {
    const lateAtNight = new Date(2026, 11, 31, 23, 30);
    expect(rekordboxExportFileName(lateAtNight)).toBe("CuePoint Export 2026-12-31.xml");
  });
});

describe("what the dialog is opened with", () => {
  it("filters on Rekordbox XML and nothing else", async () => {
    const { deps: given } = deps();
    const options = await rekordboxExportDialogOptions(given);

    expect(options.filters).toEqual([{ name: "Rekordbox XML", extensions: ["xml"] }]);
    expect(options.filters).toBe(REKORDBOX_EXPORT_FILTERS);
    expect(options.title).toBe(REKORDBOX_EXPORT_DIALOG_TITLE);
  });

  it("suggests the dated name in the folder the last export went to", async () => {
    const { deps: given } = deps({
      history: async () => ({ remembered: remembered({ folder: EXPORTS, folder_exists: true }) }),
    });

    const options = await rekordboxExportDialogOptions(given);

    expect(options.defaultPath).toBe(path.join(EXPORTS, "CuePoint Export 2026-09-05.xml"));
  });

  it("starts in Documents when nothing has been exported", async () => {
    const { deps: given } = deps();

    const options = await rekordboxExportDialogOptions(given);

    expect(options.defaultPath).toBe(path.join(DOCUMENTS, "CuePoint Export 2026-09-05.xml"));
  });

  it("starts in Documents when the remembered folder is gone", async () => {
    const { deps: given } = deps({
      history: async () => ({ remembered: remembered({ folder: EXPORTS, folder_exists: false }) }),
    });

    const options = await rekordboxExportDialogOptions(given);

    expect(path.dirname(options.defaultPath!)).toBe(DOCUMENTS);
  });

  it("still opens when the engine cannot say what it remembers", async () => {
    const { deps: given } = deps({
      history: async () => {
        throw new Error("The engine is not connected.");
      },
    });

    const options = await rekordboxExportDialogOptions(given);

    expect(path.dirname(options.defaultPath!)).toBe(DOCUMENTS);
  });

  it("never suggests the previous export's file name", async () => {
    // DEC-083: only the folder is remembered, so no export silently replaces
    // the last one. The history is asked for the folder and nothing else.
    const { deps: given } = deps({
      history: async () => ({
        remembered: remembered({ folder: EXPORTS, folder_exists: true, export_id: 4 }),
      }),
    });

    const options = await rekordboxExportDialogOptions(given);

    expect(path.basename(options.defaultPath!)).toBe("CuePoint Export 2026-09-05.xml");
  });

  it("reopens at a previous choice when asked to change it", async () => {
    const chosen = path.join(EXPORTS, "Saturday.xml");
    const { deps: given, history } = deps();

    const options = await rekordboxExportDialogOptions(given, { currentPath: chosen });

    expect(options.defaultPath).toBe(chosen);
    expect(history).not.toHaveBeenCalled();
  });

  it.each([
    ["a relative path", "Saturday.xml"],
    ["a file of another kind", path.join(EXPORTS, "Saturday.mp3")],
    ["a blank", "   "],
    ["nothing", null],
    ["not text", 7 as unknown as string],
  ])("ignores %s as a previous choice", async (_what, currentPath) => {
    const { deps: given } = deps();

    const options = await rekordboxExportDialogOptions(given, { currentPath });

    expect(options.defaultPath).toBe(path.join(DOCUMENTS, "CuePoint Export 2026-09-05.xml"));
  });

  it("leaves overwriting another file to the OS dialog's own confirmation", async () => {
    const { deps: given } = deps();

    const options = await rekordboxExportDialogOptions(given);

    expect(options.properties).toContain("showOverwriteConfirmation");
  });
});

describe("what the dialog answers", () => {
  it("answers with the file chosen", async () => {
    const chosen = path.join(EXPORTS, "Saturday.xml");
    const { deps: given } = deps({}, { canceled: false, filePath: chosen });

    await expect(chooseRekordboxExportDestination(given)).resolves.toEqual({
      canceled: false,
      filePath: chosen,
    });
  });

  it("answers a cancel with nothing chosen", async () => {
    const { deps: given } = deps({}, { canceled: true, filePath: "" });

    await expect(chooseRekordboxExportDestination(given)).resolves.toEqual({ canceled: true });
  });

  it("answers a cancel with nothing chosen even when the dialog still reports a path", async () => {
    // Some platforms hand back the path that was in the box when Cancel was
    // pressed. The cancel is what the person did; the path is not a choice.
    const { deps: given } = deps({}, { canceled: true, filePath: path.join(EXPORTS, "typed.xml") });

    await expect(chooseRekordboxExportDestination(given)).resolves.toEqual({ canceled: true });
  });

  it("reads a dialog that closed with no file as a cancel", async () => {
    const { deps: given } = deps({}, { canceled: false, filePath: "" });

    await expect(chooseRekordboxExportDestination(given)).resolves.toEqual({ canceled: true });
  });

  it("passes on whatever file was chosen: the engine, not the dialog, judges it", async () => {
    // A path that is plainly refusable still comes back as chosen. Refusing it
    // here would make the shell a second place for DEC-083's rule to live.
    const refusable = path.join(EXPORTS, "Saturday.mp3");
    const { deps: given } = deps({}, { canceled: false, filePath: refusable });

    await expect(chooseRekordboxExportDestination(given)).resolves.toEqual({
      canceled: false,
      filePath: refusable,
    });
  });

  it("opens the dialog once, with the options above", async () => {
    const { deps: given, showSaveDialog } = deps();

    await chooseRekordboxExportDestination(given);

    expect(showSaveDialog).toHaveBeenCalledTimes(1);
    expect(showSaveDialog.mock.calls[0]![0]).toEqual(await rekordboxExportDialogOptions(given));
  });

  it("asks the engine for nothing but the history", async () => {
    // A cancelled dialog starts nothing because this module cannot start
    // anything: the only engine call it is handed is the history read.
    const engine = {
      getRekordboxExportHistory: vi.fn(async () => ({ remembered: remembered() })),
      startRekordboxExport: vi.fn(),
      previewRekordboxExport: vi.fn(),
    };
    const { deps: given } = deps({ history: () => engine.getRekordboxExportHistory() });

    await chooseRekordboxExportDestination(given);

    expect(engine.getRekordboxExportHistory).toHaveBeenCalledTimes(1);
    expect(engine.startRekordboxExport).not.toHaveBeenCalled();
    expect(engine.previewRekordboxExport).not.toHaveBeenCalled();
  });
});

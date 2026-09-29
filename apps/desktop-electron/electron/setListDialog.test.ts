import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SaveDialogOptions, SaveDialogReturnValue } from "electron";

import type { SetAnswer, SetListSave } from "./engineClient";
import { MainSettingsStore } from "./mainSettings";
import {
  SET_LIST_DIALOG_TITLE,
  SET_LIST_FILTERS,
  chooseSetListDestination,
  isFolder,
  rememberSetListFolder,
  setListDialogOptions,
  setListFileName,
  setListFileStem,
  setListFolderStore,
  type SetListDialogDeps,
} from "./setListDialog";

/**
 * The set list's save dialog (PREP-08, DEC-110).
 *
 * What the dialog is opened with — its three filters, its dated name, the
 * folder it starts in — that it answers with a file or with nothing and never
 * judges the file or saves anything, and that the folder is remembered only
 * when the engine says it wrote a set list there. Whether a path may be
 * written is the engine's, and is tested there.
 */

const DOCUMENTS = path.resolve("/home/dj/Documents");
const GIGS = path.resolve("/music/gigs");
const TUESDAY = new Date(2026, 8, 29, 23, 59); // 29 September 2026, local time

function deps(
  overrides: Partial<SetListDialogDeps> = {},
  answer: SaveDialogReturnValue = { canceled: true, filePath: "" },
) {
  const showSaveDialog = vi.fn(async (_options: SaveDialogOptions) => answer);
  return {
    showSaveDialog,
    deps: {
      store: { folder: () => null },
      folderExists: () => true,
      fallbackFolder: () => DOCUMENTS,
      showSaveDialog,
      now: () => TUESDAY,
      ...overrides,
    } satisfies SetListDialogDeps,
  };
}

function saved(filePath: string): SetAnswer<SetListSave> {
  return {
    value: {
      saved: {
        set_id: 7,
        path: filePath,
        format: "text",
        entries: 4,
        missing_files: 0,
        untimed: 0,
        bytes_written: 120,
      },
    },
    refusal: null,
  };
}

describe("the suggested name", () => {
  it("is the Set's name and the local date, as text", () => {
    expect(setListFileName("Friday", TUESDAY)).toBe("Friday 2026-09-29.txt");
  });

  it("pads the month and the day, in local time", () => {
    expect(setListFileName("Friday", new Date(2027, 0, 3, 0, 1))).toBe("Friday 2027-01-03.txt");
  });

  it.each([
    ["Friday 2/10", "Friday 2-10"],
    ['Club "Void": main room', "Club -Void-- main room"],
    ["a\\b|c?d*e<f>g", "a-b-c-d-e-f-g"],
    ["tab\there\nnewline", "tab-here-newline"],
    ["  spaced   out  ", "spaced out"],
    ["ends with dots...", "ends with dots"],
    ["", "Set"],
    ["   ", "Set"],
    ["...", "Set"],
    ["CON", "Set CON"],
    ["nul.mix", "Set nul.mix"],
    ["Console", "Console"],
  ])("makes %j a name every system can hold: %j", (name, stem) => {
    expect(setListFileStem(name)).toBe(stem);
  });

  it("is not given a name at all when the renderer sends none", () => {
    expect(setListFileStem(undefined)).toBe("Set");
    expect(setListFileStem(7)).toBe("Set");
  });

  it("keeps a long name to a length a path can hold", () => {
    const stem = setListFileStem("x".repeat(300));
    expect(stem.length).toBe(100);
  });
});

describe("what the dialog is opened with", () => {
  it("offers the three forms, text first, and says what it is for", () => {
    const options = setListDialogOptions(deps().deps, { setName: "Friday" });
    expect(options.title).toBe(SET_LIST_DIALOG_TITLE);
    expect(options.filters).toEqual(SET_LIST_FILTERS);
    expect(SET_LIST_FILTERS.map((f) => f.extensions)).toEqual([["txt"], ["csv"], ["m3u8"]]);
    expect(options.properties).toEqual(["createDirectory", "showOverwriteConfirmation"]);
  });

  it("opens in the documents folder the first time", () => {
    const options = setListDialogOptions(deps().deps, { setName: "Friday" });
    expect(options.defaultPath).toBe(path.join(DOCUMENTS, "Friday 2026-09-29.txt"));
  });

  it("opens where the last set list was saved", () => {
    const options = setListDialogOptions(deps({ store: { folder: () => GIGS } }).deps, {
      setName: "Friday",
    });
    expect(options.defaultPath).toBe(path.join(GIGS, "Friday 2026-09-29.txt"));
  });

  it("falls back when that folder is gone, or cannot be read", () => {
    const gone = deps({ store: { folder: () => GIGS }, folderExists: () => false }).deps;
    expect(setListDialogOptions(gone, { setName: "F" }).defaultPath).toBe(
      path.join(DOCUMENTS, "F 2026-09-29.txt"),
    );
    const broken = deps({
      store: {
        folder: () => {
          throw new Error("unreadable");
        },
      },
    }).deps;
    expect(setListDialogOptions(broken, { setName: "F" }).defaultPath).toBe(
      path.join(DOCUMENTS, "F 2026-09-29.txt"),
    );
  });

  it("reopens at a choice the engine refused, so the person can correct it", () => {
    const previous = path.join(GIGS, "Friday.csv");
    const options = setListDialogOptions(deps().deps, { setName: "Friday", currentPath: previous });
    expect(options.defaultPath).toBe(previous);
  });

  it.each([["relative/Friday.txt"], [path.join(GIGS, "Friday.xml")], [""], [null]])(
    "ignores %j as a previous choice",
    (currentPath) => {
      const options = setListDialogOptions(deps().deps, { setName: "Friday", currentPath });
      expect(options.defaultPath).toBe(path.join(DOCUMENTS, "Friday 2026-09-29.txt"));
    },
  );

  it("opens with no request at all", () => {
    expect(setListDialogOptions(deps().deps, null).defaultPath).toBe(
      path.join(DOCUMENTS, "Set 2026-09-29.txt"),
    );
  });
});

describe("what the dialog answers", () => {
  it("answers the file chosen, whatever it is: the engine judges it", async () => {
    const chosen = path.join(GIGS, "anything.xml");
    const { deps: d, showSaveDialog } = deps({}, { canceled: false, filePath: chosen });

    expect(await chooseSetListDestination(d, { setName: "Friday" })).toEqual({
      canceled: false,
      filePath: chosen,
    });
    expect(showSaveDialog).toHaveBeenCalledOnce();
  });

  it("answers a cancelled dialog, or one with no file, as cancelled", async () => {
    expect(await chooseSetListDestination(deps().deps, { setName: "F" })).toEqual({
      canceled: true,
    });
    const empty = deps({}, { canceled: false, filePath: "" }).deps;
    expect(await chooseSetListDestination(empty, { setName: "F" })).toEqual({ canceled: true });
  });
});

describe("the remembered folder", () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuepoint-setlist-"));
    made.push(dir);
    return dir;
  }

  it("is the folder of the file the engine wrote", async () => {
    const remember = vi.fn();
    const answer = saved(path.join(GIGS, "Friday 2026-09-29.txt"));

    expect(await rememberSetListFolder(Promise.resolve(answer), { remember })).toBe(answer);
    expect(remember).toHaveBeenCalledWith(GIGS);
  });

  it("is not changed by a refusal", async () => {
    const remember = vi.fn();
    const refusal: SetAnswer<SetListSave> = {
      value: null,
      refusal: {
        code: "SET_LIST_DESTINATION_REFUSED",
        message: "The folder to save into does not exist",
        reason: "destination_folder_missing",
        path: path.join(GIGS, "gone", "Friday.txt"),
      },
    };

    expect(await rememberSetListFolder(Promise.resolve(refusal), { remember })).toBe(refusal);
    expect(remember).not.toHaveBeenCalled();
  });

  it("never fails a save it could not remember", async () => {
    const answer = saved(path.join(GIGS, "Friday.txt"));
    const remember = () => {
      throw new Error("disk full");
    };
    expect(await rememberSetListFolder(Promise.resolve(answer), { remember })).toBe(answer);
  });

  it("passes a failed save's error through untouched", async () => {
    const remember = vi.fn();
    await expect(
      rememberSetListFolder(Promise.reject(new Error("No database")), { remember }),
    ).rejects.toThrow("No database");
    expect(remember).not.toHaveBeenCalled();
  });

  it("lives in main's own settings, and the next dialog opens there", async () => {
    const home = tempDir();
    const gigs = tempDir();
    const store = setListFolderStore(new MainSettingsStore(path.join(home, "main-settings.json")));

    await rememberSetListFolder(Promise.resolve(saved(path.join(gigs, "Friday.txt"))), store);

    const reopened = setListFolderStore(
      new MainSettingsStore(path.join(home, "main-settings.json")),
    );
    expect(reopened.folder()).toBe(gigs);
    const options = setListDialogOptions(
      { ...deps().deps, store: reopened, folderExists: isFolder },
      { setName: "Saturday" },
    );
    expect(options.defaultPath).toBe(path.join(gigs, "Saturday 2026-09-29.txt"));
  });

  it("says whether a folder is there", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "a.txt"), "x");
    expect(isFolder(dir)).toBe(true);
    expect(isFolder(path.join(dir, "a.txt"))).toBe(false);
    expect(isFolder(path.join(dir, "missing"))).toBe(false);
  });
});

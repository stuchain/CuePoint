/**
 * "Save set list…" and "Copy set list" (DEC-110, PREP-08's dialog, PREP-09).
 *
 * Over the engine's own answers (`librarySets.fixture.json`):
 *
 * - **The words** match the engine's activity event, and an M3U8, which holds
 *   no times, does not count untimed entries.
 * - **The dialog chooses, the engine judges.** A refused destination, and a
 *   file system that would not write, reopen the dialog at the file refused
 *   and say why; anything else ends the save.
 * - **Copying** puts the engine's text on the clipboard and says so.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SetListSaved, SetRefusal } from "../../api/cuepointBridge.types";
import {
  FRIDAY,
  SET_GONE,
  SET_LIST_REFUSED,
  SET_LIST_SAVED,
  SET_LIST_TEXT,
  answered,
  refused,
} from "../library/librarySets.testFixture";
import {
  CLIPBOARD_REFUSED,
  NO_SET_LISTS,
  reopensDialog,
  setListCopiedLine,
  setListSavedLine,
} from "./setList";
import { useSetList } from "./useSetList";

const TARGET = { id: FRIDAY.id, name: FRIDAY.name };

describe("the words", () => {
  it("says what the engine's activity event says, from its answer", () => {
    expect(setListSavedLine("Friday", SET_LIST_SAVED.saved)).toBe(
      "Saved “Friday” as a CSV set list — 6 entries, 6 untimed.",
    );
  });

  it("counts missing files and names each form", () => {
    const saved: SetListSaved = { ...SET_LIST_SAVED.saved, format: "text", missing_files: 1, untimed: 0 };
    expect(setListSavedLine("Friday", saved)).toBe(
      "Saved “Friday” as a text set list — 6 entries, 1 file missing.",
    );
    expect(setListSavedLine("One", { ...saved, entries: 1, missing_files: 2 })).toBe(
      "Saved “One” as a text set list — 1 entry, 2 files missing.",
    );
  });

  it("does not count untimed entries in an M3U8, which holds no times", () => {
    const saved: SetListSaved = { ...SET_LIST_SAVED.saved, format: "m3u8" };
    expect(setListSavedLine("Friday", saved)).toBe("Saved “Friday” as an M3U8 set list — 6 entries.");
  });

  it("says a copy was made", () => {
    expect(setListCopiedLine("Friday")).toBe("Copied the set list for “Friday”.");
  });

  it("reopens the dialog for a place refused, and for nothing else", () => {
    expect(reopensDialog(SET_LIST_REFUSED)).toBe(true);
    const failed: SetRefusal = { ...SET_LIST_REFUSED, code: "SET_LIST_WRITE_FAILED", reason: null };
    expect(reopensDialog(failed)).toBe(true);
    expect(reopensDialog(SET_GONE)).toBe(false);
    expect(reopensDialog({ ...SET_GONE, code: "INVALID_REQUEST", reason: null })).toBe(false);
  });
});

describe("the hook", () => {
  let sets: {
    chooseSetListDestination: ReturnType<typeof vi.fn>;
    saveSetList: ReturnType<typeof vi.fn>;
    setListText: ReturnType<typeof vi.fn>;
  };
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sets = {
      chooseSetListDestination: vi.fn(),
      saveSetList: vi.fn(),
      setListText: vi.fn(),
    };
    (window as unknown as { cuepoint?: unknown }).cuepoint = { sets };
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    vi.restoreAllMocks();
  });

  function hook() {
    const onMessage = vi.fn();
    const onGone = vi.fn();
    const { result } = renderHook(() => useSetList({ onMessage, onGone }));
    return { result, onMessage, onGone };
  }

  it("saves where the dialog chose and says what was written", async () => {
    sets.chooseSetListDestination.mockResolvedValue({ canceled: false, filePath: "/music/set lists/Friday.csv" });
    sets.saveSetList.mockResolvedValue(answered(SET_LIST_SAVED));
    const { result, onMessage } = hook();

    await act(() => result.current.save(TARGET));

    expect(sets.chooseSetListDestination).toHaveBeenCalledWith({ setName: "Friday", currentPath: null });
    expect(sets.saveSetList).toHaveBeenCalledWith({
      set_id: FRIDAY.id,
      destination_path: "/music/set lists/Friday.csv",
    });
    expect(onMessage).toHaveBeenCalledWith(
      "Saved “Friday” as a CSV set list — 6 entries, 6 untimed.",
      "success",
    );
  });

  it("does nothing when the dialog is cancelled", async () => {
    sets.chooseSetListDestination.mockResolvedValue({ canceled: true });
    const { result, onMessage } = hook();
    await act(() => result.current.save(TARGET));
    expect(sets.saveSetList).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("reopens at the file refused, says why, and saves the second choice", async () => {
    sets.chooseSetListDestination
      .mockResolvedValueOnce({ canceled: false, filePath: "/music/set lists/Friday.mp3" })
      .mockResolvedValueOnce({ canceled: false, filePath: "/music/set lists/Friday.csv" });
    sets.saveSetList
      .mockResolvedValueOnce(refused(SET_LIST_REFUSED))
      .mockResolvedValueOnce(answered(SET_LIST_SAVED));
    const { result, onMessage } = hook();

    await act(() => result.current.save(TARGET));

    expect(sets.chooseSetListDestination).toHaveBeenNthCalledWith(2, {
      setName: "Friday",
      currentPath: "/music/set lists/Friday.mp3",
    });
    expect(onMessage.mock.calls).toEqual([
      ["A set list is saved as a .txt, .csv or .m3u8 file: '/music/set lists/Friday.mp3'", "warning"],
      ["Saved “Friday” as a CSV set list — 6 entries, 6 untimed.", "success"],
    ]);
  });

  it("reopens after a file system that would not write, and stops when cancelled", async () => {
    const failed: SetRefusal = {
      code: "SET_LIST_WRITE_FAILED",
      message: "Could not write /music/set lists/Friday.csv",
      reason: null,
      path: "/music/set lists/Friday.csv",
    };
    sets.chooseSetListDestination
      .mockResolvedValueOnce({ canceled: false, filePath: "/music/set lists/Friday.csv" })
      .mockResolvedValueOnce({ canceled: true });
    sets.saveSetList.mockResolvedValueOnce(refused(failed));
    const { result, onMessage } = hook();

    await act(() => result.current.save(TARGET));

    expect(sets.chooseSetListDestination).toHaveBeenCalledTimes(2);
    expect(sets.chooseSetListDestination).toHaveBeenLastCalledWith({
      setName: "Friday",
      currentPath: "/music/set lists/Friday.csv",
    });
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("ends the save, and says the Set has gone, when it has", async () => {
    // A second choice would be cancelled: were the dialog reopened, the test
    // sees a second call rather than spinning.
    sets.chooseSetListDestination
      .mockResolvedValueOnce({ canceled: false, filePath: "/x/Friday.txt" })
      .mockResolvedValue({ canceled: true });
    sets.saveSetList.mockResolvedValue(refused(SET_GONE));
    const { result, onMessage, onGone } = hook();

    await act(() => result.current.save(TARGET));

    expect(sets.chooseSetListDestination).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith("There is no Set 999999", "warning");
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("says what went wrong when the bridge throws", async () => {
    sets.chooseSetListDestination.mockRejectedValue(new Error("The engine is not running"));
    const { result, onMessage } = hook();
    await act(() => result.current.save(TARGET));
    expect(onMessage).toHaveBeenCalledWith("The engine is not running", "warning");
  });

  it("copies the engine's text and says so", async () => {
    sets.setListText.mockResolvedValue(answered(SET_LIST_TEXT));
    const { result, onMessage } = hook();

    await act(() => result.current.copy(TARGET));

    expect(sets.setListText).toHaveBeenCalledWith({ set_id: FRIDAY.id });
    expect(writeText).toHaveBeenCalledWith(SET_LIST_TEXT.text);
    expect(SET_LIST_TEXT.text).toMatch(/^Friday\n/);
    expect(onMessage).toHaveBeenCalledWith("Copied the set list for “Friday”.", "success");
  });

  it("says the clipboard refused rather than claiming a copy", async () => {
    sets.setListText.mockResolvedValue(answered(SET_LIST_TEXT));
    writeText.mockRejectedValue(new Error("denied"));
    const { result, onMessage } = hook();
    await act(() => result.current.copy(TARGET));
    expect(onMessage).toHaveBeenCalledWith(CLIPBOARD_REFUSED, "warning");
  });

  it("says the Set has gone when a copy finds it gone", async () => {
    sets.setListText.mockResolvedValue(refused(SET_GONE));
    const { result, onMessage, onGone } = hook();
    await act(() => result.current.copy(TARGET));
    expect(writeText).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith("There is no Set 999999", "warning");
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("is unavailable, and says so, in a shell without the Sets bridge", async () => {
    (window as unknown as { cuepoint?: unknown }).cuepoint = {};
    const { result, onMessage } = hook();
    expect(result.current.available).toBe(false);
    await act(() => result.current.save(TARGET));
    await act(() => result.current.copy(TARGET));
    expect(onMessage.mock.calls).toEqual([
      [NO_SET_LISTS, "warning"],
      [NO_SET_LISTS, "warning"],
    ]);
  });
});

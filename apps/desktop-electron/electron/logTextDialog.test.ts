import path from "node:path";
import type { SaveDialogOptions } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  LOG_TEXT_MAX_LENGTH,
  logTextFileName,
  parseLogTextRequest,
  saveLogText,
  type LogTextDialogDeps,
} from "./logTextDialog";

const NOW = new Date(2026, 9, 27, 21, 42);

function deps(answer: { canceled: boolean; filePath?: string }) {
  const writeFile = vi.fn();
  const showSaveDialog = vi.fn(async (_options: SaveDialogOptions) => ({
    canceled: answer.canceled,
    filePath: answer.filePath ?? "",
  }));
  const d: LogTextDialogDeps = {
    showSaveDialog,
    writeFile,
    fallbackFolder: () => path.join(path.sep, "docs"),
    now: () => NOW,
  };
  return { d, writeFile, showSaveDialog };
}

describe("the log's file name", () => {
  it("is CuePoint log and today's date, in local time", () => {
    expect(logTextFileName(undefined, NOW)).toBe("CuePoint log 2026-10-27.txt");
    expect(logTextFileName("", NOW)).toBe("CuePoint log 2026-10-27.txt");
  });

  it("carries a label, made safe", () => {
    expect(logTextFileName("errors", NOW)).toBe("CuePoint log errors 2026-10-27.txt");
    const name = logTextFileName('a/b:c*d?"e"', NOW);
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
  });

  it("is bounded however long the search was", () => {
    expect(logTextFileName("x".repeat(5000), NOW).length).toBeLessThan(130);
  });
});

describe("the request", () => {
  it("is text, with an optional label", () => {
    expect(parseLogTextRequest({ text: "a", label: "b" })).toEqual({ text: "a", label: "b" });
    expect(parseLogTextRequest({ text: "" })).toEqual({ text: "", label: null });
  });

  it("is refused when it is not text or is too big", () => {
    expect(parseLogTextRequest(null)).toBeNull();
    expect(parseLogTextRequest({ text: 5 })).toBeNull();
    expect(parseLogTextRequest({ text: "x".repeat(LOG_TEXT_MAX_LENGTH + 1) })).toBeNull();
  });
});

describe("saving the log", () => {
  it("writes the text to the chosen file and says which", async () => {
    const { d, writeFile, showSaveDialog } = deps({ canceled: false, filePath: "/home/me/log.txt" });

    expect(await saveLogText(d, { text: "line 1\nline 2", label: "errors" })).toEqual({
      canceled: false,
      filePath: "/home/me/log.txt",
    });

    expect(writeFile).toHaveBeenCalledWith("/home/me/log.txt", "line 1\nline 2");
    const options = showSaveDialog.mock.calls[0]![0];
    expect(options.defaultPath).toBe(path.join(path.sep, "docs", "CuePoint log errors 2026-10-27.txt"));
    expect(options.filters).toEqual([{ name: "Text file", extensions: ["txt"] }]);
  });

  it("adds .txt when the person typed no extension", async () => {
    const { d, writeFile } = deps({ canceled: false, filePath: "/home/me/mylog" });
    expect(await saveLogText(d, { text: "x" })).toEqual({ canceled: false, filePath: "/home/me/mylog.txt" });
    expect(writeFile).toHaveBeenCalledWith("/home/me/mylog.txt", "x");
  });

  it("writes nothing when the dialog is cancelled", async () => {
    const { d, writeFile } = deps({ canceled: true });
    expect(await saveLogText(d, { text: "x" })).toEqual({ canceled: true });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("refuses a request that is not text before it opens a dialog", async () => {
    const { d, showSaveDialog } = deps({ canceled: true });
    await expect(saveLogText(d, { text: 5 })).rejects.toThrow();
    expect(showSaveDialog).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import * as words from "./words";

describe("words", () => {
  it("names the shared actions once", () => {
    expect(words.MATCH_ON_BEATPORT).toBe("Match on Beatport");
    expect(words.OPEN_LOG_FOLDER).toBe("Open log folder");
    expect(words.UNDO).toBe("Undo");
  });
  it("adds the ellipsis to a dialog opener once", () => {
    expect(words.opensDialog(words.SYNC_TO_FILES)).toBe("Sync to files…");
    expect(words.opensDialog("Sync to files…")).toBe("Sync to files…");
  });
  it("writes go-to, delete and nothing-found text", () => {
    expect(words.goTo("Keys")).toBe("Open in Keys ›");
    expect(words.deleteTitle("Set")).toBe("Delete Set?");
    expect(words.deleteLabel("Set")).toBe("Delete Set");
    expect(words.nothingMatches("house")).toBe("Nothing matches “house”.");
    expect(words.showOnWheel("4A")).toBe("Show 4A on the Camelot wheel");
  });
  it("keeps technical sentences plain, with a period and no Please", () => {
    for (const text of [
      words.needsDesktopApp("edit tags"),
      words.couldNot("clear the cache"),
      words.LOST_TOUCH,
      words.LOST_TOUCH_PARTWAY,
      words.WAVEFORMS_UNAVAILABLE,
    ]) {
      expect(text.endsWith(".")).toBe(true);
      expect(text).not.toMatch(/please|failed to|build|background process/i);
    }
  });
});

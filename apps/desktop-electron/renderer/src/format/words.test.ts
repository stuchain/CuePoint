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
    expect(words.goTo("Keys")).toBe("Open in Keys");
    expect(words.deleteTitle("Set")).toBe("Delete Set?");
    expect(words.deleteLabel("Set")).toBe("Delete Set");
    expect(words.nothingMatches("house")).toBe("Nothing matches “house”.");
    expect(words.showOnWheel("4A")).toBe("Show 4A on the Camelot wheel");
  });
  it("keeps technical sentences plain, with a period and no Please", () => {
    for (const text of [
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

describe("dialogTitle", () => {
  it("repeats the opener without its ellipsis", () => {
    expect(words.dialogTitle("Edit…")).toBe("Edit");
    expect(words.dialogTitle("Rename, targets and notes...")).toBe("Rename, targets and notes");
    expect(words.dialogTitle("New Set from…")).toBe("New Set from");
  });

  it("puts a user's name in curly quotes", () => {
    expect(words.dialogTitle("Edit…", "Build")).toBe("Edit “Build”");
  });
});

describe("sync words (D3)", () => {
  it("names the one flow with one verb", () => {
    expect(words.SYNC.opener).toBe("Sync to files…");
    expect(words.SYNC.title(87)).toBe("Sync 87 tracks to your files");
    expect(words.SYNC.title(1)).toBe("Sync 1 track to your files");
    expect(words.SYNC.button(2)).toBe("Sync 2 files");
    expect(words.SYNC.button(1)).toBe("Sync 1 file");
    expect(words.SYNC.empty).toBe("Nothing to sync");
    expect(words.SYNC.done(3)).toBe("Synced 3 files");
    expect(words.SYNC.running).toBe("Syncing to files");
    expect(words.UP_TO_DATE).toBe("Up to date");
  });
});

describe("match words (D2)", () => {
  it("has the six states and the button that agrees", () => {
    expect(Object.values(words.MATCH_STATE)).toEqual([
      "Confirmed",
      "To check",
      "No match",
      "Not looked up yet",
      "Rejected",
      "Search failed",
    ]);
    expect(words.USE_MATCH).toBe("Use this match");
    expect(words.noMatchCount(1)).toBe("1 no match");
    expect(words.noMatchCount(12)).toBe("12 no match");
  });
});

describe("other shared words", () => {
  it("names the actions once", () => {
    expect(words.ADD_TO_BEATPORT_PLAYLIST).toBe("Add to a Beatport playlist…");
    expect(words.COPY_VALUES).toBe("Copy");
    expect(words.CHECK_FOR_CHANGES).toBe("Check for changes");
    expect(words.TRY_AGAIN).toBe("Try again");
    expect(words.CREATE).toBe("Create");
    expect(words.ARTWORK).toBe("Artwork");
    expect(words.KEY_NOTATION).toBe("Key notation");
    expect(words.STATUS_STRIP).toBe("status strip");
    expect(words.BACK).toBe("Back");
    expect(words.SHOW_LESS).toBe("Show less");
    expect(words.showAll(24)).toBe("Show all 24");
    expect(words.showAll(1234, "en-US")).toBe("Show all 1,234");
  });

  it("writes a delete question and a could-not sentence around the name", () => {
    expect(words.deleteTitle("Set", "Warm-up")).toBe("Delete “Warm-up”?");
    expect(words.deleteTitle("Set")).toBe("Delete Set?");
    expect(words.deleteLead).toBe("This cannot be undone.");
    expect(words.couldNot("rename", "Warm-up")).toBe("Could not rename “Warm-up”.");
    expect(words.couldNot("clear the cache")).toBe("Could not clear the cache.");
  });

  it("has one sentence for each empty list and one undo toast", () => {
    // Empty-state headlines and toasts carry no full stop (C163).
    expect(words.NO_COLLECTIONS).toBe("No Collections yet");
    expect(words.NO_SETS).toBe("No Sets yet");
    expect(words.removedFrom(3, "Warm-up")).toBe("Removed 3 tracks from “Warm-up”");
    expect(words.removedFrom(1, "Warm-up")).toBe("Removed 1 track from “Warm-up”");
  });

  it("does not quote a name that is already quoted", () => {
    expect(words.quoted("“Warm-up”")).toBe("“Warm-up”");
    expect(words.couldNot("rename", "“Warm-up”")).toBe("Could not rename “Warm-up”.");
    expect(words.deleteTitle("Set", "“Warm-up”")).toBe("Delete “Warm-up”?");
    expect(words.quoted("Warm-up")).toBe("“Warm-up”");
  });
});

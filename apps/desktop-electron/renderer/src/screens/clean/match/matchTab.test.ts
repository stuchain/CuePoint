/** The Match area's remembered tab, and the caption of its one row (D13, C218). */
import { beforeEach, describe, expect, it } from "vitest";

import { MATCH_TAB_STORAGE_KEY, loadMatchTab, saveMatchTab, stepCaption } from "./matchTab";

beforeEach(() => localStorage.clear());

describe("the remembered tab", () => {
  it("opens Playlists with nothing stored", () => {
    expect(loadMatchTab()).toBe("playlists");
  });

  it("remembers Past searches", () => {
    saveMatchTab("past");
    expect(loadMatchTab()).toBe("past");
  });

  it("opens Playlists for a stored review tab, which no longer exists", () => {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "review");
    expect(loadMatchTab()).toBe("playlists");
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, "review:3");
    expect(loadMatchTab()).toBe("playlists");
  });
});

describe("the step caption", () => {
  it("names step 1 on the list", () => {
    expect(stepCaption("playlists", false)).toBe("Step 1 of 3 · Tick playlists");
  });

  it("names step 2 while a match runs", () => {
    expect(stepCaption("playlists", true)).toBe("Step 2 of 3 · Matching");
  });

  it("names step 3 on a review, with what is checked", () => {
    expect(stepCaption("review", false, "Fresh picks")).toBe("Step 3 of 3 · Check and sync Fresh picks");
    expect(stepCaption("review", true, "Fresh picks")).toBe("Step 3 of 3 · Check and sync Fresh picks");
  });

  it("says nothing on Past searches, which is not a step", () => {
    expect(stepCaption("past", false)).toBeNull();
  });
});

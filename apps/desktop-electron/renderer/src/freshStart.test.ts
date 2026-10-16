import { beforeEach, describe, expect, it } from "vitest";
import { applyFreshStart } from "./freshStart";
import { loadCleanSection, saveCleanSection } from "./screens/clean/cleanSections";
import { loadMatchTab, saveMatchTab } from "./screens/clean/match/matchTab";
import { loadDiscoverSection, saveDiscoverSection } from "./screens/discover/discoverSections";

describe("a fresh app start", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("opens Clean on Match → Playlists and Discover on New dig, whatever was left", () => {
    saveCleanSection("duplicates");
    saveMatchTab("past");
    saveDiscoverSection("wantlist");

    applyFreshStart();

    expect(loadCleanSection()).toBe("review");
    expect(loadMatchTab()).toBe("playlists");
    expect(loadDiscoverSection()).toBe("new");
  });

  it("leaves the tabs free to change afterwards (a session keeps its state)", () => {
    applyFreshStart();
    saveDiscoverSection("results");
    expect(loadDiscoverSection()).toBe("results");
  });

  it("applies once per launch: a renderer reload mid-session keeps the tabs (B9)", () => {
    applyFreshStart();
    saveCleanSection("duplicates");
    saveMatchTab("past");
    saveDiscoverSection("wantlist");

    applyFreshStart(); // the reload runs it again

    expect(loadCleanSection()).toBe("duplicates");
    expect(loadMatchTab()).toBe("past");
    expect(loadDiscoverSection()).toBe("wantlist");
  });
});

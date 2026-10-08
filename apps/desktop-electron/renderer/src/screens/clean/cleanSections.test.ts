import type { LibraryHealth } from "../../api/cuepointBridge.types";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLEAN_SECTIONS,
  CLEAN_INTROS,
  CLEAN_SECTION_STORAGE_KEY,
  sectionCounts,
  loadCleanSection,
  saveCleanSection,
} from "./cleanSections";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the Clean page's parts", () => {
  it("are the CLN-3 names, in order", () => {
    expect(CLEAN_SECTIONS.map((section) => section.label)).toEqual([
      "Review matches",
      "Missing files",
      "Duplicates",
      "Health",
    ]);
  });

  it("open on Review the first time", () => {
    expect(loadCleanSection()).toBe("review");
  });

  it("reopen on the part last used", () => {
    saveCleanSection("duplicates");
    expect(localStorage.getItem(CLEAN_SECTION_STORAGE_KEY)).toBe("duplicates");
    expect(loadCleanSection()).toBe("duplicates");
  });

  it("open on Review when what was stored is not a part", () => {
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, "inkey");
    expect(loadCleanSection()).toBe("review");
  });

  it("work when storage cannot be used", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadCleanSection()).toBe("review");
    expect(() => saveCleanSection("health")).not.toThrow();
  });
});

function health(
  counts: Record<string, number>,
  ranAt: Record<string, string | null> = {},
): LibraryHealth {
  return {
    track_count: 100,
    counts: Object.entries(counts).map(([id, count]) => ({
      id,
      label: id,
      count,
      rules: { match: "all", rules: [] },
    })),
    detections: ["files", "duplicates"].map((id) => ({
      id,
      label: id,
      job_type: id,
      last_run_at: ranAt[id] ?? null,
      last_summary: null,
    })),
    unavailable_roots: [],
  } as LibraryHealth;
}

describe("the work counts on the tabs (CLN-3)", () => {
  const ran = { files: "2026-10-01T10:00:00Z", duplicates: "2026-10-01T10:00:00Z" };

  it("add what waits for you to what changed since you decided", () => {
    const counts = sectionCounts(
      health({ needs_review: 40, disputed: 2, missing_files: 3, duplicates: 5 }, ran),
    );
    expect(counts).toEqual({ review: 42, missing: 3, duplicates: 5 });
  });

  it("show no number at zero", () => {
    expect(
      sectionCounts(health({ needs_review: 0, disputed: 0, missing_files: 0, duplicates: 0 }, ran)),
    ).toEqual({});
  });

  it("show none for a check that has never run", () => {
    const counts = sectionCounts(
      health({ needs_review: 1, disputed: 0, missing_files: 9, duplicates: 9 }),
    );
    expect(counts).toEqual({ review: 1 });
  });

  it("show none before Health has answered", () => {
    expect(sectionCounts(null)).toEqual({});
  });
});

describe("the intro line of every part (CLN-1)", () => {
  it("is one sentence for each", () => {
    for (const section of CLEAN_SECTIONS) expect(CLEAN_INTROS[section.id]).toBeTruthy();
    expect(CLEAN_INTROS.review).toBe(
      "CuePoint looks each track up on Beatport. Sure matches are accepted for you; the rest wait here for a yes or no.",
    );
  });
});

/**
 * The Clean page's empty states, from real engine responses (CLEAN-12).
 *
 * `cleanEmpty.fixture.json` is produced by
 * `src/tests/unit/engine/test_clean_empty_state_fixture.py`, which walks a real
 * engine through each state. These tests fail if the renderer stops telling
 * the states apart, and that one fails if the engine stops answering them.
 */
import { describe, expect, it } from "vitest";

import type { DuplicateGroupList, LibraryHealth } from "../../api/cuepointBridge.types";
import fixture from "./cleanEmpty.fixture.json";
import { duplicatesEmptyState, missingEmptyState, reviewEmptyState } from "./cleanEmpty";

const UNTOUCHED = fixture.untouched.health as LibraryHealth;
const CHECKED = fixture.checked.health as LibraryHealth;
const SCANNED = fixture.scanned.health as LibraryHealth;
const MATCHED = fixture.matched.health as LibraryHealth;

describe("the review queue with nothing in it", () => {
  it("says nothing is matched yet, and offers what is not", () => {
    expect(fixture.untouched.needs_review.total).toBe(0);
    const view = reviewEmptyState({
      scope: "needs_review",
      scoped: false,
      health: UNTOUCHED,
      error: null,
    });
    expect(view.headline).toBe("Nothing is matched yet.");
    expect(view.offer).toBe("show_not_matched");
  });

  it("says nothing needs review once everything was matched", () => {
    expect(fixture.matched.needs_review.total).toBe(0);
    const view = reviewEmptyState({
      scope: "needs_review",
      scoped: false,
      health: MATCHED,
      error: null,
    });
    expect(view.headline).toBe("Nothing needs review.");
    expect(view.offer).toBeNull();
  });

  it("does not claim nothing is matched about a playlist", () => {
    // Health counts the library; a playlist can be unmatched inside one that is.
    const view = reviewEmptyState({
      scope: "needs_review",
      scoped: true,
      health: UNTOUCHED,
      error: null,
    });
    expect(view.headline).toBe("Nothing needs review here.");
  });

  it("does not tell a not-matched queue that nothing is matched", () => {
    const view = reviewEmptyState({
      scope: "not_matched",
      scoped: false,
      health: UNTOUCHED,
      error: null,
    });
    expect(view.headline).toBe("Every track has been matched.");
  });

  it.each([
    ["disputed", "Nothing is disputed."],
    ["accepted", "Nothing is accepted."],
    ["rejected", "Nothing is rejected."],
    ["no_match", "Every match found something."],
  ] as const)("says what an empty %s queue means", (scope, headline) => {
    expect(reviewEmptyState({ scope, scoped: false, health: MATCHED, error: null }).headline).toBe(
      headline,
    );
  });

  it("shows the engine's refusal before anything else", () => {
    const view = reviewEmptyState({
      scope: "needs_review",
      scoped: false,
      health: UNTOUCHED,
      error: "match_state cannot be sorted",
    });
    expect(view).toEqual({ headline: "match_state cannot be sorted", hint: null, offer: null });
  });

  it("claims nothing before Health has answered", () => {
    const view = reviewEmptyState({ scope: "needs_review", scoped: false, health: null, error: null });
    expect(view.headline).toBe("Nothing needs review.");
  });
});

describe("missing files with nothing in them", () => {
  it("says files were never checked, and offers to check", () => {
    expect(fixture.untouched.missing_files.total).toBe(0);
    const view = missingEmptyState(UNTOUCHED, null);
    expect(view.headline).toBe("Files have not been checked yet.");
    expect(view.offer).toBe("check_files");
  });

  it("says no file is missing once a check found them all", () => {
    expect(fixture.checked.missing_files.total).toBe(0);
    const view = missingEmptyState(CHECKED, null);
    expect(view.headline).toBe("No missing files.");
    expect(view.offer).toBeNull();
    expect(view.hint).toMatch(/last checked/);
  });

  it("shows a refusal as itself", () => {
    expect(missingEmptyState(CHECKED, "No").headline).toBe("No");
  });
});

describe("duplicates with none found", () => {
  it("says they were never looked for, and offers to look", () => {
    expect((fixture.untouched.duplicates as DuplicateGroupList).groups).toEqual([]);
    const view = duplicatesEmptyState(UNTOUCHED, null, false);
    expect(view.headline).toBe("Duplicates have not been looked for yet.");
    expect(view.offer).toBe("find_duplicates");
  });

  it("says there are none once a scan found none", () => {
    expect((fixture.scanned.duplicates as DuplicateGroupList).total).toBe(0);
    const view = duplicatesEmptyState(SCANNED, null, false);
    expect(view.headline).toBe("No possible duplicates.");
    expect(view.offer).toBeNull();
  });

  it("mentions dismissed groups when they are being shown", () => {
    expect(duplicatesEmptyState(SCANNED, null, true).hint).toMatch(/not duplicates/);
  });
});

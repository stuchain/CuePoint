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
import { duplicatesEmptyState, missingEmptyState } from "./cleanEmpty";

const UNTOUCHED = fixture.untouched.health as LibraryHealth;
const CHECKED = fixture.checked.health as LibraryHealth;
const SCANNED = fixture.scanned.health as LibraryHealth;

describe("missing files with nothing in them", () => {
  it("says files were never checked, and offers to check", () => {
    expect(fixture.untouched.missing_files.total).toBe(0);
    const view = missingEmptyState(UNTOUCHED, null);
    expect(view.headline).toBe("Files have not been checked yet");
    expect(view.offer).toBe("check_files");
  });

  it("says no file is missing once a check found them all", () => {
    expect(fixture.checked.missing_files.total).toBe(0);
    const view = missingEmptyState(CHECKED, null);
    expect(view.headline).toBe("No missing files");
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
    expect(view.headline).toBe("Duplicates have not been looked for yet");
    expect(view.offer).toBe("find_duplicates");
  });

  it("says there are none once a scan found none", () => {
    expect((fixture.scanned.duplicates as DuplicateGroupList).total).toBe(0);
    const view = duplicatesEmptyState(SCANNED, null, false);
    expect(view.headline).toBe("No possible duplicates");
    expect(view.offer).toBeNull();
  });

  it("mentions dismissed groups when they are being shown", () => {
    expect(duplicatesEmptyState(SCANNED, null, true).hint).toMatch(/not duplicates/);
  });
});

/**
 * DEC-027's launch rule.
 *
 * The three fallback cases are the point of these tests. A stored destination
 * that no longer exists, or that exists but is disabled, must land on home —
 * the alternative is an empty content area, which is precisely the failure
 * SHELL-03 exists to fix, and it would be invisible to a test that only checked
 * the happy path.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  destinationToRemember,
  LAST_DESTINATION_STORAGE_KEY,
  loadLastDestinationId,
  resolveLaunchDestination,
  saveLastDestinationId,
} from "./lastDestination";
import { HOME_DESTINATION_ID, NAV_DESTINATIONS } from "./navRegistry";

/**
 * The real registry now declares not-yet-built destinations (DEC-020), so the
 * disabled cases below run against real data rather than a fixture.
 */
const DISABLED_ID = "library";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("resolveLaunchDestination", () => {
  it("returns the stored destination when it exists and is enabled", () => {
    expect(resolveLaunchDestination("settings").id).toBe("settings");
  });

  it("falls back to home when nothing is stored", () => {
    expect(resolveLaunchDestination(null).id).toBe(HOME_DESTINATION_ID);
  });

  it("falls back to home when the stored destination no longer exists", () => {
    expect(resolveLaunchDestination("a-page-that-was-removed").id).toBe(HOME_DESTINATION_ID);
  });

  it("falls back to home when the stored destination exists but is disabled", () => {
    // The case that actually happens: a downgrade, or a phase's flag turned
    // off, leaving a valid id pointing at something unreachable.
    expect(resolveLaunchDestination(DISABLED_ID).id).toBe(HOME_DESTINATION_ID);
  });

  it("never returns a destination that is not enabled", () => {
    for (const destination of NAV_DESTINATIONS) {
      expect(resolveLaunchDestination(destination.id).enabled).toBe(true);
    }
  });
});

describe("destinationToRemember", () => {
  it("remembers a known destination", () => {
    expect(destinationToRemember("/results")?.id).toBe("results");
  });

  it("does not remember an unmatched path", () => {
    // Reopening on a path that renders the fallback would be remembering a
    // mistake.
    expect(destinationToRemember("/not-a-page")).toBeNull();
  });

  it("does not remember a disabled destination", () => {
    expect(destinationToRemember("/library")).toBeNull();
  });
});

describe("storage", () => {
  it("round-trips the stored id", () => {
    saveLastDestinationId("incrate");
    expect(localStorage.getItem(LAST_DESTINATION_STORAGE_KEY)).toBe("incrate");
    expect(loadLastDestinationId()).toBe("incrate");
  });

  it("returns null when nothing is stored", () => {
    expect(loadLastDestinationId()).toBeNull();
  });

  it("survives storage that throws", () => {
    // Private windows and locked-down platforms make these throw outright.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(() => saveLastDestinationId("results")).not.toThrow();
    expect(loadLastDestinationId()).toBeNull();
    expect(resolveLaunchDestination(loadLastDestinationId()).id).toBe(HOME_DESTINATION_ID);
  });
});

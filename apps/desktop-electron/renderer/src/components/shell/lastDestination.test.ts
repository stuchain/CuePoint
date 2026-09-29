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
import { HOME_DESTINATION_ID, NAV_DESTINATIONS, RETIRED_DESTINATIONS } from "./navRegistry";

/**
 * The disabled cases, against the real registry with one flag turned off.
 *
 * They ran against the real registry's own disabled destinations while there
 * were any: Discover until DISCOVER-10, then Prepare. PREP-10 enabled Prepare,
 * the last of DEC-020's pages, so nothing is disabled any more. The case is
 * still real, a downgrade or a phase's flag turned off, so it is the real
 * registry with Prepare turned off rather than a list invented for the test.
 */
const DISABLED_ID = "prepare";
const WITH_DISABLED = NAV_DESTINATIONS.map((destination) =>
  destination.id === DISABLED_ID ? { ...destination, enabled: false } : destination,
);

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

  it("opens the Library when nothing is stored (DEC-100)", () => {
    // Home was Tools' landing page until DISCOVER-12.
    expect(resolveLaunchDestination(null).id).toBe("library");
  });

  it("falls back to home when the stored destination no longer exists", () => {
    expect(resolveLaunchDestination("a-page-that-was-removed").id).toBe(HOME_DESTINATION_ID);
  });

  it("falls back to home when the stored destination exists but is disabled", () => {
    // The case that actually happens: a downgrade, or a phase's flag turned
    // off, leaving a valid id pointing at something unreachable.
    expect(resolveLaunchDestination(DISABLED_ID, WITH_DISABLED).id).toBe(HOME_DESTINATION_ID);
  });

  it("never returns a destination that is not enabled", () => {
    for (const destination of NAV_DESTINATIONS) {
      expect(resolveLaunchDestination(destination.id).enabled).toBe(true);
    }
  });
});

describe("a page that was retired (DEC-071, DEC-100)", () => {
  it("reopens on Clean for someone who was last on inKey", () => {
    expect(resolveLaunchDestination("match").id).toBe("clean");
  });

  it("reopens on Clean for someone who was last on Results", () => {
    expect(resolveLaunchDestination("results").id).toBe("clean");
  });

  it("reopens on Discover for someone who was last on inCrate", () => {
    expect(resolveLaunchDestination("incrate").id).toBe("discover");
  });

  it("reopens on the Library for someone who was last on Tools", () => {
    expect(resolveLaunchDestination("tools").id).toBe("library");
  });

  it("resolves every retired id to the enabled page that replaced it", () => {
    // Its replacement, not merely home: Tools' happens to be home, and the
    // others must not fall through to it.
    for (const retired of RETIRED_DESTINATIONS) {
      const page = resolveLaunchDestination(retired.id);
      expect(page.enabled).toBe(true);
      expect(page.pageId).toBeUndefined();
      expect(page.id).toBe(retired.replacedBy);
    }
  });

  it("does not remember a retired path; the redirect's page is remembered", () => {
    // The router sends /match on to /clean, and /clean is what gets stored.
    expect(destinationToRemember("/match")).toBeNull();
    expect(destinationToRemember("/results")).toBeNull();
    expect(destinationToRemember("/incrate")).toBeNull();
    expect(destinationToRemember("/")).toBeNull();
  });

  it("reads a retired id from storage and still lands on Clean", () => {
    localStorage.setItem(LAST_DESTINATION_STORAGE_KEY, "match");
    expect(resolveLaunchDestination(loadLastDestinationId()).id).toBe("clean");
  });

  it.each([
    ["incrate", "discover"],
    ["tools", "library"],
  ])("reads a remembered %s from storage and lands on %s", (stored, page) => {
    localStorage.setItem(LAST_DESTINATION_STORAGE_KEY, stored);
    expect(resolveLaunchDestination(loadLastDestinationId()).id).toBe(page);
  });
});

describe("destinationToRemember", () => {
  it("remembers a known destination", () => {
    expect(destinationToRemember("/settings")?.id).toBe("settings");
  });

  it("does not remember an unmatched path", () => {
    // Reopening on a path that renders the fallback would be remembering a
    // mistake.
    expect(destinationToRemember("/not-a-page")).toBeNull();
  });

  it("does not remember a disabled destination", () => {
    expect(destinationToRemember("/prepare", WITH_DISABLED)).toBeNull();
    expect(destinationToRemember("/prepare/12", WITH_DISABLED)).toBeNull();
  });

  it("remembers Prepare, never the Set open on it (PREP-10)", () => {
    // A Set is a page of the destination, as an Artist page is of Discover:
    // the app reopens on Prepare, and Prepare reopens its own last Set.
    expect(destinationToRemember("/prepare")?.id).toBe("prepare");
    expect(destinationToRemember("/prepare/12")?.id).toBe("prepare");
    expect(resolveLaunchDestination("prepare").id).toBe("prepare");
  });

  it("remembers Discover now that it is a page (DISCOVER-10)", () => {
    expect(destinationToRemember("/discover")?.id).toBe("discover");
    expect(resolveLaunchDestination("discover").id).toBe("discover");
  });

  it("remembers Clean now that it is a page (CLEAN-12)", () => {
    expect(destinationToRemember("/clean")?.id).toBe("clean");
  });
});

/**
 * DEC-062's rule: the Library page has two sidebar entries and one identity.
 *
 * Collections is a way in, aimed at the tree. If it were remembered as itself,
 * the app would reopen pointing at a tree the user last looked at an hour of
 * browsing ago — and which of the two ids "where I was" meant would depend on
 * which link was clicked, not on where the user actually spent the session.
 */
describe("one page, not two ids (DEC-062)", () => {
  it("remembers the Library page when the user came in through Collections", () => {
    expect(destinationToRemember("/collections")?.id).toBe("library");
  });

  it("remembers the Library page when the user came in through Library", () => {
    expect(destinationToRemember("/library")?.id).toBe("library");
  });

  it("never remembers an id that is only a way into another page", () => {
    // The property, rather than the one case: every path in the registry
    // remembers something that owns its own page.
    for (const destination of NAV_DESTINATIONS) {
      const remembered = destinationToRemember(destination.path);
      if (remembered) expect(remembered.pageId).toBeUndefined();
    }
  });

  it("opens the page when an older build stored the way in", () => {
    // Nothing this build writes can be "collections", but a hand-edited value
    // or a downgrade could be, and it must not reopen on a focus gesture.
    expect(resolveLaunchDestination("collections").id).toBe("library");
  });

  it("resolves every stored id to something that owns its own page", () => {
    for (const destination of NAV_DESTINATIONS) {
      expect(resolveLaunchDestination(destination.id).pageId).toBeUndefined();
    }
  });
});

describe("storage", () => {
  it("round-trips the stored id", () => {
    saveLastDestinationId("discover");
    expect(localStorage.getItem(LAST_DESTINATION_STORAGE_KEY)).toBe("discover");
    expect(loadLastDestinationId()).toBe("discover");
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

    expect(() => saveLastDestinationId("discover")).not.toThrow();
    expect(loadLastDestinationId()).toBeNull();
    expect(resolveLaunchDestination(loadLastDestinationId()).id).toBe(HOME_DESTINATION_ID);
  });
});

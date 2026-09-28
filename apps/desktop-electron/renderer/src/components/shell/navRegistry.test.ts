/**
 * The registry is the single source of destinations (DEC-020). These tests
 * protect the properties the routes, the fallback rule and the sidebar all
 * rely on.
 *
 * They assert against the real registry rather than a fixture wherever they
 * can: the whole point of DEC-020 is that the real list is the contract, and a
 * fixture would keep passing while the real one drifted.
 */
import { describe, expect, it } from "vitest";

import {
  enabledDestinations,
  findDestinationById,
  findDestinationByPath,
  groupedDestinations,
  homeDestination,
  HOME_DESTINATION_ID,
  NAV_DESTINATIONS,
  NAV_GROUPS,
  pageDestination,
  replacementFor,
  RETIRED_DESTINATIONS,
  retiredRedirects,
  type NavDestination,
  type RetiredDestination,
} from "./navRegistry";

describe("navRegistry", () => {
  it("declares unique ids", () => {
    const ids = NAV_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares unique paths", () => {
    // Two destinations on one path would make the stored id ambiguous when
    // reopening, and would make two sidebar entries light up at once.
    const paths = NAV_DESTINATIONS.map((d) => d.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("gives every destination a known group", () => {
    for (const destination of NAV_DESTINATIONS) {
      expect(NAV_GROUPS).toContain(destination.group);
    }
  });

  it("gives every destination a pixel icon, not a glyph (SHELL-09)", () => {
    // The DoD for SHELL-09: no Unicode glyphs left in primary navigation. The
    // icon-or-glyph union stays for secondary controls, which is what DEC-010
    // reserved it for.
    for (const destination of NAV_DESTINATIONS) {
      expect(destination.glyph).toBeUndefined();
      expect(destination.icon).toBeDefined();
    }
  });

  it("gives every destination exactly one of an icon or a glyph", () => {
    // The union makes "neither" a compile error, but "both" is expressible via
    // a cast and would render an icon while claiming a glyph.
    for (const destination of NAV_DESTINATIONS) {
      expect(Boolean(destination.icon) !== Boolean(destination.glyph)).toBe(true);
    }
  });

  it("declares a home destination that is enabled", () => {
    expect(homeDestination().id).toBe(HOME_DESTINATION_ID);
    expect(homeDestination().enabled).toBe(true);
  });

  it("makes the Library home (DEC-100)", () => {
    // Tools' landing page put a click between the user and their library on
    // every launch that fell back to it.
    expect(HOME_DESTINATION_ID).toBe("library");
    expect(homeDestination().path).toBe("/library");
  });

  it("throws when the home destination is missing", () => {
    // A shell that cannot resolve home renders nothing; better to fail loudly.
    const withoutHome: NavDestination[] = [
      { id: "x", label: "X", path: "/x", group: "workspace", glyph: "x", enabled: true },
    ];
    expect(() => homeDestination(withoutHome)).toThrow(/Home destination/);
  });

  it("declares the whole target IA, built or not", () => {
    // DEC-020: declared now, rendered when the phase that builds it flips the
    // flag. If these disappear, the registry has stopped describing the target.
    const declared = NAV_DESTINATIONS.map((d) => d.id);
    for (const id of ["library", "collections", "clean", "discover", "prepare"]) {
      expect(declared).toContain(id);
    }
  });

  it("still has the not-yet-built destinations turned off", () => {
    // Library came on in LIBRARY-11, Collections in ORG-13, Clean in CLEAN-12
    // and Discover in DISCOVER-10; Prepare waits for its phase.
    expect(findDestinationById("prepare")?.enabled).toBe(false);
  });

  it("has Discover enabled, in the workspace, as its own page (DISCOVER-10)", () => {
    const discover = findDestinationById("discover")!;
    expect(discover.enabled).toBe(true);
    expect(discover.group).toBe("workspace");
    expect(discover.path).toBe("/discover");
    expect(discover.icon).toBe("discover");
    expect(pageDestination(discover).id).toBe("discover");
  });

  it("renders exactly what has been built", () => {
    // Tools and inCrate retired in DISCOVER-12 (DEC-100).
    const enabled = enabledDestinations().map((d) => d.id);
    expect(enabled).toEqual(["library", "collections", "clean", "discover", "settings"]);
  });

  describe("a destination that renders another's page (DEC-062)", () => {
    it("sends Collections to the Library page", () => {
      // Not a second browser: DEC-062 amended DEC-020 so CuePoint's own tree
      // is browsed beside the Rekordbox mirror, with one table under both.
      const collections = findDestinationById("collections")!;
      expect(collections.pageId).toBe("library");
      expect(pageDestination(collections).id).toBe("library");
    });

    it("leaves a destination that is its own page alone", () => {
      for (const id of ["library", "clean", "discover", "settings"]) {
        const destination = findDestinationById(id)!;
        expect(destination.pageId).toBeUndefined();
        expect(pageDestination(destination).id).toBe(id);
      }
    });

    it("never points at a page that is not declared", () => {
      // A typo here would be a sidebar entry that leads to the fallback and a
      // launch memory that stores an id nothing can resolve.
      for (const destination of NAV_DESTINATIONS) {
        if (!destination.pageId) continue;
        expect(findDestinationById(destination.pageId)).not.toBeNull();
      }
    });

    it("never points at a page that is not enabled", () => {
      // An entry point into a page nobody can reach is a link to nowhere.
      for (const destination of enabledDestinations()) {
        expect(pageDestination(destination).enabled).toBe(true);
      }
    });

    it("never chains: a page is a page, not another entry point", () => {
      // One hop is a rule that can be read; two is a graph, and `pageId` is
      // deliberately not one.
      for (const destination of NAV_DESTINATIONS) {
        expect(pageDestination(destination).pageId).toBeUndefined();
      }
    });

    it("falls back to itself when the page it names is gone", () => {
      const orphan = [
        { ...findDestinationById("collections")!, pageId: "a-page-that-was-removed" },
      ];
      // A sidebar row that leads somewhere beats a shell that will not mount;
      // the typo is caught by the test above, not by a crash in front of a user.
      expect(pageDestination(orphan[0]!, orphan).id).toBe("collections");
    });
  });

  it("puts Collections in the workspace group beside Library (DEC-062)", () => {
    expect(findDestinationById("collections")?.group).toBe("workspace");
    expect(findDestinationById("collections")?.path).toBe("/collections");
  });

  it("has no Tools group and no inCrate (DEC-100)", () => {
    expect(NAV_GROUPS).toEqual(["workspace", "system"]);
    const declared = NAV_DESTINATIONS.map((d) => d.id);
    expect(declared).not.toContain("tools");
    expect(declared).not.toContain("incrate");
    const labels = NAV_DESTINATIONS.map((d) => d.label);
    expect(labels).not.toContain("Tools");
    expect(labels).not.toContain("inCrate");
    expect(findDestinationByPath("/")).toBeNull();
    expect(findDestinationByPath("/incrate")).toBeNull();
  });

  it("no longer carries inKey or Results (DEC-071)", () => {
    const declared = NAV_DESTINATIONS.map((d) => d.id);
    expect(declared).not.toContain("match");
    expect(declared).not.toContain("results");
    expect(NAV_DESTINATIONS.map((d) => d.label)).not.toContain("inKey");
    expect(findDestinationByPath("/match")).toBeNull();
    expect(findDestinationByPath("/results")).toBeNull();
  });

  it("looks destinations up by id and by path", () => {
    expect(findDestinationById("discover")?.path).toBe("/discover");
    expect(findDestinationByPath("/discover")?.id).toBe("discover");
  });

  it("returns null for unknown lookups", () => {
    expect(findDestinationById("nope")).toBeNull();
    expect(findDestinationById(null)).toBeNull();
    expect(findDestinationByPath("/nope")).toBeNull();
  });

  it("does not treat a path with a query string as a match", () => {
    // Callers pass a pathname; `/results?filter=needs_review` is still Results
    // and the caller strips the query, so an accidental full-URL lookup must
    // not silently half-work.
    expect(findDestinationByPath("/library?q=house")).toBeNull();
  });
});

describe("retired destinations (DEC-071, DEC-100)", () => {
  it("sends inKey and Results to Clean", () => {
    expect(replacementFor("match")?.id).toBe("clean");
    expect(replacementFor("results")?.id).toBe("clean");
  });

  it("sends inCrate to Discover, and Tools to the Library (DEC-100)", () => {
    expect(replacementFor("incrate")?.id).toBe("discover");
    expect(replacementFor("tools")?.id).toBe("library");
  });

  it("gives the router one redirect per retired path", () => {
    expect(retiredRedirects()).toEqual([
      { id: "match", from: "/match", to: "/clean" },
      { id: "results", from: "/results", to: "/clean" },
      { id: "incrate", from: "/incrate", to: "/discover" },
      { id: "tools", from: "/", to: "/library" },
    ]);
  });

  it("never reuses a live destination's id or path", () => {
    // A retired entry that shadowed a live one would redirect a real page away.
    const ids = new Set(NAV_DESTINATIONS.map((d) => d.id));
    const paths = new Set(NAV_DESTINATIONS.map((d) => d.path));
    for (const retired of RETIRED_DESTINATIONS) {
      expect(ids.has(retired.id)).toBe(false);
      expect(paths.has(retired.path)).toBe(false);
    }
  });

  it("names a replacement that is declared and enabled", () => {
    for (const retired of RETIRED_DESTINATIONS) {
      expect(findDestinationById(retired.replacedBy)?.enabled).toBe(true);
    }
  });

  it("answers nothing for an id that was never retired", () => {
    expect(replacementFor("library")).toBeNull();
    expect(replacementFor("nope")).toBeNull();
    expect(replacementFor(null)).toBeNull();
  });

  it("does not redirect to a replacement that is switched off", () => {
    // A downgrade, or a phase flag turned off: home is better than a route to
    // a page nothing renders.
    const retired: RetiredDestination[] = [{ id: "old", path: "/old", replacedBy: "new" }];
    const destinations: NavDestination[] = [
      { id: "library", label: "Library", path: "/library", group: "workspace", icon: "library", enabled: true },
      { id: "new", label: "New", path: "/new", group: "workspace", icon: "clean", enabled: false },
    ];
    expect(replacementFor("old", destinations, retired)).toBeNull();
    expect(retiredRedirects(destinations, retired)).toEqual([]);
  });
});

describe("groupedDestinations", () => {
  it("returns groups in declared order", () => {
    const groups = groupedDestinations().map((entry) => entry.group);
    expect(groups).toEqual([...groups].sort((a, b) => NAV_GROUPS.indexOf(a) - NAV_GROUPS.indexOf(b)));
  });

  it("drops groups with nothing enabled in them", () => {
    // A group with everything in it disabled must not render as an empty
    // heading with a divider under it. Asserted through the list-argument seam
    // rather than against the live registry, which has had an enabled
    // workspace destination since LIBRARY-11.
    const noWorkspace = NAV_DESTINATIONS.map((d) =>
      d.group === "workspace" ? { ...d, enabled: false } : d,
    );
    expect(groupedDestinations(noWorkspace).map((entry) => entry.group)).toEqual(["system"]);
  });

  it("contains only enabled destinations", () => {
    for (const entry of groupedDestinations()) {
      for (const destination of entry.destinations) {
        expect(destination.enabled).toBe(true);
      }
    }
  });

  it("includes every enabled destination exactly once", () => {
    const grouped = groupedDestinations().flatMap((entry) => entry.destinations.map((d) => d.id));
    expect([...grouped].sort()).toEqual(enabledDestinations().map((d) => d.id).sort());
  });

  it("shows a workspace group as soon as one of its destinations is enabled", () => {
    // The one-flag promise of DEC-020, which LIBRARY-11 collected: turning
    // Library on is the whole of what it took to give the sidebar a Workspace
    // group. Driven from an all-disabled list so the test still shows the
    // transition rather than restating today's registry.
    const noWorkspace = NAV_DESTINATIONS.map((d) =>
      d.group === "workspace" ? { ...d, enabled: false } : d,
    );
    expect(groupedDestinations(noWorkspace).map((e) => e.group)).not.toContain("workspace");

    const withLibrary = noWorkspace.map((d) =>
      d.id === "library" ? { ...d, enabled: true } : d,
    );
    const entries = groupedDestinations(withLibrary);

    expect(entries.map((entry) => entry.group)).toEqual(["workspace", "system"]);
    expect(entries[0]?.destinations.map((d) => d.id)).toEqual(["library"]);
  });
});

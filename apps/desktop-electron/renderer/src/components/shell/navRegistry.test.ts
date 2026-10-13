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
  EMPTY_LIBRARY_HINT,
  HOME_DESTINATION_ID,
  NAV_DESTINATIONS,
  NAV_GROUPS,
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
      { id: "x", label: "X", hint: "x", path: "/x", group: "workspace", glyph: "x", enabled: true },
    ];
    expect(() => homeDestination(withoutHome)).toThrow(/Home destination/);
  });

  it("declares the whole target IA, built or not", () => {
    // DEC-020: declared now, rendered when the phase that builds it flips the
    // flag. If these disappear, the registry has stopped describing the target.
    const declared = NAV_DESTINATIONS.map((d) => d.id);
    for (const id of ["library", "clean", "discover", "prepare"]) {
      expect(declared).toContain(id);
    }
  });

  it("has every declared destination built (PREP-10)", () => {
    // Library came on in LIBRARY-11, Clean in CLEAN-12, Discover in
    // DISCOVER-10 and Prepare, the last, in PREP-10.
    expect(NAV_DESTINATIONS.filter((d) => !d.enabled)).toEqual([]);
  });

  it("has Prepare enabled, in the workspace, with its Sets as its pages (PREP-10)", () => {
    const prepare = findDestinationById("prepare")!;
    expect(prepare.enabled).toBe(true);
    expect(prepare.group).toBe("workspace");
    expect(prepare.path).toBe("/prepare");
    expect(prepare.icon).toBe("prepare");
    // `/prepare/:setId` keeps Prepare lit and is remembered as Prepare.
    expect(prepare.nested).toBe(true);
  });

  it("has Statistics enabled after Prepare, in the workspace, as its own page (STATS-04)", () => {
    const statistics = findDestinationById("statistics")!;
    expect(statistics.enabled).toBe(true);
    expect(statistics.group).toBe("workspace");
    expect(statistics.path).toBe("/statistics");
    expect(statistics.icon).toBe("statistics");
    const ids = NAV_DESTINATIONS.map((d) => d.id);
    expect(ids.indexOf("statistics")).toBe(ids.indexOf("prepare") + 1);
  });

  it("has Discover enabled, in the workspace, as its own page (DISCOVER-10)", () => {
    const discover = findDestinationById("discover")!;
    expect(discover.enabled).toBe(true);
    expect(discover.group).toBe("workspace");
    expect(discover.path).toBe("/discover");
    expect(discover.icon).toBe("discover");
  });

  it("renders exactly what has been built", () => {
    // Tools and inCrate retired in DISCOVER-12 (DEC-100).
    const enabled = enabledDestinations().map((d) => d.id);
    expect(enabled).toEqual(["library", "keys", "clean", "discover", "prepare", "statistics", "settings"]);
  });

  describe("Collections left the sidebar (DEC-244)", () => {
    it("is no longer a destination", () => {
      expect(findDestinationById("collections")).toBeNull();
      expect(findDestinationByPath("/collections")).toBeNull();
    });

    it("is retired to the Library, so old links and a stored id land there", () => {
      expect(RETIRED_DESTINATIONS).toContainEqual({ id: "collections", path: "/collections", replacedBy: "library" });
      expect(replacementFor("collections")?.id).toBe("library");
      expect(retiredRedirects()).toContainEqual({ id: "collections", from: "/collections", to: "/library" });
    });
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
      { id: "collections", from: "/collections", to: "/library" },
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
      { id: "library", label: "Library", hint: "x", path: "/library", group: "workspace", icon: "library", enabled: true },
      { id: "new", label: "New", hint: "x", path: "/new", group: "workspace", icon: "clean", enabled: false },
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

  describe("hints and the library-first pages (NAV-1, NAV-5)", () => {
    it("gives every destination the one-line hint the sidebar shows (NAV-1)", () => {
      const hints = Object.fromEntries(NAV_DESTINATIONS.map((d) => [d.id, d.hint]));
      expect(hints).toEqual({
        library: "Your Rekordbox tracks",
        keys: "The keys in your playlists, Collections and Sets",
        clean: "Match on Beatport, find missing files and duplicates",
        discover: "Find new music",
        prepare: "Plan a set",
        statistics: "See what you play most and how your library is made up",
        settings: "Look, sound, accounts",
      });
    });

    it("writes the hints without a final period and in American spelling", () => {
      for (const destination of NAV_DESTINATIONS) {
        expect(destination.hint).not.toMatch(/\.$/);
        expect(destination.hint).not.toMatch(/colour|behaviour|organis|analys/i);
      }
    });

    it("names the pages that need a library before the first import (NAV-5)", () => {
      const needing = NAV_DESTINATIONS.filter((d) => d.needsLibrary).map((d) => d.id);
      expect(needing).toEqual(["keys", "clean", "discover", "prepare", "statistics"]);
      expect(EMPTY_LIBRARY_HINT).toBe("Import your Rekordbox collection first");
    });

    it("declares Keys at the top level, after Library (PAGES-16, DEC-200)", () => {
      const keys = findDestinationById("keys")!;
      expect(keys).toMatchObject({
        label: "Keys",
        path: "/keys",
        group: "workspace",
        icon: "keys",
        enabled: true,
        needsLibrary: true,
      });
      const ids = NAV_DESTINATIONS.map((d) => d.id);
      expect(ids.indexOf("keys")).toBe(ids.indexOf("library") + 1);
    });

    it("keeps Settings last, in its own group, for the pinned bottom (NAV-6)", () => {
      const groups = groupedDestinations();
      expect(groups.at(-1)?.destinations.map((d) => d.id)).toEqual(["settings"]);
    });
  });
});

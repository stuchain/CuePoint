/**
 * The registry is the single source of destinations (DEC-020). These tests
 * protect the properties the routes, the fallback rule and — from SHELL-02 —
 * the sidebar all rely on.
 */
import { describe, expect, it } from "vitest";

import {
  enabledDestinations,
  findDestinationById,
  findDestinationByPath,
  homeDestination,
  HOME_DESTINATION_ID,
  NAV_DESTINATIONS,
  type NavDestination,
} from "./navRegistry";

const WITH_DISABLED: readonly NavDestination[] = [
  ...NAV_DESTINATIONS,
  { id: "library", label: "Library", path: "/library", enabled: false },
];

describe("navRegistry", () => {
  it("declares unique ids", () => {
    const ids = NAV_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares unique paths", () => {
    // Two destinations on one path would make the stored id ambiguous when
    // reopening.
    const paths = NAV_DESTINATIONS.map((d) => d.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("declares a home destination that is enabled", () => {
    expect(homeDestination().id).toBe(HOME_DESTINATION_ID);
    expect(homeDestination().enabled).toBe(true);
  });

  it("throws when the home destination is missing", () => {
    // A shell that cannot resolve home renders nothing; better to fail loudly.
    expect(() => homeDestination([{ id: "x", label: "X", path: "/x", enabled: true }])).toThrow(
      /Home destination/,
    );
  });

  it("omits disabled destinations", () => {
    // This is the property DEC-020 buys: enabling a future page is one flag,
    // and until then nothing renders it.
    expect(enabledDestinations(WITH_DISABLED).map((d) => d.id)).not.toContain("library");
    expect(enabledDestinations(WITH_DISABLED)).toHaveLength(NAV_DESTINATIONS.length);
  });

  it("looks destinations up by id and by path", () => {
    expect(findDestinationById("results")?.path).toBe("/results");
    expect(findDestinationByPath("/results")?.id).toBe("results");
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
    expect(findDestinationByPath("/results?filter=needs_review")).toBeNull();
  });
});

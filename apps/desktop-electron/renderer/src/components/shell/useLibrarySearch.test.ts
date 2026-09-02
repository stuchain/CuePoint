/**
 * The decisions search makes, as pure functions.
 *
 * Kept out of the component tests so the one that matters most — telling "no
 * library yet" apart from "no matches" — is checked directly rather than
 * through rendering.
 */
import { describe, expect, it } from "vitest";

import {
  MIN_QUERY_LENGTH,
  resultSummary,
  shouldSearch,
  statusFor,
  trackSubtitle,
} from "./useLibrarySearch";
import type { LibrarySearchResponse } from "../../api/cuepointBridge.types";

function response(overrides: Partial<LibrarySearchResponse> = {}): LibrarySearchResponse {
  return {
    query: "q",
    total: 0,
    limit: 50,
    offset: 0,
    tracks: [],
    library_empty: false,
    ...overrides,
  };
}

describe("shouldSearch", () => {
  it("ignores an empty or whitespace-only query", () => {
    expect(shouldSearch("")).toBe(false);
    expect(shouldSearch("   ")).toBe(false);
  });

  it("ignores a query below the minimum length", () => {
    expect(shouldSearch("a".repeat(MIN_QUERY_LENGTH - 1))).toBe(false);
  });

  it("accepts a query at the minimum length", () => {
    expect(shouldSearch("a".repeat(MIN_QUERY_LENGTH))).toBe(true);
  });

  it("measures the trimmed query", () => {
    expect(shouldSearch(`  ${"a".repeat(MIN_QUERY_LENGTH)}  `)).toBe(true);
    expect(shouldSearch("  a  ")).toBe(false);
  });
});

describe("statusFor", () => {
  it("is idle for a query too short to search", () => {
    expect(statusFor("a", null)).toBe("idle");
  });

  it("is searching while no response has arrived", () => {
    expect(statusFor("strobe", null)).toBe("searching");
  });

  it("distinguishes an empty library from no matches", () => {
    // Both have zero results and mean entirely different things: one is "you
    // have not imported anything yet", the other is "that track is not here".
    expect(statusFor("strobe", response({ library_empty: true, total: 0 }))).toBe(
      "empty-library",
    );
    expect(statusFor("strobe", response({ library_empty: false, total: 0 }))).toBe(
      "no-results",
    );
  });

  it("reports results when there are any", () => {
    expect(statusFor("strobe", response({ total: 3 }))).toBe("results");
  });

  it("prefers the empty-library state even if a total somehow arrives", () => {
    // Defensive: an empty library cannot have matches, and if the two ever
    // disagree the honest message is the one about the library.
    expect(statusFor("strobe", response({ library_empty: true, total: 5 }))).toBe(
      "empty-library",
    );
  });
});

describe("resultSummary", () => {
  it("is empty when there is nothing to summarise", () => {
    expect(resultSummary(null)).toBe("");
    expect(resultSummary(response({ total: 0 }))).toBe("");
  });

  it("counts results when the page holds all of them", () => {
    const tracks = [1, 2, 3].map(() => ({}) as never);
    expect(resultSummary(response({ total: 3, tracks }))).toBe("3 results");
  });

  it("uses the singular for one result", () => {
    expect(resultSummary(response({ total: 1, tracks: [{} as never] }))).toBe("1 result");
  });

  it("says how many of the total are shown when paged", () => {
    // The unpaged total is why the engine returns `total` separately.
    const tracks = Array.from({ length: 50 }, () => ({}) as never);
    expect(resultSummary(response({ total: 340, tracks }))).toBe("Showing 50 of 340");
  });
});

describe("trackSubtitle", () => {
  it("joins the parts that are present", () => {
    expect(
      trackSubtitle({ album: "Album", label: "Label", bpm: 128, key: "6A" }),
    ).toBe("Album · Label · 128 BPM · 6A");
  });

  it("omits missing parts without leaving separators behind", () => {
    expect(trackSubtitle({ album: null, label: "Label", bpm: null, key: null })).toBe(
      "Label",
    );
    expect(trackSubtitle({ album: null, label: null, bpm: null, key: null })).toBe("");
  });

  it("does not treat a zero BPM as a value worth showing", () => {
    expect(trackSubtitle({ album: "Album", label: null, bpm: 0, key: null })).toBe(
      "Album",
    );
  });
});

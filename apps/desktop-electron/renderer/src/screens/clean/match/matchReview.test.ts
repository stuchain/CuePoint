/** The words of reviewing one search (C22). */
import { describe, expect, it } from "vitest";

import { reviewDoneWords, reviewHeaderWords } from "./matchReview";

describe("reviewHeaderWords", () => {
  it("says where the reviewer is and how many were already confirmed", () => {
    expect(reviewHeaderWords(2, 9, 15)).toBe("2 of 9 · 15 already confirmed");
  });
  it("leaves out the confirmed ones when there were none", () => {
    expect(reviewHeaderWords(3, 4, 0)).toBe("3 of 4");
  });
});

describe("reviewDoneWords", () => {
  it("says the playlist is done, how many are confirmed and how many are not", () => {
    expect(reviewDoneWords("hJ", { track_count: 24, accepted: 22 })).toEqual({
      headline: "hJ is done",
      detail: "22 confirmed · 2 not confirmed",
    });
  });
  it("says nothing is left when all are confirmed", () => {
    expect(reviewDoneWords("hJ", { track_count: 24, accepted: 24 }).detail).toBe("24 confirmed");
  });
  it("says the skipped ones when the review ended on them", () => {
    expect(reviewDoneWords("hJ", { track_count: 24, accepted: 20 }, 3).detail).toBe(
      "20 confirmed · 4 not confirmed · 3 skipped",
    );
  });
});

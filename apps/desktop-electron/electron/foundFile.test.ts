import { describe, expect, it } from "vitest";

import { foundFilePath } from "./foundFile";

const answer = {
  result: {
    folder: "/Users/dj/Moved",
    found: [
      { track_id: 4, path: "/Users/dj/Moved/a.mp3" },
      { track_id: 9, path: "/Users/dj/Moved/b.mp3" },
    ],
    ambiguous: [{ track_id: 5, count: 2 }],
    not_found: [6],
  },
};

describe("foundFilePath", () => {
  it("reads the path from the job's own result, by track", () => {
    expect(foundFilePath(answer, 9)).toBe("/Users/dj/Moved/b.mp3");
  });

  it("has no path for a track the find did not locate", () => {
    expect(foundFilePath(answer, 5)).toBeNull();
    expect(foundFilePath(answer, 6)).toBeNull();
    expect(foundFilePath(answer, 99)).toBeNull();
  });

  it("has no path for a track id that is not an integer", () => {
    expect(foundFilePath(answer, "4")).toBeNull();
    expect(foundFilePath(answer, 4.5)).toBeNull();
    expect(foundFilePath(answer, undefined)).toBeNull();
  });

  it("has no path for a result that is not a find's", () => {
    expect(foundFilePath({ result: { found: [{ track_id: 1, path: "/x" }] } }, 1)).toBeNull();
    expect(foundFilePath({ result: { folder: "/f", found: "nope" } }, 1)).toBeNull();
    expect(foundFilePath({}, 1)).toBeNull();
    expect(foundFilePath(null, 1)).toBeNull();
  });
});

/**
 * What the Library's columns say about themselves (DEC-201, LIB-9).
 */
import { describe, expect, it } from "vitest";

import { LIBRARY_COLUMNS } from "./libraryColumns";

describe("the Key column", () => {
  const key = LIBRARY_COLUMNS.find((column) => column.id === "key")!;

  it("says where keys come from", () => {
    expect(key.header).toBe("Key");
    expect(key.hint).toBe("Keys come from Beatport matches");
  });

  it("has no other column explaining itself this way", () => {
    expect(LIBRARY_COLUMNS.filter((column) => column.hint).map((column) => column.id)).toEqual([
      "key",
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { ancestorNames, scopePath } from "./scopePath";

const nodes = [
  { id: 1, parent_id: null, name: "Gigs 2026" },
  { id: 2, parent_id: 1, name: "Summer" },
  { id: 3, parent_id: 2, name: "Sunset" },
  { id: 4, parent_id: null, name: "Friday warm-up" },
  { id: 5, parent_id: 99, name: "Orphan" },
];

describe("scopePath", () => {
  it("is empty on All tracks", () => {
    expect(scopePath(null, nodes, null)).toEqual([]);
  });

  it("names the folders above a nested playlist, outermost first", () => {
    expect(scopePath("Playlists", nodes, 3)).toEqual(["Playlists", "Gigs 2026", "Summer"]);
  });

  it("is just the pane for a top-level node", () => {
    expect(scopePath("Playlists", nodes, 4)).toEqual(["Playlists"]);
    expect(scopePath("Collections", nodes, 4)).toEqual(["Collections"]);
  });

  it("stops where a parent is not in the list (Rekordbox's unwrapped ROOT)", () => {
    expect(ancestorNames(nodes, 5)).toEqual([]);
  });

  it("does not loop on a cycle", () => {
    const cyclic = [
      { id: 1, parent_id: 2, name: "A" },
      { id: 2, parent_id: 1, name: "B" },
    ];
    expect(ancestorNames(cyclic, 1)).toEqual(["B"]);
  });
});

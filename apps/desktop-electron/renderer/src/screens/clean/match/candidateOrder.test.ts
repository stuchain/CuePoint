import { describe, expect, it } from "vitest";

import { candidate } from "../../../test/matchFixtures";
import { orderCandidates } from "./candidateOrder";

const ids = (list: ReturnType<typeof orderCandidates>) => list.map((entry) => entry.id);

describe("orderCandidates", () => {
  const list = [
    candidate(1, { rank: 0, score: 40, guard_ok: false }),
    candidate(2, { rank: 1, score: 70, guard_ok: true }),
    candidate(3, { rank: 2, score: 90, guard_ok: true }),
    candidate(4, { rank: 3, score: 85, guard_ok: false }),
    candidate(5, { rank: 4, score: 70, guard_ok: true }),
  ];

  it("puts the one in use first, then the others by score, then the ruled-out by score", () => {
    expect(ids(orderCandidates(list, 5))).toEqual([5, 3, 2, 4, 1]);
  });

  it("keeps a ruled-out candidate in use first too", () => {
    expect(ids(orderCandidates(list, 1))).toEqual([1, 3, 2, 5, 4]);
  });

  it("breaks ties by rank and leaves the input alone", () => {
    expect(ids(orderCandidates(list, null))).toEqual([3, 2, 5, 4, 1]);
    expect(ids(list as never)).toEqual([1, 2, 3, 4, 5]);
  });
});

import { describe, expect, it } from "vitest";

import { fitSteps } from "./fitSteps";

describe("fitSteps", () => {
  it.each([
    [0, 0],
    [9, 0],
    [10, 1],
    [50, 3],
    [70, 4],
    [100, 5],
    [-5, 0],
    [130, 5],
  ])("turns %s into %s blocks", (score, steps) => {
    expect(fitSteps(score)).toBe(steps);
  });
});

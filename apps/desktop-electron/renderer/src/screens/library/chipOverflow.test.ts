import { describe, expect, it } from "vitest";

import { hiddenChipCount } from "./chipOverflow";

describe("hiddenChipCount", () => {
  it("counts the chips that reach past the visible right edge", () => {
    expect(hiddenChipCount(0, 300, [100, 200, 320, 450])).toBe(2);
  });

  it("counts fewer once the list is scrolled", () => {
    expect(hiddenChipCount(150, 300, [100, 200, 320, 450])).toBe(0);
  });

  it("counts a chip that fits exactly as in sight", () => {
    expect(hiddenChipCount(0, 300, [300, 301])).toBe(0);
  });

  it("hides nothing from a list with no layout", () => {
    expect(hiddenChipCount(0, 0, [0, 0])).toBe(0);
  });

  it("counts every chip hidden when the list is squeezed to no width", () => {
    expect(hiddenChipCount(0, 0, [100, 200])).toBe(2);
  });
});

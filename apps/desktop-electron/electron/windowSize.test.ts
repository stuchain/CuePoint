import { describe, expect, it } from "vitest";

import { WINDOW_MIN_SIZE } from "./windowSize";

describe("the window's smallest size", () => {
  it("is 1024 by 640", () => {
    expect(WINDOW_MIN_SIZE).toEqual({ minWidth: 1024, minHeight: 640 });
  });
});

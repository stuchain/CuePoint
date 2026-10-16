import { describe, expect, it } from "vitest";

import { MINUS, trueMinus } from "./trueMinus";

describe("trueMinus", () => {
  it("turns the hyphen that starts a number into the true minus", () => {
    expect(trueMinus("-19")).toBe(`${MINUS}19`);
    expect(trueMinus("-19 to -14 LUFS")).toBe(`${MINUS}19 to ${MINUS}14 LUFS`);
    expect(trueMinus("(-6.5)")).toBe(`(${MINUS}6.5)`);
  });

  it("leaves a range and a word hyphen alone", () => {
    expect(trueMinus("60-70")).toBe("60-70");
    expect(trueMinus("Re-match")).toBe("Re-match");
    expect(trueMinus("— none")).toBe("— none");
  });
});

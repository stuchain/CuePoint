import { describe, expect, it } from "vitest";

import { SAVE_TO_FILES, SEE_CHANGES, barSentence } from "./saveBarWords";

describe("the save bar's words", () => {
  it("says how many tracks have values the files do not", () => {
    expect(barSentence(47)).toBe("47 tracks have new values that aren't in your files yet.");
    expect(barSentence(1_204)).toBe("1,204 tracks have new values that aren't in your files yet.");
  });

  it("says one track in the singular", () => {
    expect(barSentence(1)).toBe("1 track has a new value that isn't in your files yet.");
  });

  it("names its two buttons", () => {
    expect(SEE_CHANGES).toBe("See changes");
    expect(SAVE_TO_FILES).toBe("Save to files…");
  });

  it("never says write", () => {
    expect([barSentence(2), SEE_CHANGES, SAVE_TO_FILES].join(" ")).not.toMatch(/\bwrit/i);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { UPDATES_IN_APP } from "./site";

describe("UPDATES_IN_APP", () => {
  const guide = readFileSync(resolve(process.cwd(), "../../docs/user-guide/getting-started.md"), "utf8");
  const guideSaysNoUpdates = guide.includes("does not update itself yet");

  it("agrees with the user guide, so the download page never promises what the guide denies", () => {
    expect(
      UPDATES_IN_APP,
      "getting-started.md says CuePoint does not update itself yet, so the flag must be false (and the reverse)",
    ).toBe(!guideSaysNoUpdates);
  });
});

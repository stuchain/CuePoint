import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { UPDATES_IN_APP } from "./site";

describe("UPDATES_IN_APP", () => {
  const guide = readFileSync(resolve(process.cwd(), "../../docs/user-guide/getting-started.md"), "utf8");
  const guideSaysNoUpdates = guide.includes("does not update itself yet");
  const guideSaysUpdates = guide.includes("finds and installs new versions itself");

  it("agrees with the user guide, so the download page never promises what the guide denies", () => {
    expect(guideSaysNoUpdates !== guideSaysUpdates, "getting-started.md says one thing about updates, not both or neither").toBe(true);
    expect(
      UPDATES_IN_APP,
      "getting-started.md says CuePoint finds and installs new versions itself, so the flag must be true (and the reverse)",
    ).toBe(guideSaysUpdates);
  });
});

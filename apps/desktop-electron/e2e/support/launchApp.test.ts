import path from "node:path";
import { describe, expect, it } from "vitest";

import { STALE_ENGINE_COPY_MS, launchPlan, packagedExecutable, staleEngineCopies } from "./launchApp";

const dev = { cwd: "/repo/apps/desktop-electron", args: [".", "--user-data-dir=/tmp/ud"], env: { A: "1" } };

describe("launchPlan", () => {
  it("passes the development options through untouched", () => {
    expect(launchPlan(dev, undefined)).toBe(dev);
  });

  it("starts the packaged executable with no app folder and no working folder", () => {
    expect(launchPlan(dev, "/pkg/cuepoint")).toEqual({
      executablePath: "/pkg/cuepoint",
      args: ["--user-data-dir=/tmp/ud"],
      env: { A: "1" },
    });
  });

  it("keeps every other argument, in order", () => {
    const plan = launchPlan({ cwd: "/x", args: [".", "--a", "--b=2"] }, "/pkg/cuepoint");
    expect(plan.args).toEqual(["--a", "--b=2"]);
  });

  it("does not drop an argument that is not the app folder", () => {
    const plan = launchPlan({ args: ["--user-data-dir=/tmp/ud"] }, "/pkg/cuepoint");
    expect(plan.args).toEqual(["--user-data-dir=/tmp/ud"]);
  });
});

describe("packagedExecutable", () => {
  it("is undefined when the variable is unset or blank", () => {
    expect(packagedExecutable({})).toBeUndefined();
    expect(packagedExecutable({ CUEPOINT_E2E_EXECUTABLE: "  " })).toBeUndefined();
  });

  it("is the variable's value otherwise", () => {
    expect(packagedExecutable({ CUEPOINT_E2E_EXECUTABLE: "/pkg/cuepoint" })).toBe("/pkg/cuepoint");
  });
});

describe("staleEngineCopies", () => {
  const now = 1_000_000;
  const list = () => [
    { name: "_MEI12345", mtimeMs: now - STALE_ENGINE_COPY_MS - 1 },
    { name: "_MEI67890", mtimeMs: now - 5_000 },
    { name: "cuepoint-e2e-abc", mtimeMs: 0 },
  ];

  it("names the engine copies an earlier launch left, not one still ending, nor anything else", () => {
    expect(staleEngineCopies("/tmp", now, list)).toEqual([path.join("/tmp", "_MEI12345")]);
  });
});

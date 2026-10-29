import { describe, expect, it } from "vitest";

import { launchPlan, packagedExecutable } from "./launchApp";

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

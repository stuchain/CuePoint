import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAppIconPath } from "./appIcon";

const appPath = path.join("app", "root");
const resourcesPath = path.join("install", "resources");
const base = { appPath, resourcesPath, exists: () => true };

describe("resolveAppIconPath", () => {
  it("uses build/icon.png under the app path in dev on Windows and Linux", () => {
    const icon = path.join(appPath, "build", "icon.png");
    expect(resolveAppIconPath({ ...base, platform: "win32", isPackaged: false })).toBe(icon);
    expect(resolveAppIconPath({ ...base, platform: "linux", isPackaged: false })).toBe(icon);
  });

  it("uses icon.png in the resources folder when packaged", () => {
    const icon = path.join(resourcesPath, "icon.png");
    expect(resolveAppIconPath({ ...base, platform: "win32", isPackaged: true })).toBe(icon);
    expect(resolveAppIconPath({ ...base, platform: "linux", isPackaged: true })).toBe(icon);
  });

  it("passes no icon on macOS", () => {
    expect(
      resolveAppIconPath({ ...base, platform: "darwin", isPackaged: false }),
    ).toBeUndefined();
    expect(
      resolveAppIconPath({ ...base, platform: "darwin", isPackaged: true }),
    ).toBeUndefined();
  });

  it("passes no icon when the file is missing", () => {
    expect(
      resolveAppIconPath({ ...base, platform: "win32", isPackaged: true, exists: () => false }),
    ).toBeUndefined();
    expect(
      resolveAppIconPath({ ...base, platform: "linux", isPackaged: false, exists: () => false }),
    ).toBeUndefined();
  });
});

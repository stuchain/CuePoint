import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAppIconPath } from "./appIcon";

const appPath = path.join("app", "root");
const resourcesPath = path.join("install", "resources");
const base = { appPath, resourcesPath, exists: () => true };

describe("resolveAppIconPath", () => {
  it("uses build/icon.ico on Windows and build/icon.png on Linux in dev", () => {
    expect(resolveAppIconPath({ ...base, platform: "win32", isPackaged: false })).toBe(
      path.join(appPath, "build", "icon.ico"),
    );
    expect(resolveAppIconPath({ ...base, platform: "linux", isPackaged: false })).toBe(
      path.join(appPath, "build", "icon.png"),
    );
  });

  it("uses icon.ico on Windows and icon.png on Linux in the resources folder when packaged", () => {
    expect(resolveAppIconPath({ ...base, platform: "win32", isPackaged: true })).toBe(
      path.join(resourcesPath, "icon.ico"),
    );
    expect(resolveAppIconPath({ ...base, platform: "linux", isPackaged: true })).toBe(
      path.join(resourcesPath, "icon.png"),
    );
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

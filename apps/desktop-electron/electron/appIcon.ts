/**
 * The window icon on Windows and Linux (DIST-09).
 *
 * macOS takes the icon from the app bundle, so no window icon is passed there. Windows uses
 * `build/icon.ico`, whose 16 to 48 px images are drawn for their size: given the 512 px PNG, the
 * title bar and taskbar shrink it and the wheel blurs. Linux uses `build/icon.png`. In dev each is
 * read straight from the app root, in a packaged build from `<resources>/`, which
 * `build.extraResources` copies next to the asar (a native window icon must be a real file on
 * disk, not a path inside the asar).
 */
import fs from "node:fs";
import path from "node:path";

export interface AppIconOptions {
  platform: string;
  isPackaged: boolean;
  /** `app.getAppPath()` */
  appPath: string;
  /** `process.resourcesPath` */
  resourcesPath: string;
  exists?: (p: string) => boolean;
}

export function resolveAppIconPath({
  platform,
  isPackaged,
  appPath,
  resourcesPath,
  exists = fs.existsSync,
}: AppIconOptions): string | undefined {
  if (platform === "darwin") return undefined;
  const file = platform === "win32" ? "icon.ico" : "icon.png";
  const icon = isPackaged
    ? path.join(resourcesPath, file)
    : path.join(appPath, "build", file);
  return exists(icon) ? icon : undefined;
}

/**
 * The window icon on Windows and Linux (DIST-09).
 *
 * macOS takes the icon from the app bundle, so no window icon is passed there. Elsewhere the
 * window uses `build/icon.png`: in dev straight from the app root, in a packaged build from
 * `<resources>/icon.png`, which `build.extraResources` copies next to the asar (a native window
 * icon must be a real file on disk, not a path inside the asar).
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
  const icon = isPackaged
    ? path.join(resourcesPath, "icon.png")
    : path.join(appPath, "build", "icon.png");
  return exists(icon) ? icon : undefined;
}

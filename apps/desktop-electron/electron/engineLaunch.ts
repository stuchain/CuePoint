import path from "node:path";
import { app } from "electron";

/** Bundled engine executable inside Electron `resources/engine/`. */
export function getBundledEnginePath(resourcesPath: string = process.resourcesPath): string {
  const fileName = process.platform === "win32" ? "cuepoint-engine.exe" : "cuepoint-engine";
  return path.join(resourcesPath, "engine", fileName);
}

export function shouldUseBundledEngine(): boolean {
  return app.isPackaged;
}

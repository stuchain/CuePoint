import fs from "node:fs";

/**
 * Deletes a file or folder and everything in it, the way `fs.rmSync(target, { recursive: true,
 * force: true })` does in plain Node.
 *
 * In Electron's main process `fs` reads an `.asar` archive as a folder, so a recursive delete of
 * a downloaded `CuePoint.app` walks into `Contents/Resources/app.asar`, then fails on it with
 * ENOTDIR. The update folder was left behind, and the error took the place of the reason the
 * download was refused. Asar support is turned off for the one call, and back as it was after.
 */
export function removeTree(target: string): void {
  const noAsar = process.noAsar;
  process.noAsar = true;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } finally {
    process.noAsar = noAsar;
  }
}

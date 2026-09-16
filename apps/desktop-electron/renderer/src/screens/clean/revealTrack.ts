/**
 * "Show in folder" for a track whose file may not be there (CLEAN-07, CLEAN-12).
 *
 * The Library's reveal hands the operating system a path, which does nothing
 * useful for a file that has moved: the file manager opens on nothing. Here the
 * engine is asked, by track id, where the nearest thing that exists is — the
 * file, or the closest folder on its path — and says plainly when nothing on
 * the path exists, which is what a disconnected drive looks like (DEC-073).
 *
 * Relocating is Rekordbox's (DEC-073). This only shows a person where to look.
 */

export interface RevealOutcome {
  tone: "info" | "warning";
  message: string;
}

/** Show a track's file or its nearest folder. Null when the file itself was shown. */
export async function revealTrack(trackId: number): Promise<RevealOutcome | null> {
  const bridge = window.cuepoint;
  if (!bridge?.getTrackFolder || !bridge.showItemInFolder) {
    return { tone: "warning", message: "Showing a file needs the desktop app." };
  }
  try {
    const found = await bridge.getTrackFolder({ trackId });
    if (found.file_exists) {
      await bridge.showItemInFolder(found.file_path);
      return null;
    }
    if (found.folder) {
      await bridge.showItemInFolder(found.folder);
      return {
        tone: "info",
        message: `The file is not there. Showing the nearest folder that is: ${found.folder}`,
      };
    }
    return {
      tone: "warning",
      message: "Nothing on this file's path exists. The drive may not be connected.",
    };
  } catch (cause) {
    return { tone: "warning", message: cause instanceof Error ? cause.message : String(cause) };
  }
}

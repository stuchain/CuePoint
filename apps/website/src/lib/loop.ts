/**
 * The home page's sound loop (DEC-191). The speaker button is hidden until the user adds a loop they own
 * the rights to, as `src/assets/audio/home-loop.<ext>`: `pickLoop` finds it among the files the page's
 * glob matched, and the button is rendered only when there is one. No sound ever plays unasked.
 */

/** The glob (import.meta.glob needs a literal; keep it equal to this) that matches the loop file. */
export const LOOP_FILE_PATTERN = "../assets/audio/home-loop.{mp3,m4a,ogg,webm,wav}";

/** The formats, most widely played first. */
const EXTENSIONS = ["mp3", "m4a", "ogg", "webm", "wav"] as const;

/** The URL of the loop among the glob's files (path to URL), or undefined when there is no loop. */
export function pickLoop(files: Readonly<Record<string, string>>): string | undefined {
  for (const ext of EXTENSIONS) {
    for (const [path, url] of Object.entries(files)) {
      if (path.endsWith(`/home-loop.${ext}`) || path === `home-loop.${ext}`) return url;
    }
  }
  return undefined;
}

/** The event the speaker button fires on `document` with the sound's level (0 to 1) while the loop plays. */
export const AUDIO_LEVEL_EVENT = "cuepoint:audio-level";

/** The analyser's bytes (0 to 255) as one level from 0 to 1: their mean. */
export function loopLevel(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let sum = 0;
  for (const b of bytes) sum += b;
  return Math.min(1, Math.max(0, sum / bytes.length / 255));
}

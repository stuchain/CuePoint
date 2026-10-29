/**
 * The spelling of a file path that mpv can open on Windows at any length (HARDEN-06).
 *
 * Windows' ordinary file calls refuse an absolute path of 260 characters or more; the `\\?\` prefix
 * (`\\?\UNC\` for a share) turns that limit off. The engine does the same for its own file calls
 * (`utils/long_path.py`). Electron main's own file calls go through Node, which copes without it,
 * so this is only for the path handed to mpv: on any other system, and for any path of 259
 * characters or fewer, the text comes back untouched.
 */

/** The longest absolute path Windows opens without the prefix (`MAX_PATH` is 260 with the NUL). */
export const LONG_PATH_LIMIT = 259;

const ALREADY_PREFIXED = /^(\\\\[?.]\\|\/\/[?.]\/)/;
const DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/;
const UNC = /^[\\/]{2}[^\\/?.][^\\/]*[\\/]+[^\\/]+/;

/** Collapse `.`, `..` and repeated separators, as Windows would have before the prefix. */
function collapse(path: string): string {
  const parts = path.replace(/\//g, "\\").split("\\");
  const kept: string[] = [];
  parts.forEach((part, index) => {
    if (part === "." || (part === "" && index > 0 && index < parts.length - 1)) return;
    if (part === ".." && kept.length > 1) {
      kept.pop();
      return;
    }
    kept.push(part);
  });
  return kept.join("\\");
}

/** `file` as the operating system should be given it; see the module note. */
export function osPath(file: string, platform: string = process.platform): string {
  if (platform !== "win32" || file.length <= LONG_PATH_LIMIT) return file;
  if (ALREADY_PREFIXED.test(file)) return file;
  if (UNC.test(file)) return `\\\\?\\UNC\\${collapse(file.replace(/^[\\/]{2}/, ""))}`;
  if (DRIVE_ABSOLUTE.test(file)) return `\\\\?\\${collapse(file)}`;
  return file;
}

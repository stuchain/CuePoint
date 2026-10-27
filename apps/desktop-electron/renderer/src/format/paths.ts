/**
 * How a file's path is written for a person (M500): the computer's own separators, the home
 * folder as "~", and the file name first, because the name is what they are looking for and the
 * folder is what tells two of them apart.
 *
 * Pure text in, text out. The path is never changed, only shown: copying, opening and comparing
 * use the original. The platform is read from the path itself (a drive letter, a backslash, a
 * leading slash), so the same path reads the same on every machine and in every test.
 */

export interface DisplayPathOptions {
  /** Keep the home folder as written, rather than "~". */
  keepHome?: boolean;
}

export interface PathParts {
  /** The file (or last folder) name, no separators. */
  name: string;
  /** Everything before it, in native separators and with "~" for the home folder; "" at the top. */
  folder: string;
}

const DRIVE = /^[A-Za-z]:[\\/]/;
const UNC = /^\\\\[^\\]/;

/** Whether this path is written the way Windows writes one. */
export function isWindowsPath(path: string): boolean {
  return DRIVE.test(path) || UNC.test(path) || (path.includes("\\") && !path.startsWith("/"));
}

/** The folder a Windows, macOS or Linux home folder is, when the path starts in one; else null. */
function homePrefix(path: string, windows: boolean): string | null {
  if (windows) {
    const match = /^[A-Za-z]:\\Users\\[^\\]+/i.exec(path);
    return match ? match[0] : null;
  }
  const match = /^\/(?:Users|home)\/[^/]+/.exec(path);
  return match ? match[0] : null;
}

/** A path in the separators of the system it came from, with the home folder as "~". */
export function displayPath(path: string | null | undefined, options: DisplayPathOptions = {}): string {
  if (typeof path !== "string" || path.trim() === "") return "";
  const windows = isWindowsPath(path);
  const separator = windows ? "\\" : "/";
  // A UNC path keeps its two leading separators.
  const lead = UNC.test(path) ? "\\\\" : "";
  const body = lead ? path.slice(2) : path;
  const native = lead + body.replace(/[\\/]+/g, separator);
  if (options.keepHome) return native;
  const home = homePrefix(native, windows);
  return home ? `~${native.slice(home.length)}` : native;
}

/** The file name and the folder it is in, each ready to show. */
export function pathParts(path: string | null | undefined, options: DisplayPathOptions = {}): PathParts {
  const shown = displayPath(path, options);
  if (shown === "") return { name: "", folder: "" };
  const separator = isWindowsPath(shown) ? "\\" : "/";
  const trimmed = shown.length > 1 ? shown.replace(/[\\/]+$/, "") : shown;
  const at = trimmed.lastIndexOf(separator);
  if (at < 0) return { name: trimmed, folder: "" };
  // The root ("/", "C:\") is a folder of its own, not an empty one.
  const folder = at === 0 ? separator : trimmed.slice(0, at);
  return { name: trimmed.slice(at + 1), folder: /^[A-Za-z]:$/.test(folder) ? `${folder}\\` : folder };
}

/**
 * The file name first, then where it is: "collection.xml — ~/Music/rekordbox". A name with no
 * folder is just the name.
 */
export function displayPathNameFirst(
  path: string | null | undefined,
  options: DisplayPathOptions = {},
): string {
  const { name, folder } = pathParts(path, options);
  if (name === "") return "";
  return folder === "" ? name : `${name} — ${folder}`;
}

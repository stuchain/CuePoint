/**
 * Which build this is, in the words every process reports it in (REPORT-07, DEC-126).
 *
 * - `release` is `cuepoint@<version>`, the version being the app's own (`app.getVersion()`, which is
 *   `package.json`'s `version`), which `scripts/check_desktop_version_coupling.py` holds equal to
 *   `version.py`'s `__version__`.
 *   The engine reports `get_release()` from `version.py` at `/health`, with the same prefix.
 * - `dist` is the short commit the build was made from. CI sets it (`CUEPOINT_BUILD_COMMIT`, read by
 *   `build/buildElectron.mjs` and baked in as `__CUEPOINT_COMMIT__`); a build made by hand has none.
 * - `environment` is `production` for a packaged app and `development` for a run from source (DEC-150).
 *
 * Main passes all three to the engine in its environment, and hands them to the renderer, so one
 * build reports one release, one `dist` and one environment from every process.
 */
/** Must equal `RELEASE_PREFIX` in `src/cuepoint/version.py`; the coupling check compares them. */
export const RELEASE_PREFIX = "cuepoint@";

/** The length of `dist`: git's default short commit. */
export const DIST_LENGTH = 7;

declare const __CUEPOINT_COMMIT__: string | undefined;

export interface BuildInfo {
  /** The app's version (`app.getVersion()`), which is also the engine's. */
  version: string;
  /** `cuepoint@<version>`. */
  release: string;
  /** The short commit, or null when the build did not record one. */
  dist: string | null;
  environment: "production" | "development";
}

export interface BuildInfoInput {
  /** The app's version: `app.getVersion()`. */
  version: string;
  /** The commit as the build recorded it, in full or short form. */
  commit?: string | null;
  packaged: boolean;
}

/** The short commit in `commit`, or null when it is not a commit (empty, "unknown", not hex). */
export function shortCommit(commit: string | null | undefined): string | null {
  const value = (commit ?? "").trim().toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(value) ? value.slice(0, DIST_LENGTH) : null;
}

export function computeBuildInfo(input: BuildInfoInput): BuildInfo {
  return {
    version: input.version,
    release: `${RELEASE_PREFIX}${input.version}`,
    dist: shortCommit(input.commit),
    environment: input.packaged ? "production" : "development",
  };
}

/** The commit this bundle was built from: baked in by `build/buildElectron.mjs`, absent in tests. */
function builtCommit(): string | null {
  return typeof __CUEPOINT_COMMIT__ === "string" ? __CUEPOINT_COMMIT__ : null;
}

/** This build, for the app as it is running now. `packaged` is `app.isPackaged`, `version` is `app.getVersion()`. */
export function currentBuildInfo(packaged: boolean, version: string): BuildInfo {
  return computeBuildInfo({
    version,
    commit: builtCommit(),
    packaged,
  });
}

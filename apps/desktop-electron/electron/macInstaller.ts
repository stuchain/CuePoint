/**
 * CuePoint's own Mac installer (DIST-06, DEC-170, Phase 16 fact 5).
 *
 * Squirrel.Mac, which `electron-updater` uses on a Mac, refuses an update whose
 * code signature differs from the running app's, so an unsigned CuePoint cannot
 * update that way. There is no Apple Developer account (Q-171), so this file
 * does what the retired Qt app did, made safer. A file an app fetches with its
 * own HTTP client carries no quarantine flag, so Gatekeeper does not stop the
 * replaced app. Nothing here ever sets or copies that flag (no `xattr`).
 *
 * Three steps, each testable alone:
 *
 * 1. `locateBundle`: where the running app is. A copy run from the disk image
 *    (`/Volumes/...`) or translocated by Gatekeeper cannot be replaced, nor can
 *    one in a folder the person may not write to. Those are `manual` (the page
 *    offers the download instead), and nothing is touched.
 * 2. `prepareMacUpdate`: read the chosen release's `latest-mac.yml`, download the
 *    chip's zip over HTTPS with main's own fetch (never the browser's download
 *    manager) into `userData/updates/<version>/`, refuse it unless its SHA-512
 *    and size match the manifest, unpack it with `ditto`, and check that the
 *    result is one `CuePoint.app` of the chosen version and this Mac's chip. Any
 *    failure deletes what was written.
 * 3. `startInstall`: a small detached `sh` script waits for the app to exit,
 *    moves the old bundle aside, moves the new one in, removes the old one and,
 *    when Restart now asked, opens the new app. If the move in fails the old
 *    bundle is moved back, so the person is never left with no app.
 *
 * Everything that touches the machine (the network, `ditto`, the write test,
 * the spawn) is passed in, so the file is testable without a Mac. The new app's
 * version and chip are read in Node, from `Info.plist` and the executable's
 * Mach-O header: `lipo` is an Xcode stub on most Macs and can pop up the
 * "install developer tools" dialog, and `plutil` is not worth a process.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { targetFileName, type UpdateTarget } from "./updateRule";

/** The chips a Mac build is for, as `lipo -archs` names them. */
export type MacChip = "arm64" | "x86_64";

export function chipForTarget(target: UpdateTarget): MacChip | null {
  if (target === "mac-arm64") return "arm64";
  if (target === "mac-x64") return "x86_64";
  return null;
}

// --- Where the app is ---------------------------------------------------------

export type BundleLocation =
  | { ok: true; bundle: string }
  | { ok: false; reason: "cannot-replace"; detail: string };

function writable(target: string): boolean {
  try {
    fs.accessSync(target, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The `.app` that holds `exePath` (`app.getPath("exe")`), or why it cannot be
 * replaced. `canWrite` is `fs.accessSync(..., W_OK)` unless a test gives its own.
 */
export function locateBundle(exePath: string, canWrite: (target: string) => boolean = writable): BundleLocation {
  const no = (detail: string): BundleLocation => ({ ok: false, reason: "cannot-replace", detail });
  let bundle = path.dirname(exePath);
  while (!bundle.endsWith(".app")) {
    const parent = path.dirname(bundle);
    if (parent === bundle) return no("CuePoint is not running from an app bundle.");
    bundle = parent;
  }
  if (bundle.startsWith("/Volumes/")) return no("CuePoint is running from a disk image or another disk.");
  if (bundle.includes("/AppTranslocation/")) return no("macOS is running CuePoint from a temporary place.");
  if (!canWrite(path.dirname(bundle))) return no("The folder CuePoint is in cannot be written to.");
  if (!canWrite(bundle)) return no("CuePoint's own folder cannot be written to.");
  return { ok: true, bundle };
}

// --- Download, check, unpack ---------------------------------------------------

/**
 * Why a Mac update did not get ready. `network` is the user's own connection
 * (DEC-153, not reported); the rest are CuePoint's or the release's and are.
 */
export type MacUpdateErrorKind =
  | "network"
  | "manifest"
  | "download"
  | "checksum"
  | "size"
  | "version"
  | "chip"
  | "bundle";

export class MacUpdateError extends Error {
  constructor(
    readonly kind: MacUpdateErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "MacUpdateError";
  }
}

/** Runs a program and answers its standard output; rejects when it exits non-zero. */
export type RunProgram = (file: string, args: string[]) => Promise<string>;

/** `cputype` values in a Mach-O header. */
const CPU_ARM64 = 0x0100000c;
const CPU_X86_64 = 0x01000007;

function chipOfCpuType(cpuType: number): MacChip | null {
  if (cpuType === CPU_ARM64) return "arm64";
  if (cpuType === CPU_X86_64) return "x86_64";
  return null;
}

/**
 * The chips an executable's header names, read from its first bytes: a thin
 * 64-bit Mach-O (`0xfeedfacf`, little-endian on disk) holds one; a fat file
 * (`0xcafebabe`, or `0xcafebabf` with 64-bit offsets; always big-endian) lists
 * several. Anything else, or a header that is cut short, gives none.
 */
export function machOChips(header: Buffer): MacChip[] {
  if (header.length < 8) return [];
  if (header.readUInt32LE(0) === 0xfeedfacf) {
    const chip = chipOfCpuType(header.readUInt32LE(4));
    return chip ? [chip] : [];
  }
  const magic = header.readUInt32BE(0);
  if (magic !== 0xcafebabe && magic !== 0xcafebabf) return [];
  const entry = magic === 0xcafebabe ? 20 : 32;
  const count = header.readUInt32BE(4);
  const chips: MacChip[] = [];
  // A real file has a handful; a wild count is a corrupt header.
  for (let i = 0; i < Math.min(count, 16); i += 1) {
    const at = 8 + i * entry;
    if (at + 4 > header.length) break;
    const chip = chipOfCpuType(header.readUInt32BE(at));
    if (chip) chips.push(chip);
  }
  return chips;
}

/**
 * `CFBundleShortVersionString` of an XML `Info.plist`, or null. A binary plist
 * (`bplist00`) is not read: electron-builder writes XML, so anything else is not
 * the app that was built.
 */
export function plistShortVersion(plist: Buffer): string | null {
  if (plist.subarray(0, 6).toString("latin1") === "bplist") return null;
  const text = plist.toString("utf8");
  const match = /<key>\s*CFBundleShortVersionString\s*<\/key>\s*<string>([^<]*)<\/string>/.exec(text);
  return match ? match[1]!.trim() : null;
}

function readHeader(file: string, bytes: number): Buffer {
  const handle = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(handle, buffer, 0, bytes, 0);
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(handle);
  }
}

export interface PrepareMacUpdateOptions {
  version: string;
  target: UpdateTarget;
  /** The release's download folder, ending in `/`. */
  downloadBase: string;
  /** `userData/updates`. */
  updatesDir: string;
  /** Main's `net.fetch`; it follows GitHub's redirect to the file's host. */
  fetchImpl: typeof fetch;
  /** js-yaml's `load`. */
  parseYaml: (text: string) => unknown;
  run: RunProgram;
  /** True only for the test feed (`http` on this computer). */
  allowLocalHttp?: boolean;
  onProgress?: (percent: number) => void;
  /** How long the manifest may take. */
  manifestTimeoutMs?: number;
  /** How long the zip may go without a chunk before it counts as stalled. */
  stallMs?: number;
}

/** The manifest is small; the zip is checked for stalls chunk by chunk instead of in total. */
export const MANIFEST_TIMEOUT_MS = 30_000;
export const STALL_TIMEOUT_MS = 30_000;

export interface PreparedMacUpdate {
  /** The unpacked, checked `CuePoint.app`. */
  newApp: string;
}

interface ManifestFile {
  url: string;
  sha512: string;
  size: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An https URL, or http to this computer when `allowLocalHttp`; else throws. */
export function assertSecureUrl(url: string, allowLocalHttp = false): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MacUpdateError("download", "The update address is not a URL.");
  }
  if (parsed.protocol === "https:") return parsed;
  if (allowLocalHttp && parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    return parsed;
  }
  throw new MacUpdateError("download", "Updates are only fetched over HTTPS.");
}

/** The manifest's entry for `fileName`, or throws. */
export function manifestEntry(yamlText: string, fileName: string, parseYaml: (text: string) => unknown): ManifestFile {
  let data: unknown;
  try {
    data = parseYaml(yamlText);
  } catch {
    throw new MacUpdateError("manifest", "latest-mac.yml could not be read.");
  }
  const files = isRecord(data) && Array.isArray(data.files) ? data.files : [];
  for (const file of files) {
    if (!isRecord(file) || file.url !== fileName) continue;
    if (typeof file.sha512 !== "string" || file.sha512 === "") {
      throw new MacUpdateError("manifest", `latest-mac.yml has no checksum for ${fileName}.`);
    }
    if (typeof file.size !== "number" || !Number.isFinite(file.size) || file.size <= 0) {
      throw new MacUpdateError("manifest", `latest-mac.yml has no size for ${fileName}.`);
    }
    return { url: file.url, sha512: file.sha512, size: file.size };
  }
  throw new MacUpdateError("manifest", `latest-mac.yml does not list ${fileName}.`);
}

/** HTTP answers that mean the connection or GitHub's limit, not a bad release. */
const NETWORK_STATUS = new Set([403, 408, 429]);

async function get(url: URL, fetchImpl: typeof fetch, timeoutMs?: number): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url.href, timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : undefined);
  } catch (error) {
    throw new MacUpdateError("network", error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) {
    throw new MacUpdateError(NETWORK_STATUS.has(response.status) ? "network" : "download", `${url.pathname} answered ${response.status}.`);
  }
  return response;
}

/** Streams the response into `file`, answering its SHA-512 (base64) and byte count. */
async function saveBody(
  response: Response,
  file: string,
  expectedSize: number,
  onProgress?: (percent: number) => void,
  stallMs: number = STALL_TIMEOUT_MS,
): Promise<{ sha512: string; size: number }> {
  if (!response.body) throw new MacUpdateError("download", "The download had no content.");
  const hash = createHash("sha512");
  const handle = await fs.promises.open(file, "w");
  let size = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      let stall: ReturnType<typeof setTimeout> | undefined;
      try {
        // A connection that goes quiet is the person's network, not a bad release.
        const stalled = new Promise<never>((_resolve, reject) => {
          stall = setTimeout(() => reject(new MacUpdateError("network", "The download stalled.")), stallMs);
        });
        chunk = await Promise.race([reader.read(), stalled]);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        if (error instanceof MacUpdateError) throw error;
        throw new MacUpdateError("network", error instanceof Error ? error.message : String(error));
      } finally {
        clearTimeout(stall);
      }
      if (chunk.done) break;
      hash.update(chunk.value);
      size += chunk.value.byteLength;
      // More than the manifest says is wrong already; stop before filling the disk.
      if (size > expectedSize) throw new MacUpdateError("size", "The download is larger than its manifest says.");
      await handle.write(chunk.value);
      onProgress?.(Math.min(100, Math.floor((size / expectedSize) * 100)));
    }
  } finally {
    await handle.close();
  }
  return { sha512: hash.digest("base64"), size };
}

function bundleApps(folder: string): string[] {
  try {
    return fs.readdirSync(folder).filter((name) => name.endsWith(".app"));
  } catch {
    return [];
  }
}

/**
 * Downloads, checks and unpacks the chosen release's Mac update. Answers the
 * unpacked app; throws a `MacUpdateError` after deleting everything it wrote.
 */
export async function prepareMacUpdate(options: PrepareMacUpdateOptions): Promise<PreparedMacUpdate> {
  const { version, target, downloadBase, updatesDir, fetchImpl, parseYaml, run, allowLocalHttp, onProgress } = options;
  const manifestTimeoutMs = options.manifestTimeoutMs ?? MANIFEST_TIMEOUT_MS;
  const chip = chipForTarget(target);
  if (chip === null) throw new MacUpdateError("bundle", "This is not a Mac target.");
  const base = downloadBase.endsWith("/") ? downloadBase : `${downloadBase}/`;
  const zipName = targetFileName(version, target);
  const versionDir = path.join(updatesDir, version);

  try {
    const manifestUrl = assertSecureUrl(`${base}latest-mac.yml`, allowLocalHttp);
    const manifestResponse = await get(manifestUrl, fetchImpl, manifestTimeoutMs);
    if (manifestResponse.url) assertSecureUrl(manifestResponse.url, allowLocalHttp);
    let manifestText: string;
    try {
      manifestText = await manifestResponse.text();
    } catch (error) {
      throw new MacUpdateError("network", error instanceof Error ? error.message : String(error));
    }
    const entry = manifestEntry(manifestText, zipName, parseYaml);

    // Whatever an earlier try left is not trusted.
    fs.rmSync(versionDir, { recursive: true, force: true });
    fs.mkdirSync(versionDir, { recursive: true });
    const zipPath = path.join(versionDir, zipName);
    const zipUrl = assertSecureUrl(`${base}${encodeURIComponent(zipName)}`, allowLocalHttp);
    const response = await get(zipUrl, fetchImpl);
    // A redirect must not leave HTTPS.
    if (response.url) assertSecureUrl(response.url, allowLocalHttp);
    const saved = await saveBody(response, zipPath, entry.size, onProgress, options.stallMs);

    if (saved.size !== entry.size) {
      throw new MacUpdateError("size", `The download is ${saved.size} bytes; its manifest says ${entry.size}.`);
    }
    if (saved.sha512 !== entry.sha512) {
      throw new MacUpdateError("checksum", "The download does not match its manifest's SHA-512.");
    }

    const unpacked = path.join(versionDir, "unpacked");
    await run("ditto", ["-x", "-k", zipPath, unpacked]).catch((error: unknown) => {
      throw new MacUpdateError("bundle", `The download could not be unpacked: ${String(error)}`);
    });
    const apps = bundleApps(unpacked);
    if (apps.length !== 1 || apps[0] !== "CuePoint.app") {
      throw new MacUpdateError("bundle", "The download does not hold exactly one CuePoint.app.");
    }
    const newApp = path.join(unpacked, "CuePoint.app");
    // A real folder, not a link to somewhere else.
    if (!fs.lstatSync(newApp).isDirectory()) {
      throw new MacUpdateError("bundle", "CuePoint.app in the download is not a folder.");
    }

    let found: string | null;
    try {
      found = plistShortVersion(fs.readFileSync(path.join(newApp, "Contents", "Info.plist")));
    } catch {
      found = null;
    }
    if (found === null) {
      throw new MacUpdateError("bundle", "The app's Info.plist could not be read as an XML property list.");
    }
    if (found !== version) {
      throw new MacUpdateError("version", `The app is version ${found}, not ${version}.`);
    }
    let archs: MacChip[];
    try {
      archs = machOChips(readHeader(path.join(newApp, "Contents", "MacOS", "CuePoint"), 512));
    } catch {
      archs = [];
    }
    if (!archs.includes(chip)) {
      throw new MacUpdateError("chip", `The app is for ${archs.join(" ") || "no known chip"}, not ${chip}.`);
    }
    return { newApp };
  } catch (error) {
    fs.rmSync(versionDir, { recursive: true, force: true });
    throw error;
  }
}

// --- Install after quit --------------------------------------------------------

/**
 * Arguments: the app's pid, the old bundle, the new bundle, `1` to relaunch.
 * The log is `install.log` beside the script. `CUEPOINT_OPEN_CMD` replaces
 * `open` for tests. No quarantine attribute is set or copied.
 */
export const INSTALL_SCRIPT = `#!/bin/sh
# CuePoint's Mac updater (DIST-06, DEC-170). Started detached by the app as it quits.
pid="$1"
old="$2"
new="$3"
relaunch="$4"
backup="$old.cuepoint-old"
log="$(dirname "$0")/install.log"

note() {
  printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$*" >> "$log" 2>/dev/null
}

# When Restart now asked for the app back, it comes back whatever happened: the new
# one after an install, the old one after anything that left it in place.
reopen() {
  if [ "$relaunch" = "1" ]; then
    "\${CUEPOINT_OPEN_CMD:-open}" "$old"
  fi
}

# Wait for the app to exit: every 0.2 s, for at most 300 ticks (60 s; shorter only in tests).
waited=0
while kill -0 "$pid" 2>/dev/null; do
  waited=$((waited + 1))
  if [ "$waited" -ge "\${CUEPOINT_INSTALL_MAX_TICKS:-300}" ]; then
    note "gave up waiting for $pid; nothing was changed"
    reopen
    exit 0
  fi
  sleep 0.2
done

# An earlier run that died between its two moves left the old app here.
if [ ! -e "$old" ] && [ -e "$backup" ]; then
  mv "$backup" "$old"
fi
if [ ! -d "$new" ]; then
  note "the new app is missing: $new"
  reopen
  exit 1
fi
if ! rm -rf "$backup"; then
  note "could not remove an old backup at $backup"
fi

if ! mv "$old" "$backup"; then
  note "could not move $old aside"
  reopen
  exit 1
fi
if ! mv "$new" "$old"; then
  note "could not move the new app in; putting the old one back"
  rm -rf "$old"
  mv "$backup" "$old"
  reopen
  exit 1
fi
if ! rm -rf "$backup"; then
  note "installed $old but could not remove $backup"
else
  note "installed $old"
fi

reopen
exit 0
`;

/** Writes the script to `<updatesDir>/install.sh` and answers its path. */
export function writeInstallScript(updatesDir: string): string {
  fs.mkdirSync(updatesDir, { recursive: true });
  const script = path.join(updatesDir, "install.sh");
  fs.writeFileSync(script, INSTALL_SCRIPT, { encoding: "utf8", mode: 0o755 });
  return script;
}

export interface StartInstallOptions {
  updatesDir: string;
  pid: number;
  oldApp: string;
  newApp: string;
  relaunch: boolean;
  /**
   * Honour `CUEPOINT_OPEN_CMD` in the script's environment (a test version only).
   * Otherwise the script is started without it, so `open` is always the system's.
   */
  allowOpenOverride?: boolean;
  /** `child_process.spawn`. */
  spawn: (
    file: string,
    args: string[],
    options: { detached: true; stdio: "ignore"; env: NodeJS.ProcessEnv },
  ) => { unref: () => void; on?: (event: "error", listener: () => void) => unknown };
}

/** Starts the install script, detached, so it outlives the app. */
export function startInstall({
  updatesDir,
  pid,
  oldApp,
  newApp,
  relaunch,
  allowOpenOverride = false,
  spawn,
}: StartInstallOptions): void {
  const script = writeInstallScript(updatesDir);
  const env = { ...process.env };
  if (!allowOpenOverride) delete env.CUEPOINT_OPEN_CMD;
  const child = spawn("/bin/sh", [script, String(pid), oldApp, newApp, relaunch ? "1" : "0"], {
    detached: true,
    stdio: "ignore",
    env,
  });
  child.on?.("error", () => undefined);
  child.unref();
}

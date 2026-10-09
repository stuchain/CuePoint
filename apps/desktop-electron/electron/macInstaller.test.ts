import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INSTALL_SCRIPT,
  MacUpdateError,
  assertSecureUrl,
  locateBundle,
  machOChips,
  manifestEntry,
  plistShortVersion,
  prepareMacUpdate,
  startInstall,
  writeInstallScript,
  type RunProgram,
} from "./macInstaller";
import { targetFileName } from "./updateRule";

/**
 * CuePoint's own Mac installer (DIST-06, DEC-170).
 *
 * The network, `ditto`, `plutil` and `lipo` are faked here; the install script
 * is the real one, run with `sh` against a temporary folder.
 */

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuepoint-mac-"));
  made.push(dir);
  return dir;
}

// --- where the app is -----------------------------------------------------------

describe("where the app is", () => {
  const yes = () => true;

  it("finds the bundle above the executable", () => {
    expect(locateBundle("/Applications/CuePoint.app/Contents/MacOS/CuePoint", yes)).toEqual({
      ok: true,
      bundle: "/Applications/CuePoint.app",
    });
  });

  it("is manual from the disk image", () => {
    const where = locateBundle("/Volumes/CuePoint 1.5.0/CuePoint.app/Contents/MacOS/CuePoint", yes);
    expect(where).toMatchObject({ ok: false, reason: "cannot-replace" });
  });

  it("is manual when translocated", () => {
    const where = locateBundle(
      "/private/var/folders/xx/T/AppTranslocation/ABC-123/d/CuePoint.app/Contents/MacOS/CuePoint",
      yes,
    );
    expect(where).toMatchObject({ ok: false, reason: "cannot-replace" });
  });

  it("is manual when the folder the app is in cannot be written", () => {
    const where = locateBundle("/Applications/CuePoint.app/Contents/MacOS/CuePoint", (p) => p !== "/Applications");
    expect(where).toMatchObject({ ok: false, reason: "cannot-replace" });
  });

  it("is manual when the bundle itself cannot be written", () => {
    const where = locateBundle(
      "/Applications/CuePoint.app/Contents/MacOS/CuePoint",
      (p) => p !== "/Applications/CuePoint.app",
    );
    expect(where).toMatchObject({ ok: false, reason: "cannot-replace" });
  });

  it("is manual when there is no bundle at all", () => {
    expect(locateBundle("/usr/local/bin/electron", yes)).toMatchObject({ ok: false, reason: "cannot-replace" });
  });

  it("checks the real folder with the real write test", () => {
    const root = tempDir();
    const exe = path.join(root, "CuePoint.app", "Contents", "MacOS", "CuePoint");
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    expect(locateBundle(exe)).toEqual({ ok: true, bundle: path.join(root, "CuePoint.app") });
  });
});

// --- the manifest and the address ------------------------------------------------

describe("the manifest", () => {
  const parseYaml = (text: string): unknown => JSON.parse(text);
  const zip = "CuePoint-1.5.0-mac-arm64.zip";

  it("finds the chip's zip among both chips'", () => {
    const text = JSON.stringify({
      files: [
        { url: "CuePoint-1.5.0-mac-x64.zip", sha512: "x", size: 1 },
        { url: zip, sha512: "abc", size: 5 },
      ],
    });
    expect(manifestEntry(text, zip, parseYaml)).toEqual({ url: zip, sha512: "abc", size: 5 });
  });

  it.each([
    ["not YAML at all", "{nope"],
    ["no files", JSON.stringify({ version: "1.5.0" })],
    ["no entry for the zip", JSON.stringify({ files: [{ url: "other.zip", sha512: "a", size: 1 }] })],
    ["no checksum", JSON.stringify({ files: [{ url: zip, size: 1 }] })],
    ["no size", JSON.stringify({ files: [{ url: zip, sha512: "a" }] })],
  ])("refuses %s", (_what, text) => {
    expect(() => manifestEntry(text, zip, parseYaml)).toThrow(MacUpdateError);
  });
});

describe("addresses", () => {
  it("accepts https", () => {
    expect(assertSecureUrl("https://github.com/x").protocol).toBe("https:");
  });
  it("refuses http, other schemes and garbage", () => {
    expect(() => assertSecureUrl("http://github.com/x")).toThrow(MacUpdateError);
    expect(() => assertSecureUrl("file:///etc/passwd")).toThrow(MacUpdateError);
    expect(() => assertSecureUrl("nope")).toThrow(MacUpdateError);
  });
  it("accepts http to this computer only when the test feed allows it", () => {
    expect(() => assertSecureUrl("http://127.0.0.1:8000/x")).toThrow(MacUpdateError);
    expect(assertSecureUrl("http://127.0.0.1:8000/x", true).hostname).toBe("127.0.0.1");
    expect(assertSecureUrl("http://localhost:8000/x", true).hostname).toBe("localhost");
    expect(() => assertSecureUrl("http://example.com/x", true)).toThrow(MacUpdateError);
  });
});

// --- download, check, unpack -----------------------------------------------------

const VERSION = "1.5.0";
const BASE = `https://github.com/stuchain/CuePoint/releases/download/v${VERSION}/`;
const ZIP_BYTES = Buffer.from("pretend this is a zip");
const ZIP_SHA = createHash("sha512").update(ZIP_BYTES).digest("base64");

function xmlPlist(version: string): Buffer {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>\n<key>CFBundleName</key><string>CuePoint</string>\n<key>CFBundleShortVersionString</key>\n\t<string>${version}</string>\n<key>CFBundleVersion</key><string>9</string></dict></plist>`,
  );
}

const ARM = 0x0100000c;
const X64 = 0x01000007;

/** A thin 64-bit Mach-O header for one chip (little-endian on disk). */
function thin(chip: "arm64" | "x86_64"): Buffer {
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf, 0);
  header.writeUInt32LE(chip === "arm64" ? ARM : X64, 4);
  return header;
}

/** A fat header (always big-endian) listing the chips, 32-bit or 64-bit offsets. */
function fat(chips: Array<"arm64" | "x86_64">, wide = false): Buffer {
  const entry = wide ? 32 : 20;
  const header = Buffer.alloc(8 + chips.length * entry);
  header.writeUInt32BE(wide ? 0xcafebabf : 0xcafebabe, 0);
  header.writeUInt32BE(chips.length, 4);
  chips.forEach((chip, i) => header.writeUInt32BE(chip === "arm64" ? ARM : X64, 8 + i * entry));
  return header;
}

interface Scenario {
  bytes?: Buffer;
  manifestSha?: string;
  manifestSize?: number;
  plistVersion?: string;
  /** The executable's bytes; thin arm64 unless given. */
  executable?: Buffer;
  /** The plist's bytes; an XML plist of `plistVersion` unless given. */
  plist?: Buffer;
  apps?: string[];
  /** Make CuePoint.app a link to this folder instead of a folder. */
  appIsLinkTo?: string;
  manifestUrl?: string;
  /** A zip body that goes quiet after its first bytes. */
  stallZip?: boolean;
  stallManifest?: boolean;
  manifestStatus?: number;
  zipStatus?: number;
  fetchThrows?: boolean;
}

function scenario(overrides: Scenario = {}) {
  const updatesDir = tempDir();
  const target = "mac-arm64" as const;
  const zipName = targetFileName(VERSION, target);
  const bytes = overrides.bytes ?? ZIP_BYTES;
  const manifest = JSON.stringify({
    files: [
      { url: targetFileName(VERSION, "mac-x64"), sha512: "other", size: 1 },
      { url: zipName, sha512: overrides.manifestSha ?? ZIP_SHA, size: overrides.manifestSize ?? ZIP_BYTES.length },
    ],
  });
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    if (overrides.fetchThrows) throw new TypeError("fetch failed");
    if (url.endsWith("latest-mac.yml")) {
      if (overrides.stallManifest) {
        // Never answers; only the caller's timeout signal ends it.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")));
        });
      }
      const response = new Response(manifest, { status: overrides.manifestStatus ?? 200 });
      if (overrides.manifestUrl) Object.defineProperty(response, "url", { value: overrides.manifestUrl });
      return response;
    }
    if (overrides.stallZip) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(bytes.subarray(0, 3)));
          // ...and then nothing, ever.
        },
      });
      return new Response(stream, { status: 200 });
    }
    return new Response(bytes, { status: overrides.zipStatus ?? 200 });
  }) as unknown as typeof fetch;
  const calls: Array<[string, string[]]> = [];
  const run: RunProgram = async (file, args) => {
    calls.push([file, args]);
    if (file === "ditto") {
      const out = args[args.length - 1]!;
      fs.mkdirSync(out, { recursive: true });
      for (const app of overrides.apps ?? ["CuePoint.app"]) {
        const dir = path.join(out, app);
        if (overrides.appIsLinkTo) {
          fs.symlinkSync(overrides.appIsLinkTo, dir);
          continue;
        }
        fs.mkdirSync(path.join(dir, "Contents", "MacOS"), { recursive: true });
        fs.writeFileSync(
          path.join(dir, "Contents", "Info.plist"),
          overrides.plist ?? xmlPlist(overrides.plistVersion ?? VERSION),
        );
        fs.writeFileSync(path.join(dir, "Contents", "MacOS", "CuePoint"), overrides.executable ?? thin("arm64"));
      }
      return "";
    }
    throw new Error(`unexpected ${file}`);
  };
  const progress: number[] = [];
  const options = {
    version: VERSION,
    target,
    downloadBase: BASE,
    updatesDir,
    fetchImpl,
    parseYaml: (text: string): unknown => JSON.parse(text),
    run,
    onProgress: (percent: number) => progress.push(percent),
    manifestTimeoutMs: 50,
    stallMs: 50,
  };
  return { options, updatesDir, zipName, calls, urls, progress, fetchImpl };
}

async function failure(promise: Promise<unknown>): Promise<MacUpdateError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(MacUpdateError);
    return error as MacUpdateError;
  }
  throw new Error("expected the update to fail");
}

describe("preparing an update", () => {
  it("downloads the chip's zip over HTTPS, checks it and unpacks it", async () => {
    const s = scenario();
    const prepared = await prepareMacUpdate(s.options);

    expect(prepared.newApp).toBe(path.join(s.updatesDir, VERSION, "unpacked", "CuePoint.app"));
    expect(fs.existsSync(prepared.newApp)).toBe(true);
    expect(s.urls).toEqual([`${BASE}latest-mac.yml`, `${BASE}${s.zipName}`]);
    expect(fs.readFileSync(path.join(s.updatesDir, VERSION, s.zipName))).toEqual(ZIP_BYTES);
    expect(s.calls.map(([file]) => file)).toEqual(["ditto"]); // no plutil, no lipo
    expect(s.calls[0]![1].slice(0, 2)).toEqual(["-x", "-k"]);
    expect(s.progress.at(-1)).toBe(100);
  });

  it("deletes the download when the checksum differs", async () => {
    const s = scenario({ manifestSha: createHash("sha512").update("something else").digest("base64") });
    const error = await failure(prepareMacUpdate(s.options));
    expect(error.kind).toBe("checksum");
    expect(fs.existsSync(path.join(s.updatesDir, VERSION))).toBe(false);
    expect(s.calls).toEqual([]); // nothing was unpacked
  });

  it("deletes the download when the size differs", async () => {
    const s = scenario({ manifestSize: ZIP_BYTES.length + 10 });
    const error = await failure(prepareMacUpdate(s.options));
    expect(error.kind).toBe("size");
    expect(fs.existsSync(path.join(s.updatesDir, VERSION))).toBe(false);
  });

  it("stops a download that is larger than its manifest says", async () => {
    const s = scenario({ manifestSize: 3 });
    const error = await failure(prepareMacUpdate(s.options));
    expect(error.kind).toBe("size");
  });

  it("fails and deletes the app when its version is not the chosen one", async () => {
    const s = scenario({ plistVersion: "1.4.0" });
    const error = await failure(prepareMacUpdate(s.options));
    expect(error.kind).toBe("version");
    expect(fs.existsSync(path.join(s.updatesDir, VERSION))).toBe(false);
  });

  it("fails and deletes the app when it is for the other chip", async () => {
    const s = scenario({ executable: thin("x86_64") });
    const error = await failure(prepareMacUpdate(s.options));
    expect(error.kind).toBe("chip");
    expect(fs.existsSync(path.join(s.updatesDir, VERSION))).toBe(false);
  });

  it("accepts a universal app for either chip", async () => {
    const s = scenario({ executable: fat(["x86_64", "arm64"]) });
    await expect(prepareMacUpdate(s.options)).resolves.toBeDefined();
  });

  it.each([
    ["no app", []],
    ["two apps", ["CuePoint.app", "Other.app"]],
    ["an app with another name", ["Other.app"]],
  ])("fails on a zip with %s", async (_what, apps) => {
    const s = scenario({ apps });
    const error = await failure(prepareMacUpdate(s.options));
    expect(error.kind).toBe("bundle");
    expect(fs.existsSync(path.join(s.updatesDir, VERSION))).toBe(false);
  });

  it("calls an unreachable network a network failure, which is not reported", async () => {
    const s = scenario({ fetchThrows: true });
    expect((await failure(prepareMacUpdate(s.options))).kind).toBe("network");
  });

  it.each([403, 429])("calls HTTP %i a network failure", async (status) => {
    const s = scenario({ zipStatus: status });
    expect((await failure(prepareMacUpdate(s.options))).kind).toBe("network");
  });

  it("calls a missing file a download failure", async () => {
    const s = scenario({ zipStatus: 404 });
    expect((await failure(prepareMacUpdate(s.options))).kind).toBe("download");
  });

  it("refuses a feed that is not HTTPS", async () => {
    const s = scenario();
    const error = await failure(prepareMacUpdate({ ...s.options, downloadBase: "http://example.com/v1/" }));
    expect(error.kind).toBe("download");
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it("reads a local test feed over http when allowed", async () => {
    const s = scenario();
    await expect(
      prepareMacUpdate({ ...s.options, downloadBase: "http://127.0.0.1:8000/v1.5.0/", allowLocalHttp: true }),
    ).resolves.toBeDefined();
  });

  it("fails on a binary property list", async () => {
    const s = scenario({ plist: Buffer.from("bplist00\u0000\u0001") });
    expect((await failure(prepareMacUpdate(s.options))).kind).toBe("bundle");
  });

  it("fails when CuePoint.app is a link, not a folder", async () => {
    const elsewhere = tempDir();
    const s = scenario({ appIsLinkTo: elsewhere });
    const error = await failure(prepareMacUpdate(s.options));
    expect(error.kind).toBe("bundle");
    expect(fs.existsSync(path.join(s.updatesDir, VERSION))).toBe(false);
  });

  it("fails when the executable is garbage", async () => {
    const s = scenario({ executable: Buffer.from("not a mach-o at all") });
    expect((await failure(prepareMacUpdate(s.options))).kind).toBe("chip");
  });

  it("refuses a manifest that was redirected off HTTPS", async () => {
    const s = scenario({ manifestUrl: "http://example.com/latest-mac.yml" });
    expect((await failure(prepareMacUpdate(s.options))).kind).toBe("download");
  });

  it("gives up on a manifest that never answers, as a network failure", async () => {
    const s = scenario({ stallManifest: true });
    expect((await failure(prepareMacUpdate(s.options))).kind).toBe("network");
  });

  it("gives up on a zip that stalls, as a network failure, and deletes it", async () => {
    const s = scenario({ stallZip: true });
    expect((await failure(prepareMacUpdate(s.options))).kind).toBe("network");
    expect(fs.existsSync(path.join(s.updatesDir, VERSION))).toBe(false);
  });

  it("never sets the quarantine flag in its script", () => {
    expect(INSTALL_SCRIPT).not.toMatch(/xattr/);
  });
});

describe("reading a Mach-O header", () => {
  it("reads a thin arm64 and a thin x86_64 executable", () => {
    expect(machOChips(thin("arm64"))).toEqual(["arm64"]);
    expect(machOChips(thin("x86_64"))).toEqual(["x86_64"]);
  });

  it("walks a fat header, 32-bit and 64-bit", () => {
    expect(machOChips(fat(["x86_64", "arm64"]))).toEqual(["x86_64", "arm64"]);
    expect(machOChips(fat(["arm64"], true))).toEqual(["arm64"]);
    expect(machOChips(fat(["x86_64", "arm64"], true))).toEqual(["x86_64", "arm64"]);
  });

  it("gives none for garbage, a short buffer or an unknown chip", () => {
    expect(machOChips(Buffer.from("hello world, this is not a binary"))).toEqual([]);
    expect(machOChips(Buffer.alloc(3))).toEqual([]);
    const ppc = thin("arm64");
    ppc.writeUInt32LE(0x12, 4);
    expect(machOChips(ppc)).toEqual([]);
  });

  it("survives a fat header that lies about its count", () => {
    const lying = fat(["arm64"]);
    lying.writeUInt32BE(1_000_000, 4);
    expect(machOChips(lying)).toEqual(["arm64"]);
  });
});

describe("reading Info.plist", () => {
  it("finds the version in an XML plist", () => {
    expect(plistShortVersion(xmlPlist("1.5.0-test.2"))).toBe("1.5.0-test.2");
  });
  it("refuses a binary plist and a plist without the key", () => {
    expect(plistShortVersion(Buffer.from("bplist00xxxx"))).toBeNull();
    expect(plistShortVersion(Buffer.from("<plist><dict></dict></plist>"))).toBeNull();
  });
});

// --- the install script ----------------------------------------------------------

interface Layout {
  root: string;
  updates: string;
  oldApp: string;
  newApp: string;
  openLog: string;
  openCmd: string;
}

function layout(options: { newApp?: boolean } = {}): Layout {
  const root = tempDir();
  const updates = path.join(root, "updates");
  const oldApp = path.join(root, "Applications", "CuePoint.app");
  const newApp = path.join(updates, "1.5.0", "unpacked", "CuePoint.app");
  fs.mkdirSync(path.join(oldApp, "Contents"), { recursive: true });
  fs.writeFileSync(path.join(oldApp, "Contents", "version"), "old");
  if (options.newApp !== false) {
    fs.mkdirSync(path.join(newApp, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(newApp, "Contents", "version"), "new");
  }
  const openLog = path.join(root, "open.log");
  const openCmd = path.join(root, "fake-open.sh");
  fs.writeFileSync(openCmd, `#!/bin/sh\necho "$@" >> "${openLog}"\n`, { mode: 0o755 });
  return { root, updates, oldApp, newApp, openLog, openCmd };
}

function runScript(
  l: Layout,
  pid: number,
  relaunch: boolean,
  extraEnv: Record<string, string> = {},
): Promise<number | null> {
  const script = writeInstallScript(l.updates);
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", [script, String(pid), l.oldApp, l.newApp, relaunch ? "1" : "0"], {
      stdio: "ignore",
      env: { ...process.env, CUEPOINT_OPEN_CMD: l.openCmd, ...extraEnv },
    });
    child.on("exit", (code) => resolve(code));
  });
}

const read = (app: string): string => fs.readFileSync(path.join(app, "Contents", "version"), "utf8");

describe("the install script", () => {
  it("is plain sh with every path quoted", () => {
    expect(INSTALL_SCRIPT.startsWith("#!/bin/sh\n")).toBe(true);
    const check = spawnSync("/bin/sh", ["-n"], { input: INSTALL_SCRIPT });
    expect(check.status).toBe(0);
  });

  it("waits for the process to exit, then swaps the bundles", async () => {
    const l = layout();
    // A short-lived child standing in for the app.
    const app = spawn("/bin/sh", ["-c", "sleep 1"], { stdio: "ignore" });
    const exited = new Promise<void>((resolve) => app.on("exit", () => resolve()));
    const done = runScript(l, app.pid!, false);

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(read(l.oldApp)).toBe("old"); // the app is still running: nothing touched

    await exited;
    expect(await done).toBe(0);
    expect(read(l.oldApp)).toBe("new");
    expect(fs.existsSync(`${l.oldApp}.cuepoint-old`)).toBe(false);
    expect(fs.existsSync(l.newApp)).toBe(false);
    expect(fs.readFileSync(path.join(l.updates, "install.log"), "utf8")).toContain("installed");
  });

  it("puts the old app back when the new one cannot be moved in", async () => {
    const l = layout({ newApp: false });
    expect(await runScript(l, 2 ** 22 + 12345, false)).toBe(1);
    expect(read(l.oldApp)).toBe("old");
    expect(fs.existsSync(`${l.oldApp}.cuepoint-old`)).toBe(false);
    expect(fs.existsSync(l.openLog)).toBe(false);
  });

  it("puts the old app back when the move in fails half way", async () => {
    const l = layout();
    // `mv` that fails for the second move, standing in for a full disk.
    const bin = path.join(l.root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "mv"),
      `#!/bin/sh\ncase "$1" in\n  "${l.newApp}") mkdir -p "$2/Contents"; exit 1;;\nesac\nexec /bin/mv "$@"\n`,
      { mode: 0o755 },
    );
    const code = await runScript(l, 2 ** 22 + 12345, true, { PATH: `${bin}:${process.env.PATH ?? ""}` });
    expect(code).toBe(1);
    expect(read(l.oldApp)).toBe("old");
    expect(fs.existsSync(`${l.oldApp}.cuepoint-old`)).toBe(false);
    // Restart now asked for the app back, so the restored old one is opened.
    expect(fs.readFileSync(l.openLog, "utf8").trim()).toBe(l.oldApp);
  });

  it("opens the old app when the new one is missing and Restart now asked", async () => {
    const l = layout({ newApp: false });
    expect(await runScript(l, 2 ** 22 + 12345, true)).toBe(1);
    expect(read(l.oldApp)).toBe("old");
    expect(fs.readFileSync(l.openLog, "utf8").trim()).toBe(l.oldApp);
  });

  it("gives up waiting for a process that never exits, touches nothing, and opens the app when asked", async () => {
    const l = layout();
    const stubborn = spawn("/bin/sh", ["-c", "sleep 5"], { stdio: "ignore" });
    try {
      const code = await runScript(l, stubborn.pid!, true, { CUEPOINT_INSTALL_MAX_TICKS: "3" });
      expect(code).toBe(0);
      expect(read(l.oldApp)).toBe("old");
      expect(fs.existsSync(l.newApp)).toBe(true);
      expect(fs.readFileSync(path.join(l.updates, "install.log"), "utf8")).toContain("gave up waiting");
      expect(fs.readFileSync(l.openLog, "utf8").trim()).toBe(l.oldApp);
    } finally {
      stubborn.kill();
    }
  });

  it("opens the new app only when Restart now asked", async () => {
    const withRelaunch = layout();
    expect(await runScript(withRelaunch, 2 ** 22 + 12345, true)).toBe(0);
    expect(fs.readFileSync(withRelaunch.openLog, "utf8").trim()).toBe(withRelaunch.oldApp);

    const without = layout();
    expect(await runScript(without, 2 ** 22 + 12345, false)).toBe(0);
    expect(fs.existsSync(without.openLog)).toBe(false);
    expect(read(without.oldApp)).toBe("new");
  });

  it("copes with spaces in the paths", async () => {
    const l = layout();
    const spaced = path.join(l.root, "My Apps", "Cue Point.app");
    fs.mkdirSync(path.dirname(spaced), { recursive: true });
    fs.renameSync(l.oldApp, spaced);
    const moved: Layout = { ...l, oldApp: spaced };
    expect(await runScript(moved, 2 ** 22 + 12345, true)).toBe(0);
    expect(read(spaced)).toBe("new");
    expect(fs.readFileSync(l.openLog, "utf8").trim()).toBe(spaced);
  });

  it("does not leave a moved-aside app from an earlier run in the way", async () => {
    const l = layout();
    fs.mkdirSync(`${l.oldApp}.cuepoint-old`);
    expect(await runScript(l, 2 ** 22 + 12345, false)).toBe(0);
    expect(read(l.oldApp)).toBe("new");
    expect(fs.existsSync(`${l.oldApp}.cuepoint-old`)).toBe(false);
  });
});

describe("starting the script", () => {
  it("is detached with no stdio, and unreferenced", () => {
    const updates = tempDir();
    const unref = vi.fn();
    const spawnFake = vi.fn(() => ({ unref }));
    startInstall({ updatesDir: updates, pid: 4242, oldApp: "/A/CuePoint.app", newApp: "/U/CuePoint.app", relaunch: true, spawn: spawnFake });
    expect(spawnFake).toHaveBeenCalledWith(
      "/bin/sh",
      [path.join(updates, "install.sh"), "4242", "/A/CuePoint.app", "/U/CuePoint.app", "1"],
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    );
    expect(unref).toHaveBeenCalled();
    expect(fs.statSync(path.join(updates, "install.sh")).mode & 0o111).not.toBe(0);
  });

  it("strips CUEPOINT_OPEN_CMD from the script's environment unless a test version allows it", () => {
    const before = process.env.CUEPOINT_OPEN_CMD;
    process.env.CUEPOINT_OPEN_CMD = "/tmp/evil";
    try {
      const spawnFake = vi.fn(() => ({ unref: vi.fn() }));
      const base = { updatesDir: tempDir(), pid: 1, oldApp: "a", newApp: "b", relaunch: true, spawn: spawnFake };
      startInstall(base);
      startInstall({ ...base, allowOpenOverride: true });
      const calls = spawnFake.mock.calls as unknown as Array<[string, string[], { env: NodeJS.ProcessEnv }]>;
      expect(calls[0]![2].env.CUEPOINT_OPEN_CMD).toBeUndefined();
      expect(calls[1]![2].env.CUEPOINT_OPEN_CMD).toBe("/tmp/evil");
    } finally {
      if (before === undefined) delete process.env.CUEPOINT_OPEN_CMD;
      else process.env.CUEPOINT_OPEN_CMD = before;
    }
  });

  it("passes 0 when Restart now did not ask", () => {
    const spawnFake = vi.fn(() => ({ unref: vi.fn() }));
    startInstall({ updatesDir: tempDir(), pid: 1, oldApp: "a", newApp: "b", relaunch: false, spawn: spawnFake });
    expect((spawnFake.mock.calls[0] as unknown as [string, string[]])[1][4]).toBe("0");
  });
});

describe.skipIf(process.platform !== "darwin")("quarantine (real xattr, Mac only)", () => {
  it("is not on anything the installer writes", async () => {
    const s = scenario();
    const prepared = await prepareMacUpdate(s.options);
    const l = layout();
    const check = (target: string): string =>
      spawnSync("xattr", [target], { encoding: "utf8" }).stdout;
    expect(check(path.join(s.updatesDir, VERSION, s.zipName))).not.toContain("com.apple.quarantine");
    expect(check(prepared.newApp)).not.toContain("com.apple.quarantine");
    expect(await runScript(l, 2 ** 22 + 12345, false)).toBe(0);
    expect(check(l.oldApp)).not.toContain("com.apple.quarantine");
    expect(check(path.join(l.updates, "install.sh"))).not.toContain("com.apple.quarantine");
  });
});

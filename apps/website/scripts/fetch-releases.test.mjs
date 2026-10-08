import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  NONE_YET,
  buildReleaseData,
  compareVersions,
  fileInfo,
  isOfferable,
  parseChecksums,
  parseVersion,
  isStrict,
  listReleases,
  pickRelease,
  run as runWith,
} from "./fetch-releases.mjs";

const LIST = JSON.parse(readFileSync(new URL("./fixtures/release-list.json", import.meta.url), "utf8"));
const CHECKSUMS = JSON.parse(readFileSync(new URL("./fixtures/checksums-1.1.0.json", import.meta.url), "utf8"));

/** Reads a checksum file the way the build does, from the recorded texts. */
const fetchText = async (url) => {
  const name = url.slice(url.lastIndexOf("/") + 1);
  if (!(name in CHECKSUMS)) throw new Error(`not recorded: ${url}`);
  return CHECKSUMS[name];
};

// a developer's environment: the tests set CI and PUBLIC themselves when they mean to
const run = (options) => runWith({ env: {}, ...options });

const NOW = () => new Date("2026-12-16T00:00:00.000Z");

describe("version rules (a copy of DIST-05's updateRule.ts, same examples)", () => {
  it.each([
    ["1.4.0", { major: 1, minor: 4, patch: 0, test: null }],
    ["v1.4.0", { major: 1, minor: 4, patch: 0, test: null }],
    ["0.0.3", { major: 0, minor: 0, patch: 3, test: null }],
    ["1.4.0-test.2", { major: 1, minor: 4, patch: 0, test: 2 }],
    ["v1.0.0-test.10", { major: 1, minor: 0, patch: 0, test: 10 }],
  ])("reads %s", (text, parsed) => {
    expect(parseVersion(text)).toEqual(parsed);
  });

  it.each([
    "1.0.0-feb1-test1",
    "1.0.0-feb1",
    "1.0.0-test1",
    "1.0.0-test.0",
    "1.0.0-test.01",
    "1.0.0-beta.1",
    "1.0.0+build5",
    "01.0.0",
    "1.0",
    "",
    " 1.0.0",
    "V1.0.0",
    "9007199254740992.0.0",
  ])("rejects %j", (text) => {
    expect(parseVersion(text)).toBeNull();
  });

  it("orders by precedence, test below normal, test numbers as numbers", () => {
    expect(compareVersions("1.4.0-test.2", "1.4.0")).toBeLessThan(0);
    expect(compareVersions("1.4.0", "1.4.0-test.2")).toBeGreaterThan(0);
    expect(compareVersions("1.4.0-test.9", "1.4.0-test.10")).toBeLessThan(0);
    expect(compareVersions("1.4.0-test.2", "1.4.0-test.2")).toBe(0);
    expect(compareVersions("v1.4.1", "1.4.0")).toBeGreaterThan(0);
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
  });

  it("throws on a version outside the scheme", () => {
    expect(() => compareVersions("1.0.0-feb1-test1", "1.0.0")).toThrow();
  });
});

describe("isOfferable", () => {
  const rel = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra });
  it("accepts a normal release at 1.0.0 or later", () => {
    expect(isOfferable(rel("v1.0.0"))).toBe(true);
    expect(isOfferable(rel("v2.3.4"))).toBe(true);
  });
  it.each([
    ["a draft", rel("v1.0.0", { draft: true })],
    ["GitHub's pre-release flag", rel("v1.0.0", { prerelease: true })],
    ["a -test.N version", rel("v1.0.0-test.1")],
    ["a version of the retired app", rel("v0.0.3")],
    ["the retired app's v0.9.9", rel("v0.9.9")],
    ["a tag outside the scheme", rel("v1.0.0-feb1-test1")],
  ])("skips %s", (_name, release) => {
    expect(isOfferable(release)).toBe(false);
  });
});

describe("fileInfo (DIST-03's names)", () => {
  it.each([
    ["CuePoint-1.1.0-win-x64-setup.exe", { system: "windows", chip: "x64" }],
    ["CuePoint-1.1.0-mac-arm64.dmg", { system: "macos", chip: "arm64" }],
    ["CuePoint-1.1.0-mac-x64.dmg", { system: "macos", chip: "x64" }],
    ["CuePoint-1.1.0-linux-x86_64.AppImage", { system: "linux", chip: "x64" }],
  ])("%s", (name, info) => {
    expect(fileInfo(name, "1.1.0")).toEqual(info);
  });

  it.each([
    "CuePoint-1.1.0-mac-arm64.zip", // the updater's file, not offered to people
    "CuePoint-1.1.0-win-x64-setup.exe.blockmap",
    "CuePoint-1.1.0-win-arm64-setup.exe",
    "CuePoint-1.0.0-win-x64-setup.exe", // another version's name
    "CuePoint-1.1.0-notes.pdf",
    "latest.yml",
    "SHA256SUMS-windows-x64.txt",
  ])("ignores %s", (name) => {
    expect(fileInfo(name, "1.1.0")).toBeNull();
  });
});

describe("parseChecksums", () => {
  it("reads 'hash  name' lines, with the binary-mode star and blank lines", () => {
    const a = "a".repeat(64);
    const b = "B".repeat(64);
    const map = parseChecksums(`${a}  one.exe\n\n${b} *two.dmg\r\nnot a line\n`);
    expect(map.get("one.exe")).toBe(a);
    expect(map.get("two.dmg")).toBe("b".repeat(64));
    expect(map.size).toBe(2);
  });
});

describe("pickRelease", () => {
  it("takes the highest normal release by version, not by position or date", () => {
    expect(pickRelease(LIST)?.tag_name).toBe("v1.1.0");
  });

  it("gives null when the list holds only test releases, drafts and the retired app", () => {
    const onlyTests = LIST.filter((r) => ["v1.0.0-test.2", "v1.2.0", "v1.3.0", "v1.0.0-feb1-test1", "v0.0.3"].includes(r.tag_name));
    expect(onlyTests.length).toBe(5);
    expect(pickRelease(onlyTests)).toBeNull();
  });
});

describe("buildReleaseData", () => {
  it("keeps only DIST-03's installers, with size, checksum and url", async () => {
    const data = await buildReleaseData(LIST, { fetchText, now: NOW });
    expect(data.release).toEqual({
      version: "1.1.0",
      tag: "v1.1.0",
      publishedAt: "2026-12-15T10:00:00Z",
      notesUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.1.0",
    });
    expect(data.fetchedAt).toBe("2026-12-16T00:00:00.000Z");
    expect(data.files.map((f) => f.name)).toEqual([
      "CuePoint-1.1.0-win-x64-setup.exe",
      "CuePoint-1.1.0-mac-arm64.dmg",
      "CuePoint-1.1.0-mac-x64.dmg",
      "CuePoint-1.1.0-linux-x86_64.AppImage",
    ]);
    const win = data.files[0];
    expect(win).toEqual({
      name: "CuePoint-1.1.0-win-x64-setup.exe",
      system: "windows",
      chip: "x64",
      size: 91234567,
      sha256: "1".repeat(64),
      url: "https://github.com/stuchain/CuePoint/releases/download/v1.1.0/CuePoint-1.1.0-win-x64-setup.exe",
    });
    expect(data.files[1]).toMatchObject({ system: "macos", chip: "arm64", sha256: "2".repeat(64) });
    expect(data.files[2]).toMatchObject({ system: "macos", chip: "x64", sha256: "4".repeat(64) });
    expect(data.files[3]).toMatchObject({ system: "linux", chip: "x64", sha256: "6".repeat(64) });
  });

  it("gives the none-yet state for a list with only test releases", async () => {
    const onlyTests = LIST.filter((r) => r.tag_name.includes("-test.") || r.draft || r.prerelease);
    const data = await buildReleaseData(onlyTests, { fetchText, now: NOW });
    expect(data).toEqual({ release: null, files: [], fetchedAt: "2026-12-16T00:00:00.000Z" });
  });

  it("refuses a release with no installer, so a half-uploaded release never publishes", async () => {
    const bare = [{ ...LIST[4], assets: LIST[4].assets.filter((a) => !/\.(exe|dmg|AppImage)$/.test(a.name)) }];
    await expect(buildReleaseData(bare, { fetchText, now: NOW })).rejects.toThrow(/missing installer/i);
  });

  it("refuses a release that lacks any one of the four installers", async () => {
    for (const gone of ["win-x64-setup.exe", "mac-arm64.dmg", "mac-x64.dmg", "linux-x86_64.AppImage"]) {
      const partial = [{ ...LIST[4], assets: LIST[4].assets.filter((a) => !a.name.endsWith(gone)) }];
      await expect(buildReleaseData(partial, { fetchText, now: NOW }), gone).rejects.toThrow(/missing installer/i);
    }
  });

  it("refuses a release whose installer has no checksum", async () => {
    const noSums = async (url) => (url.endsWith("SHA256SUMS-linux-x64.txt") ? "" : fetchText(url));
    await expect(buildReleaseData(LIST, { fetchText: noSums, now: NOW })).rejects.toThrow(/checksum/i);
  });

  it("refuses a release when a checksum file cannot be read", async () => {
    const broken = async () => {
      throw new Error("503");
    };
    await expect(buildReleaseData(LIST, { fetchText: broken, now: NOW })).rejects.toThrow();
  });
});

describe("run", () => {
  const dir = mkdtempSync(join(tmpdir(), "releases-"));
  const output = join(dir, "releases.json");
  const lastGood = {
    release: { version: "1.0.0", tag: "v1.0.0", publishedAt: "2026-12-10T10:00:00Z", notesUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.0.0" },
    files: [
      {
        name: "CuePoint-1.0.0-win-x64-setup.exe",
        system: "windows",
        chip: "x64",
        size: 1,
        sha256: "f".repeat(64),
        url: "https://github.com/stuchain/CuePoint/releases/download/v1.0.0/CuePoint-1.0.0-win-x64-setup.exe",
      },
    ],
    fetchedAt: "2026-12-11T00:00:00.000Z",
  };
  const reset = (content) => writeFileSync(output, JSON.stringify(content, null, 2) + "\n");
  const read = () => JSON.parse(readFileSync(output, "utf8"));

  it("writes the newest release's data", async () => {
    reset(NONE_YET("2026-10-08T00:00:00.000Z"));
    const log = vi.fn();
    const result = await run({ output, listReleases: async () => LIST, fetchText, now: NOW, log });
    expect(result.status).toBe("updated");
    expect(read().release.version).toBe("1.1.0");
    expect(read().files).toHaveLength(4);
  });

  it("writes none-yet when only test releases exist", async () => {
    reset(lastGood);
    const onlyTests = LIST.filter((r) => r.prerelease || r.draft);
    const result = await run({ output, listReleases: async () => onlyTests, fetchText, now: NOW, log: vi.fn() });
    expect(result.status).toBe("updated");
    expect(read().release).toBeNull();
    expect(read().files).toEqual([]);
  });

  it("does not rewrite the file when only the time would change", async () => {
    const data = await buildReleaseData(LIST, { fetchText, now: NOW });
    reset(data);
    const later = () => new Date("2027-01-01T00:00:00.000Z");
    const result = await run({ output, listReleases: async () => LIST, fetchText, now: later, log: vi.fn() });
    expect(result.status).toBe("unchanged");
    expect(read().fetchedAt).toBe("2026-12-16T00:00:00.000Z");
  });

  it("keeps the last data, logs it, and fails nothing when the read fails", async () => {
    reset(lastGood);
    const log = vi.fn();
    const result = await run({
      output,
      listReleases: async () => {
        throw new Error("getaddrinfo ENOTFOUND api.github.com");
      },
      fetchText,
      now: NOW,
      log,
    });
    expect(result.status).toBe("kept");
    expect(read()).toEqual(lastGood);
    expect(log.mock.calls.flat().join(" ")).toMatch(/keeping the last data/i);
    expect(log.mock.calls.flat().join(" ")).toMatch(/ENOTFOUND/);
  });

  it("keeps the last data when the list is not a list", async () => {
    reset(lastGood);
    const result = await run({ output, listReleases: async () => ({ message: "rate limited" }), fetchText, now: NOW, log: vi.fn() });
    expect(result.status).toBe("kept");
    expect(read()).toEqual(lastGood);
  });

  it("keeps the last data when the newest release is incomplete", async () => {
    reset(lastGood);
    const noSums = async () => "";
    const result = await run({ output, listReleases: async () => LIST, fetchText: noSums, now: NOW, log: vi.fn() });
    expect(result.status).toBe("kept");
    expect(read()).toEqual(lastGood);
  });

  it("writes the none-yet state when a failed read finds no file at all", async () => {
    const fresh = join(dir, "fresh", "releases.json");
    const result = await run({
      output: fresh,
      listReleases: async () => {
        throw new Error("offline");
      },
      fetchText,
      now: NOW,
      log: vi.fn(),
    });
    expect(result.status).toBe("kept");
    expect(JSON.parse(readFileSync(fresh, "utf8"))).toEqual({ release: null, files: [], fetchedAt: "2026-12-16T00:00:00.000Z" });
  });

  it("does not read at all when RELEASES_JSON points at a fixture", async () => {
    reset(lastGood);
    const listReleases = vi.fn();
    const result = await run({ output, listReleases, fetchText, now: NOW, log: vi.fn(), env: { RELEASES_JSON: "e2e/fixtures/x.json" } });
    expect(result.status).toBe("fixture");
    expect(listReleases).not.toHaveBeenCalled();
    expect(read()).toEqual(lastGood);
  });
});

describe("run in a CI or public build", () => {
  const dir = mkdtempSync(join(tmpdir(), "releases-strict-"));
  const output = join(dir, "releases.json");
  const offline = async () => {
    throw new Error("offline");
  };
  for (const env of [{ CI: "true" }, { PUBLIC: "1" }]) {
    it(`fails instead of keeping the last data (${Object.keys(env)[0]} set)`, async () => {
      writeFileSync(output, JSON.stringify(NONE_YET("2026-10-08T00:00:00.000Z")));
      const log = vi.fn();
      const result = await runWith({ output, listReleases: offline, fetchText, now: NOW, log, env });
      expect(result.status).toBe("failed");
      expect(log.mock.calls.flat().join(" ")).toMatch(/^::error::/);
      expect(JSON.parse(readFileSync(output, "utf8")).fetchedAt).toBe("2026-10-08T00:00:00.000Z");
    });
  }

  it("still writes a good read", async () => {
    const result = await runWith({ output, listReleases: async () => LIST, fetchText, now: NOW, log: vi.fn(), env: { CI: "true" } });
    expect(result.status).toBe("updated");
  });

  it("a developer's offline build falls back with a ::warning::", async () => {
    const log = vi.fn();
    const result = await runWith({ output, listReleases: offline, fetchText, now: NOW, log, env: {} });
    expect(result.status).toBe("kept");
    expect(log.mock.calls.flat().join(" ")).toMatch(/^::warning::/);
  });

  it.each([
    [{ CI: "true" }, true],
    [{ CI: "1" }, true],
    [{ PUBLIC: "true" }, true],
    [{ CI: "false" }, false],
    [{ CI: "" }, false],
    [{ PUBLIC: "0" }, false],
    [{}, false],
  ])("isStrict(%j) is %s", (env, expected) => {
    expect(isStrict(env)).toBe(expected);
  });
});

describe("listReleases (fetch stubbed)", () => {
  const page = (body, { status = 200, link } = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name) => (name.toLowerCase() === "link" ? (link ?? null) : null) },
  });
  const stub = (responses) => {
    const calls = [];
    const fn = async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization });
      const next = responses.shift();
      if (!next) throw new Error(`unexpected request: ${url}`);
      return next;
    };
    return { fn, calls };
  };

  it("follows next-page links and joins the pages", async () => {
    const next = "https://api.github.com/repositories/1/releases?per_page=100&page=2";
    const { fn, calls } = stub([page([{ tag_name: "v1.0.0" }], { link: `<${next}>; rel="next", <x>; rel="last"` }), page([{ tag_name: "v1.1.0" }])]);
    const all = await listReleases({}, fn);
    expect(all.map((r) => r.tag_name)).toEqual(["v1.0.0", "v1.1.0"]);
    expect(calls[1].url).toBe(next);
  });

  it("sends the token to api.github.com", async () => {
    const { fn, calls } = stub([page([])]);
    await listReleases({ GITHUB_TOKEN: "t0ken" }, fn);
    expect(calls[0].auth).toBe("Bearer t0ken");
  });

  it("retries without the token after a 401", async () => {
    const { fn, calls } = stub([page({}, { status: 401 }), page([{ tag_name: "v1.0.0" }])]);
    const all = await listReleases({ GITHUB_TOKEN: "stale" }, fn);
    expect(all).toHaveLength(1);
    expect(calls.map((c) => c.auth)).toEqual(["Bearer stale", undefined]);
  });

  it("does not retry a 401 that came without a token, nor other errors", async () => {
    await expect(listReleases({}, stub([page({}, { status: 401 })]).fn)).rejects.toThrow(/HTTP 401/);
    await expect(listReleases({ GITHUB_TOKEN: "t" }, stub([page({}, { status: 403 })]).fn)).rejects.toThrow(/HTTP 403/);
  });

  it("fails when the answer is not a list", async () => {
    await expect(listReleases({}, stub([page({ message: "rate limited" })]).fn)).rejects.toThrow(/not a list/);
  });

  it("never follows a next link to another host, so the token cannot leave api.github.com", async () => {
    const { fn, calls } = stub([page([], { link: '<https://evil.example/releases?page=2>; rel="next"' })]);
    await expect(listReleases({ GITHUB_TOKEN: "t0ken" }, fn)).rejects.toThrow(/refusing/);
    expect(calls).toHaveLength(1);
  });
});

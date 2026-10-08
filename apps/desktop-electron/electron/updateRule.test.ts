/**
 * Which release a computer is offered (DIST-05, DEC-145): the highest version
 * newer than the installed one, test or normal for a test build and normal
 * only for a normal build, decided by the version string alone.
 */
import { describe, expect, it } from "vitest";

import {
  MANIFEST_FOR_TARGET,
  compareVersions,
  hasManifestFor,
  isTestVersion,
  parseVersion,
  pickUpdate,
  tagVersion,
  targetFileMatches,
  targetFileName,
  type Release,
  type UpdateTarget,
} from "./updateRule";

const TARGETS: UpdateTarget[] = ["win-x64", "mac-arm64", "mac-x64", "linux-x64"];

/** A release carrying every target's file and manifest, as DIST-03 publishes. */
function release(version: string, overrides: Partial<Release> = {}): Release {
  const assets = [
    ...TARGETS.map((target) => ({
      name: targetFileName(version, target),
      url: `https://example.test/${version}/${targetFileName(version, target)}`,
    })),
    ...["latest.yml", "latest-mac.yml", "latest-linux.yml"].map((name) => ({
      name,
      url: `https://example.test/${version}/${name}`,
    })),
  ];
  return {
    tag: `v${version}`,
    version,
    draft: false,
    prerelease: version.includes("-test."),
    notes: "",
    publishedAt: null,
    htmlUrl: `https://example.test/releases/v${version}`,
    assets,
    ...overrides,
  };
}

const offered = (installed: string, releases: Release[], target: UpdateTarget = "win-x64") =>
  pickUpdate(installed, releases, target)?.tag.replace(/^v/, "") ?? null;

describe("parseVersion", () => {
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
    "1.0.0-test.1.0",
    "1.0.0-test.0",
    "1.0.0-test.01",
    "1.0.0-test.",
    "1.0.0-beta.1",
    "1.0.0+build5",
    "01.0.0",
    "1.00.0",
    "1.0.00",
    "1.0",
    "1",
    "",
    " 1.0.0",
    "1.0.0 ",
    "vv1.0.0",
    "V1.0.0",
    "1.0.0-",
    "-1.0.0",
    "a.b.c",
    "9007199254740992.0.0",
    "1.9007199254740992.0",
    "1.0.9007199254740993",
    "1.0.0-test.9007199254740992",
    "99999999999999999999.0.0",
  ])("rejects %j", (text) => {
    expect(parseVersion(text)).toBeNull();
  });
});

describe("parseVersion at the largest safe number", () => {
  it("accepts Number.MAX_SAFE_INTEGER", () => {
    expect(parseVersion("1.0.9007199254740991")).toEqual({
      major: 1,
      minor: 0,
      patch: 9007199254740991,
      test: null,
    });
  });
});

describe("tagVersion", () => {
  it("strips the v from a tag in the scheme and gives null otherwise", () => {
    expect(tagVersion("v1.4.0")).toBe("1.4.0");
    expect(tagVersion("v1.4.0-test.2")).toBe("1.4.0-test.2");
    expect(tagVersion("1.4.0")).toBe("1.4.0");
    expect(tagVersion("v1.0.0-feb1-test1")).toBeNull();
  });
});

describe("isTestVersion", () => {
  it("is true only for a -test.N version", () => {
    expect(isTestVersion("1.4.0-test.2")).toBe(true);
    expect(isTestVersion("v1.4.0-test.2")).toBe(true);
    expect(isTestVersion("1.4.0")).toBe(false);
    expect(isTestVersion("1.0.0-feb1-test1")).toBe(false);
    expect(isTestVersion("nonsense")).toBe(false);
  });
});

describe("compareVersions", () => {
  it.each([
    ["1.4.0", "1.4.0", 0],
    ["1.4.0", "v1.4.0", 0],
    ["1.4.1", "1.4.0", 1],
    ["1.4.0", "1.4.1", -1],
    ["1.10.0", "1.9.0", 1],
    ["2.0.0", "1.99.99", 1],
    ["1.4.0-test.2", "1.4.0-test.3", -1],
    ["1.4.0-test.3", "1.4.0", -1],
    ["1.4.0", "1.4.0-test.3", 1],
    ["1.4.0-test.9", "1.4.0-test.10", -1],
    ["1.4.0-test.10", "1.4.0-test.9", 1],
    ["1.4.0-test.2", "1.4.0-test.2", 0],
    ["1.5.0-test.1", "1.4.0", 1],
    ["1.4.1", "1.5.0-test.1", -1],
    ["1.4.0-test.9", "1.3.9", 1],
  ])("%s versus %s is %i", (a, b, expected) => {
    expect(Math.sign(compareVersions(a, b))).toBe(expected);
  });

  it("throws on a version outside the scheme", () => {
    expect(() => compareVersions("1.0.0-feb1-test1", "1.0.0")).toThrow();
  });
});

describe("target files", () => {
  it("names each target's file as DIST-03 does", () => {
    expect(targetFileName("1.4.0", "win-x64")).toBe("CuePoint-1.4.0-win-x64-setup.exe");
    expect(targetFileName("1.4.0", "mac-arm64")).toBe("CuePoint-1.4.0-mac-arm64.zip");
    expect(targetFileName("1.4.0", "mac-x64")).toBe("CuePoint-1.4.0-mac-x64.zip");
    expect(targetFileName("1.4.0-test.2", "linux-x64")).toBe(
      "CuePoint-1.4.0-test.2-linux-x86_64.AppImage",
    );
  });

  it("matches by exact equality, and a Mac takes the zip, not the dmg", () => {
    expect(targetFileMatches("CuePoint-1.4.0-mac-arm64.zip", "1.4.0", "mac-arm64")).toBe(true);
    expect(targetFileMatches("CuePoint-1.4.0-mac-arm64.dmg", "1.4.0", "mac-arm64")).toBe(false);
    expect(targetFileMatches("CuePoint-1.4.0-mac-arm64.zip", "1.4.0", "mac-x64")).toBe(false);
    expect(targetFileMatches("CuePoint-1.4.0-mac-arm64.zip.blockmap", "1.4.0", "mac-arm64")).toBe(
      false,
    );
    expect(targetFileMatches("CuePoint-1.4.1-win-x64-setup.exe", "1.4.0", "win-x64")).toBe(false);
  });

  it("maps each target to its manifest", () => {
    expect(MANIFEST_FOR_TARGET).toEqual({
      "win-x64": "latest.yml",
      "mac-arm64": "latest-mac.yml",
      "mac-x64": "latest-mac.yml",
      "linux-x64": "latest-linux.yml",
    });
  });

  it("needs both the manifest and the file", () => {
    const full = release("1.4.0");
    for (const target of TARGETS) expect(hasManifestFor(full, target)).toBe(true);

    const noManifest = release("1.4.0", {
      assets: full.assets.filter((a) => a.name !== "latest.yml"),
    });
    expect(hasManifestFor(noManifest, "win-x64")).toBe(false);
    expect(hasManifestFor(noManifest, "mac-arm64")).toBe(true);

    const noFile = release("1.4.0", {
      assets: full.assets.filter((a) => a.name !== targetFileName("1.4.0", "win-x64")),
    });
    expect(hasManifestFor(noFile, "win-x64")).toBe(false);
  });
});

describe("pickUpdate: a test build", () => {
  it("takes the highest version, test or normal", () => {
    const out = [release("1.4.0"), release("1.5.0-test.1")];
    expect(offered("1.4.0-test.2", out)).toBe("1.5.0-test.1");
  });

  it("takes the real release over a newer test of the same version", () => {
    const out = [release("1.4.0-test.3"), release("1.4.0")];
    expect(offered("1.4.0-test.2", out)).toBe("1.4.0");
  });

  it("compares test numbers numerically", () => {
    const out = [release("1.4.0-test.9"), release("1.4.0-test.10")];
    expect(offered("1.4.0-test.9", [...out, release("1.4.0-test.8")])).toBe("1.4.0-test.10");
  });

  it("is offered nothing when a lower hotfix is published later", () => {
    const out = [
      release("1.5.0-test.1", { publishedAt: "2026-03-01T00:00:00Z" }),
      release("1.4.1", { publishedAt: "2026-04-01T00:00:00Z" }),
    ];
    expect(offered("1.5.0-test.1", out)).toBeNull();
  });
});

describe("pickUpdate: a normal build", () => {
  it("is never offered a test release", () => {
    expect(offered("1.4.0", [release("1.5.0-test.1")])).toBeNull();
  });

  it("takes the highest normal release and ignores tests", () => {
    const out = [release("1.4.1"), release("1.5.0-test.1"), release("1.4.0")];
    expect(offered("1.4.0", out)).toBe("1.4.1");
  });

  it("takes the highest of several normal releases", () => {
    const out = [release("1.4.1"), release("1.6.0"), release("1.5.2")];
    expect(offered("1.4.0", out)).toBe("1.6.0");
  });

  it("the version decides, not the pre-release flag", () => {
    // A normal version marked pre-release is still normal.
    expect(offered("1.4.0", [release("1.4.1", { prerelease: true })])).toBe("1.4.1");
    // A test version not marked pre-release is still a test.
    expect(offered("1.4.0", [release("1.5.0-test.1", { prerelease: false })])).toBeNull();
  });
});

describe("pickUpdate: nothing newer", () => {
  it.each([
    ["1.4.0", ["1.4.0"]],
    ["1.4.0", ["1.3.9", "1.0.0"]],
    ["1.4.0-test.2", ["1.4.0-test.2", "1.4.0-test.1", "1.3.0"]],
    ["1.4.0", []],
  ])("installed %s with %j out gives nothing", (installed, versions) => {
    expect(offered(installed, versions.map((v) => release(v)))).toBeNull();
  });

  it("gives nothing for an installed version outside the scheme", () => {
    expect(offered("1.0.0-feb1-test1", [release("2.0.0")])).toBeNull();
    expect(offered("", [release("2.0.0")])).toBeNull();
  });
});

describe("pickUpdate: what is skipped", () => {
  it("skips a draft", () => {
    expect(offered("1.4.0", [release("1.5.0", { draft: true })])).toBeNull();
    expect(offered("1.4.0", [release("1.5.0", { draft: true }), release("1.4.1")])).toBe("1.4.1");
  });

  it("skips a tag outside the scheme", () => {
    const old = release("1.0.0-feb1-test1", { tag: "v1.0.0-feb1-test1", version: null });
    expect(offered("0.0.1-test.1", [old])).toBeNull();
    expect(offered("0.0.3", [old, release("0.0.4")])).toBe("0.0.4");
  });

  it("goes by the tag, not by the version field", () => {
    expect(offered("1.4.0", [release("1.5.0", { version: null })])).toBe("1.5.0");
    expect(offered("1.4.0", [release("1.5.0", { version: "9.9.9" })])).toBe("1.5.0");
  });

  it("skips v0.0.3 with no manifest", () => {
    const early = release("0.0.3", {
      assets: [
        { name: "CuePoint-Setup-0.0.3.exe", url: "https://example.test/a.exe" },
        { name: "CuePoint-0.0.3.dmg", url: "https://example.test/a.dmg" },
      ],
    });
    expect(offered("0.0.2", [early])).toBeNull();
  });

  it("skips a release with a manifest but no file for the target", () => {
    const full = release("1.5.0");
    const noFile = release("1.5.0", {
      assets: full.assets.filter((a) => a.name !== targetFileName("1.5.0", "win-x64")),
    });
    expect(offered("1.4.0", [noFile, release("1.4.1")])).toBe("1.4.1");
  });

  it("does not offer mac-x64 a release that has only an arm64 zip", () => {
    const full = release("1.5.0");
    const armOnly = release("1.5.0", {
      assets: full.assets.filter((a) => a.name !== targetFileName("1.5.0", "mac-x64")),
    });
    expect(offered("1.4.0", [armOnly], "mac-x64")).toBeNull();
    expect(offered("1.4.0", [armOnly], "mac-arm64")).toBe("1.5.0");
  });

  it("does not offer a Mac the dmg alone", () => {
    const full = release("1.5.0");
    const dmgOnly = release("1.5.0", {
      assets: full.assets.map((a) =>
        a.name === targetFileName("1.5.0", "mac-arm64")
          ? { ...a, name: "CuePoint-1.5.0-mac-arm64.dmg" }
          : a,
      ),
    });
    expect(offered("1.4.0", [dmgOnly], "mac-arm64")).toBeNull();
  });

  it("offers each target its own release", () => {
    const out = [release("1.5.0")];
    for (const target of TARGETS) expect(offered("1.4.0", out, target)).toBe("1.5.0");
  });

  it("returns the release itself", () => {
    const chosen = release("1.5.0", { notes: "What is new" });
    expect(pickUpdate("1.4.0", [release("1.4.1"), chosen], "linux-x64")).toBe(chosen);
  });
});

import { describe, expect, it } from "vitest";
import { detectFromEnvironment, fileFor, noteFor, otherMacFile, systemLabel, type DetectInput } from "./detect";
import type { ReleaseFile } from "./releases";

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROME_LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE = SAFARI_MAC; // iPadOS asks for the desktop site by default and says "Macintosh"
const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROMEOS = "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const table: { name: string; input: DetectInput; expected: Record<string, unknown> }[] = [
  {
    name: "Apple Silicon Mac in Chrome, with client hints",
    input: { userAgent: CHROME_MAC, hints: { platform: "macOS", architecture: "arm", bitness: "64", mobile: false } },
    expected: { kind: "desktop", system: "macos", chip: "arm64", chipKnown: true },
  },
  {
    name: "Intel Mac in Chrome, with client hints",
    input: { userAgent: CHROME_MAC, hints: { platform: "macOS", architecture: "x86", bitness: "64", mobile: false } },
    expected: { kind: "desktop", system: "macos", chip: "x64", chipKnown: true },
  },
  {
    name: "Mac in Safari (no client hints, the chip is not said)",
    input: { userAgent: SAFARI_MAC, maxTouchPoints: 0 },
    expected: { kind: "desktop", system: "macos", chip: "arm64", chipKnown: false },
  },
  {
    name: "Mac in Firefox (the user agent says Intel for every Mac)",
    input: { userAgent: SAFARI_MAC.replace("Version/18.1 Safari/605.1.15", "") + "Gecko/20100101 Firefox/132.0", maxTouchPoints: 0 },
    expected: { kind: "desktop", system: "macos", chip: "arm64", chipKnown: false },
  },
  {
    name: "Windows x64 in Chrome",
    input: { userAgent: CHROME_WIN, hints: { platform: "Windows", architecture: "x86", bitness: "64", mobile: false } },
    expected: { kind: "desktop", system: "windows", chip: "x64", windowsOnArm: false },
  },
  {
    name: "Windows in Firefox (user agent only)",
    input: { userAgent: CHROME_WIN.replace(/AppleWebKit.*/, "Gecko/20100101 Firefox/132.0") },
    expected: { kind: "desktop", system: "windows", chip: "x64", windowsOnArm: false },
  },
  {
    name: "Windows on Arm in Edge (offered the x64 installer, and told so)",
    input: { userAgent: CHROME_WIN, hints: { platform: "Windows", architecture: "arm", bitness: "64", mobile: false } },
    expected: { kind: "desktop", system: "windows", chip: "x64", windowsOnArm: true },
  },
  {
    name: "Linux x64 in Chrome",
    input: { userAgent: CHROME_LINUX, hints: { platform: "Linux", architecture: "x86", bitness: "64", mobile: false } },
    expected: { kind: "desktop", system: "linux", chip: "x64", linuxArm: false },
  },
  {
    name: "Linux in Firefox (user agent only)",
    input: { userAgent: FIREFOX_LINUX },
    expected: { kind: "desktop", system: "linux", chip: "x64", linuxArm: false },
  },
  {
    name: "Linux on Arm (there is no build for it)",
    input: { userAgent: CHROME_LINUX, hints: { platform: "Linux", architecture: "arm", bitness: "64", mobile: false } },
    expected: { kind: "desktop", system: "linux", chip: "x64", linuxArm: true },
  },
  {
    name: "Linux on Arm in Firefox (the user agent says aarch64)",
    input: { userAgent: "Mozilla/5.0 (X11; Linux aarch64; rv:132.0) Gecko/20100101 Firefox/132.0" },
    expected: { kind: "desktop", system: "linux", chip: "x64", linuxArm: true },
  },
  {
    name: "Linux on 32-bit Arm (armv7l)",
    input: { userAgent: "Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" },
    expected: { kind: "desktop", system: "linux", chip: "x64", linuxArm: true },
  },
  {
    name: "iPhone in Safari",
    input: { userAgent: IPHONE, maxTouchPoints: 5 },
    expected: { kind: "mobile" },
  },
  {
    name: "iPad in Safari (asks for the desktop site, says Macintosh, has a touch screen)",
    input: { userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5 },
    expected: { kind: "mobile" },
  },
  {
    name: "Android phone in Chrome, with client hints",
    input: { userAgent: ANDROID_PHONE, hints: { platform: "Android", architecture: "", bitness: "", mobile: true } },
    expected: { kind: "mobile" },
  },
  {
    name: "Android tablet (no Mobile in the user agent)",
    input: { userAgent: ANDROID_TABLET, maxTouchPoints: 5 },
    expected: { kind: "mobile" },
  },
  {
    name: "ChromeOS (CuePoint has no build for it)",
    input: { userAgent: CHROMEOS },
    expected: { kind: "unknown" },
  },
  {
    name: "unknown (empty user agent)",
    input: { userAgent: "" },
    expected: { kind: "unknown" },
  },
];

describe("detectFromEnvironment", () => {
  it.each(table)("$name", ({ input, expected }) => {
    expect(detectFromEnvironment(input)).toMatchObject(expected);
  });

  it("trusts the client hints over a user agent that says Intel", () => {
    const d = detectFromEnvironment({ userAgent: CHROME_MAC, hints: { platform: "macOS", architecture: "arm" } });
    expect(d.kind === "desktop" && d.chip).toBe("arm64");
  });
});

const file = (system: ReleaseFile["system"], chip: ReleaseFile["chip"], name: string): ReleaseFile => ({
  name,
  system,
  chip,
  size: 1,
  sha256: "a".repeat(64),
  url: `https://example.test/${name}`,
});
const FILES = [
  file("windows", "x64", "win"),
  file("macos", "arm64", "mac-arm"),
  file("macos", "x64", "mac-intel"),
  file("linux", "x64", "linux"),
];

describe("fileFor", () => {
  it.each([
    ["Apple Silicon Mac", { userAgent: CHROME_MAC, hints: { platform: "macOS", architecture: "arm" } }, "mac-arm"],
    ["Intel Mac", { userAgent: CHROME_MAC, hints: { platform: "macOS", architecture: "x86" } }, "mac-intel"],
    ["Mac in Safari", { userAgent: SAFARI_MAC }, "mac-arm"],
    ["Windows", { userAgent: CHROME_WIN }, "win"],
    ["Windows on Arm", { userAgent: CHROME_WIN, hints: { platform: "Windows", architecture: "arm" } }, "win"],
    ["Linux", { userAgent: CHROME_LINUX }, "linux"],
  ] as [string, DetectInput, string][])("%s gets %s", (_name, input, expected) => {
    expect(fileFor(FILES, detectFromEnvironment(input))?.name).toBe(expected);
  });

  it("gives nothing on a phone, on an unknown system, or on Linux for Arm", () => {
    expect(fileFor(FILES, detectFromEnvironment({ userAgent: IPHONE, maxTouchPoints: 5 }))).toBeUndefined();
    expect(fileFor(FILES, detectFromEnvironment({ userAgent: "" }))).toBeUndefined();
    expect(fileFor(FILES, detectFromEnvironment({ userAgent: CHROME_LINUX, hints: { platform: "Linux", architecture: "arm" } }))).toBeUndefined();
  });

  it("gives nothing when the release lacks that file", () => {
    expect(fileFor(FILES.filter((f) => f.system !== "windows"), detectFromEnvironment({ userAgent: CHROME_WIN }))).toBeUndefined();
  });
});

describe("otherMacFile", () => {
  it("is the other chip's disk image", () => {
    expect(otherMacFile(FILES, "arm64")?.name).toBe("mac-intel");
    expect(otherMacFile(FILES, "x64")?.name).toBe("mac-arm");
  });
});

describe("systemLabel", () => {
  it("names the system once, never the chip", () => {
    expect(systemLabel("windows")).toBe("Windows");
    expect(systemLabel("macos")).toBe("Mac");
    expect(systemLabel("linux")).toBe("Linux");
  });
});

describe("noteFor", () => {
  const note = (input: DetectInput, hasFile = true) => noteFor(detectFromEnvironment(input), hasFile);
  it("picks the note that tells this visitor what they are getting", () => {
    expect(note({ userAgent: CHROME_WIN })).toBe("windows");
    expect(note({ userAgent: CHROME_WIN, hints: { platform: "Windows", architecture: "arm" } })).toBe("windows-arm");
    expect(note({ userAgent: CHROME_MAC, hints: { platform: "macOS", architecture: "arm" } })).toBe("mac-arm");
    expect(note({ userAgent: CHROME_MAC, hints: { platform: "macOS", architecture: "x86" } })).toBe("mac-intel");
    expect(note({ userAgent: SAFARI_MAC })).toBe("mac-arm-guess");
    expect(note({ userAgent: CHROME_LINUX })).toBe("linux");
    expect(note({ userAgent: CHROME_LINUX, hints: { platform: "Linux", architecture: "arm" } })).toBe("linux-arm");
  });
  it("says it could not tell whenever no file fits, never an empty box", () => {
    expect(note({ userAgent: "" })).toBe("unknown");
    expect(note({ userAgent: CHROME_WIN }, false)).toBe("unknown");
    expect(note({ userAgent: SAFARI_MAC }, false)).toBe("unknown");
  });
});

import type { Chip, ReleaseFile, System } from "./releases";

/**
 * Which download fits the visitor's computer (SITE-07). Client hints where the browser offers them,
 * the user agent otherwise. Pure and small: the page's script and the tests share it.
 *
 * - Windows -> the x64 installer; on an Arm chip it is the same installer, and the page says so.
 * - A Mac -> Apple Silicon when detected or unknown (Safari and Firefox do not say the chip), with
 *   "Intel Mac?" beside it.
 * - Linux -> the AppImage (x86_64 only).
 * - A phone or tablet -> no download.
 */
export interface Hints {
  platform?: string | undefined;
  architecture?: string | undefined;
  bitness?: string | undefined;
  mobile?: boolean | undefined;
}

export interface DetectInput {
  userAgent: string;
  maxTouchPoints?: number | undefined;
  hints?: Hints | undefined;
}

export type Detection =
  | { kind: "desktop"; system: "windows"; chip: "x64"; chipKnown: boolean; windowsOnArm: boolean }
  | { kind: "desktop"; system: "macos"; chip: Chip; chipKnown: boolean }
  | { kind: "desktop"; system: "linux"; chip: "x64"; chipKnown: boolean; linuxArm: boolean }
  | { kind: "mobile" }
  | { kind: "unknown" };

const isArm = (architecture: string | undefined) => (architecture ?? "").toLowerCase().startsWith("arm");
/** Arm in the user agent itself (Linux says aarch64, arm64 or armv7l), for browsers with no client hints. */
const uaSaysArm = (ua: string) => /aarch64|arm64|armv\d/i.test(ua);
const isX86 = (architecture: string | undefined) => (architecture ?? "").toLowerCase().startsWith("x86");

export function detectFromEnvironment({ userAgent, maxTouchPoints = 0, hints }: DetectInput): Detection {
  const ua = userAgent;
  const platform = (hints?.platform ?? "").toLowerCase();
  const architecture = hints?.architecture;
  const chipKnown = isArm(architecture) || isX86(architecture);

  // Phones and tablets first. iPadOS asks for the desktop site and says "Macintosh", so a Mac with a
  // touch screen is an iPad. An Android tablet has no "Mobile" in its user agent, so Android is enough.
  if (hints?.mobile === true || platform === "android" || platform === "ios") return { kind: "mobile" };
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return { kind: "mobile" };
  if (/Macintosh/.test(ua) && maxTouchPoints > 1 && platform === "") return { kind: "mobile" };

  if (platform === "windows" || (platform === "" && /Windows NT/.test(ua))) {
    return { kind: "desktop", system: "windows", chip: "x64", chipKnown, windowsOnArm: isArm(architecture) };
  }
  if (platform === "macos" || (platform === "" && /Macintosh|Mac OS X/.test(ua))) {
    // Chrome on an Apple Silicon Mac still says "Intel" in its user agent, so the hint wins.
    const chip: Chip = isX86(architecture) ? "x64" : "arm64";
    return { kind: "desktop", system: "macos", chip, chipKnown };
  }
  if (platform === "linux" || (platform === "" && /Linux|X11/.test(ua) && !/CrOS/.test(ua))) {
    return { kind: "desktop", system: "linux", chip: "x64", chipKnown, linuxArm: isArm(architecture) || (!chipKnown && uaSaysArm(ua)) };
  }
  return { kind: "unknown" };
}

/** The file a detection points at, or undefined: a phone, an unknown system, Linux for Arm. */
export function fileFor(files: readonly ReleaseFile[], detection: Detection): ReleaseFile | undefined {
  if (detection.kind !== "desktop") return undefined;
  if (detection.system === "linux" && detection.linuxArm) return undefined;
  return files.find((f) => f.system === detection.system && f.chip === detection.chip);
}

/** Which of the page's prewritten notes tells this visitor what they are getting. */
export function noteFor(d: Detection, hasFile: boolean): string {
  // (a phone gets its own layer in the page, and the note's key is only a fallback)
  if (d.kind === "mobile") return "mobile";
  if (d.kind === "unknown") return "unknown";
  if (d.system === "linux" && d.linuxArm) return "linux-arm";
  // whenever no file fits, say so rather than leave the box empty
  if (!hasFile) return "unknown";
  if (d.system === "windows") return d.windowsOnArm ? "windows-arm" : "windows";
  if (d.system === "macos") return d.chipKnown ? (d.chip === "arm64" ? "mac-arm" : "mac-intel") : "mac-arm-guess";
  return "linux";
}

/** The Mac disk image for the other chip: what "Intel Mac?" and "Apple Silicon Mac?" link to. */
export function otherMacFile(files: readonly ReleaseFile[], chip: Chip): ReleaseFile | undefined {
  return files.find((f) => f.system === "macos" && f.chip !== chip);
}

/** The system as a button says it: "Download for Mac". The chip is not in the label. */
export function systemLabel(system: System): string {
  return system === "windows" ? "Windows" : system === "macos" ? "Mac" : "Linux";
}

interface UserAgentData {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ platform?: string; architecture?: string; bitness?: string }>;
}

/** Reads the browser. Asks the client hints where offered (Chromium), falls back to the user agent. */
export async function detect(nav: Navigator = navigator): Promise<Detection> {
  const data = (nav as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  let hints: Hints | undefined;
  if (data) {
    hints = { platform: data.platform, mobile: data.mobile };
    try {
      const high = await data.getHighEntropyValues?.(["platform", "architecture", "bitness"]);
      if (high) hints = { ...hints, platform: high.platform || hints.platform, architecture: high.architecture, bitness: high.bitness };
    } catch {
      // the browser declined: the low-entropy platform and the user agent still tell most of it
    }
  }
  return detectFromEnvironment({ userAgent: nav.userAgent, maxTouchPoints: nav.maxTouchPoints, hints });
}

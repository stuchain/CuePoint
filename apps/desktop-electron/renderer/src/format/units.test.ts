import { describe, expect, it } from "vitest";
import {
  NO_BPM,
  formatBpmText,
  formatFileSize,
  formatLufs,
  formatMatchScore,
  formatTempoChange,
  formatTempoPercent,
} from "./units";

describe("units", () => {
  it("writes a match score as a rounded percent", () => {
    expect(formatMatchScore(86.4)).toBe("86%");
    expect(formatMatchScore(null)).toBe("");
  });
  it("writes a tempo change with a true minus", () => {
    expect(formatTempoChange(122, 125.4)).toBe("+2.8%");
    expect(formatTempoChange(140, 122)).toBe("−12.9%");
    expect(formatTempoChange(120, 120)).toBe("0%");
    expect(formatTempoChange(null, 120)).toBe("");
    expect(formatTempoPercent(16.74)).toBe("+16.7%");
  });
  it("has one wording for no tempo", () => {
    expect(formatBpmText(null)).toBe(NO_BPM);
    expect(formatBpmText(128)).toBe("128 BPM");
  });
  it("writes file sizes", () => {
    expect(formatFileSize(512)).toBe("512 bytes");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatFileSize(3 * 1024 ** 3)).toBe("3.0 GB");
    expect(formatFileSize(2048, 2049, "en-US")).toBe("2,048 bytes");
    expect(formatFileSize(2048, 4096)).toBe("2.0 KB");
  });
  it("writes loudness", () => {
    expect(formatLufs(-8.44)).toBe("−8.4 LUFS");
  });
});

import { describe, expect, it } from "vitest";
import { CLEAN_ROWS, keyColor, mixesInKey, SET } from "./content";

describe("the made-up library", () => {
  it("plans a set where every step mixes in key", () => {
    for (let i = 1; i < SET.length; i++) expect(mixesInKey(SET[i - 1]!.key, SET[i]!.key)).toBe(true);
  });

  it("shows on Prepare the same keys and tempos Clean fixed", () => {
    for (const s of SET) {
      const row = CLEAN_ROWS.find((r) => r.title === s.title)!;
      expect(row.key[1] ?? row.key[0]).toBe(s.key);
      expect(Number(row.bpm[1] ?? row.bpm[0])).toBe(s.bpm);
    }
  });

  it("knows which keys mix", () => {
    expect(mixesInKey("8A", "8B")).toBe(true);
    expect(mixesInKey("12A", "1A")).toBe(true);
    expect(mixesInKey("8A", "9B")).toBe(false);
    expect(mixesInKey("8A", "10A")).toBe(false);
  });

  it("colors every Camelot number and refuses anything else", () => {
    for (let n = 1; n <= 12; n++) expect(keyColor(`${n}A`)).toMatch(/^#[0-9a-f]{6}$/);
    expect(() => keyColor("—")).toThrow();
  });
});

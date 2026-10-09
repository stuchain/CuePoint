import { describe, expect, it } from "vitest";
import { keyParts } from "./kbd-keys";

const keys = (t: string) => keyParts(t)?.map((p) => ("key" in p ? `[${p.key}]` : p.text)).join("") ?? null;

describe("keyParts: the guide's bold keys become key caps", () => {
  it("draws combinations with a modifier", () => {
    expect(keys("Ctrl+K")).toBe("[Ctrl]+[K]");
    expect(keys("Ctrl+Shift+A")).toBe("[Ctrl]+[Shift]+[A]");
    expect(keys("Alt+Up")).toBe("[Alt]+[Up]");
    expect(keys("Ctrl+-")).toBe("[Ctrl]+[-]");
    expect(keys("Ctrl+?")).toBe("[Ctrl]+[?]");
    expect(keys("Shift+F10")).toBe("[Shift]+[F10]");
  });
  it("keeps a click as words, with the modifier as a key", () => {
    expect(keys("Shift+Click")).toBe("[Shift]+Click");
  });
  it("draws named keys", () => {
    for (const k of ["Esc", "Enter", "Tab", "Space", "Left", "Right", "Up", "Down", "F1", "F2"]) expect(keys(k)).toBe(`[${k}]`);
  });
  it("leaves alone what the guide also bolds as a mark, a button or a word", () => {
    for (const t of ["A", "B", "Delete", "Match tracks…", "More info", "Ctrl", "Keep anyway", "Run+anyway", "Ctrl++", " Esc"]) {
      expect(keys(t), t).toBeNull();
    }
  });
});

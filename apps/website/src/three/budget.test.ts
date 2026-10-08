import { describe, expect, it } from "vitest";
import { FrameBudget } from "./budget";

function slow(b: FrameBudget, windows: number, ms = 40) {
  const seen: { dpr: number; shadow: number; pixel: number }[] = [];
  for (let i = 0; i < windows * 30; i++) {
    if (b.frame(ms)) seen.push({ dpr: b.dpr, shadow: b.shadowSize, pixel: b.pixelSize });
  }
  return seen;
}

describe("the frame budget", () => {
  it("caps the pixel ratio at 2", () => {
    expect(new FrameBudget(3).dpr).toBe(2);
    expect(new FrameBudget(1.5).dpr).toBe(1.5);
  });

  it("starts with 1024 shadows and 4 px scene pixels", () => {
    const b = new FrameBudget(2);
    expect(b.shadowSize).toBe(1024);
    expect(b.pixelSize).toBe(4);
  });

  it("keeps everything while frames are short", () => {
    const b = new FrameBudget(2);
    for (let i = 0; i < 300; i++) b.frame(16.6);
    expect([b.dpr, b.shadowSize, b.pixelSize]).toEqual([2, 1024, 4]);
  });

  it("steps down in order while frames run long: ratio, then shadows, then pixel size", () => {
    const b = new FrameBudget(2);
    const seen = slow(b, 20);
    const order = seen.map((s) => `${s.dpr}/${s.shadow}/${s.pixel}`);
    expect(order).toEqual([
      "1.75/1024/4",
      "1.5/1024/4",
      "1.25/1024/4",
      "1/1024/4",
      "1/512/4",
      "1/0/4",
      "1/0/5",
      "1/0/6",
    ]);
  });

  it("stops at the floor and then reports no change", () => {
    const b = new FrameBudget(2);
    slow(b, 20);
    expect(slow(b, 5)).toEqual([]);
    expect([b.dpr, b.shadowSize, b.pixelSize]).toEqual([1, 0, 6]);
  });

  it("ignores one huge frame such as a compile or a hidden tab", () => {
    const b = new FrameBudget(2);
    for (let i = 0; i < 60; i++) b.frame(16.6);
    b.frame(5000);
    expect(b.dpr).toBe(2);
  });

  it("gives a whole number of device pixels per scene pixel", () => {
    expect(new FrameBudget(1).backbufferScale).toBe(4);
    expect(new FrameBudget(1.5).backbufferScale).toBe(6);
    expect(new FrameBudget(2).backbufferScale).toBe(8);
    expect(new FrameBudget(1.25).backbufferScale).toBe(5);
    const b = new FrameBudget(1);
    slow(b, 20);
    expect(b.backbufferScale).toBe(6);
  });
});

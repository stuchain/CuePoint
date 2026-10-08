import { describe, expect, it } from "vitest";
import { LOOP_FILE_PATTERN, loopLevel, pickLoop } from "./loop";

describe("the sound loop (DEC-191)", () => {
  it("is hidden until the file exists: no files, no loop", () => {
    expect(pickLoop({})).toBeUndefined();
    expect(pickLoop({ "../assets/audio/readme.txt": "/x.txt" })).toBeUndefined();
  });

  it("takes a file named home-loop with an audio extension", () => {
    expect(pickLoop({ "../assets/audio/home-loop.mp3": "/a/home-loop.abc.mp3" })).toBe("/a/home-loop.abc.mp3");
    expect(pickLoop({ "../assets/audio/home-loop.ogg": "/o.ogg", "../assets/audio/home-loop.mp3": "/m.mp3" })).toBe("/m.mp3");
  });

  it("names the files the page's glob looks for", () => {
    expect(LOOP_FILE_PATTERN).toContain("home-loop");
  });

  it("turns the analyser's bytes into a level from 0 to 1", () => {
    expect(loopLevel(new Uint8Array([]))).toBe(0);
    expect(loopLevel(new Uint8Array([0, 0, 0, 0]))).toBe(0);
    expect(loopLevel(new Uint8Array([255, 255, 255, 255]))).toBe(1);
    const mid = loopLevel(new Uint8Array([128, 128, 0, 0]));
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.4);
  });
});

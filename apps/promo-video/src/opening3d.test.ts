import { describe, expect, it } from "vitest";
import { PHASES } from "../../website/src/three/phases";
import { KEYS, progressAt } from "./opening3d";
import { CAPTIONS, shot } from "./timing";

const caption = (text: string) => CAPTIONS.find((c) => c.text === text)!;

describe("the opening shot's story", () => {
  it("moves forward only, from the crate to the wheel facing us, inside the shot", () => {
    let prev = -1;
    for (let t = 0; t <= shot("opening").end; t += 1 / 30) {
      const p = progressAt(t);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = p;
    }
    expect(progressAt(0)).toBe(0);
    expect(KEYS[KEYS.length - 1]![0]).toBeLessThan(shot("opening").end);
    expect(progressAt(shot("opening").end)).toBe(1);
  });

  it("says each step while the site's scene shows it", () => {
    const messy = caption("A messy library?");
    expect(progressAt(messy.to)).toBeLessThanOrEqual(PHASES.tag[1]);
    const matched = caption("Matched on Beatport.");
    expect(progressAt(matched.from)).toBeGreaterThanOrEqual(PHASES.tag[0]);
    expect(progressAt(matched.to)).toBeLessThanOrEqual(PHASES.fly[0] + 1e-9);
    const sorted = caption("Sorted on the Camelot wheel.");
    expect(progressAt(sorted.from)).toBeGreaterThanOrEqual(PHASES.fly[0] - 1e-9);
  });
});

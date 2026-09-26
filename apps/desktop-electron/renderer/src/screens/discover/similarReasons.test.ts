/**
 * Every reason Similar Tracks can give has words (DISCOVER-08, DEC-096).
 *
 * `similarReasons.fixture.json` is produced by
 * `src/tests/unit/services/test_similar_reasons_fixture.py` from the real
 * engine, one of each reason it can give. That test fails if the engine gains a
 * reason the file does not hold; this one fails if the file holds a reason this
 * module has no sentence for.
 */
import { describe, expect, it } from "vitest";

import fixture from "./similarReasons.fixture.json";
import {
  describeSimilarReason,
  describeUnused,
  formatBpm,
  type SimilarComponent,
  type SimilarReason,
} from "./similarReasons";

const REASONS = fixture.reasons as SimilarReason[];

describe("every reason the engine gives", () => {
  it("has ten, one per component and detail", () => {
    const kinds = REASONS.map((r) => `${r.component}:${r.detail}`);
    expect(new Set(kinds).size).toBe(10);
  });

  it.each(REASONS.map((r) => [`${r.component}:${r.detail}`, r] as const))(
    "%s has a sentence of its own",
    (_, reason) => {
      const words = describeSimilarReason(reason);
      expect(words).not.toMatch(/^Similar /);
      expect(words).not.toMatch(/undefined|NaN|\[object/);
    },
  );

  it("gives each reason a different sentence", () => {
    const sentences = REASONS.map(describeSimilarReason);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it("reads as the specification words them", () => {
    expect(REASONS.map(describeSimilarReason)).toEqual([
      "Same tempo: 124",
      "Close tempo: 124 → 126.5",
      "Half time: 124 → 62",
      "Double time: 124 → 248",
      "Same key: 8A",
      "One step on the wheel: 8A → 9A",
      "Relative key: 8A → 8B",
      "Same genre: Deep House",
      "Same label: Innervisions",
      "Shared artists: Âme, Dixon",
    ]);
  });
});

describe("the words", () => {
  it("names one shared artist in the singular", () => {
    expect(
      describeSimilarReason({ component: "artist", detail: "shared", points: 15, names: ["Âme"] }),
    ).toBe("Shared artist: Âme");
  });

  it("writes keys as the engine spelled them", () => {
    expect(
      describeSimilarReason({
        component: "key",
        detail: "relative",
        points: 20,
        from: "Am",
        to: "C",
      }),
    ).toBe("Relative key: Am → C");
  });

  it("writes a BPM without trailing zeros", () => {
    expect(formatBpm(128)).toBe("128");
    expect(formatBpm(127.5)).toBe("127.5");
    expect(formatBpm(127.25)).toBe("127.25");
    expect(formatBpm(127.999)).toBe("128");
  });

  it("says something for a reason from a newer engine", () => {
    const newer = { component: "energy", detail: "same", points: 5 } as unknown as SimilarReason;
    expect(describeSimilarReason(newer)).toBe("Similar energy");
  });
});

describe("what a seed could not use", () => {
  it("names every component the engine can report", () => {
    expect(describeUnused(fixture.unused as SimilarComponent[])).toBe(
      "This track has no BPM, key, genre, label or artist to compare.",
    );
  });

  it("names one or two plainly", () => {
    expect(describeUnused(["tempo"])).toBe("This track has no BPM to compare.");
    expect(describeUnused(["tempo", "key"])).toBe("This track has no BPM or key to compare.");
  });

  it("says nothing when the seed had everything", () => {
    expect(describeUnused([])).toBeNull();
  });
});

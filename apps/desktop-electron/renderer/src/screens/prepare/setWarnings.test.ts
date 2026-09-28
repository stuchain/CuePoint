/**
 * Every warning a Set's checks can give has words (PREP-05, DEC-106).
 *
 * `setWarnings.fixture.json` is produced by
 * `src/tests/unit/services/test_set_warnings_fixture.py` from the real engine,
 * one of each warning it can give. That test fails if the engine gains a
 * warning the file does not hold; this one fails if the file holds a warning
 * this module has no sentence for.
 */
import { describe, expect, it } from "vitest";

import fixture from "./setWarnings.fixture.json";
import {
  describeFileCheck,
  describeSetNotice,
  describeSetWarning,
  isAcknowledgeable,
  type SetFileCheck,
  type SetNotice,
  type SetWarning,
} from "./setWarnings";

const WARNINGS = fixture.warnings as SetWarning[];
const NOTICES = fixture.notices as SetNotice[];
const FILES = fixture.files as SetFileCheck[];

describe("every warning the engine gives", () => {
  it("has twenty, one per kind and detail", () => {
    const kinds = WARNINGS.map((w) => `${w.kind}:${w.detail}`);
    expect(new Set(kinds).size).toBe(20);
  });

  it.each(WARNINGS.map((w) => [`${w.kind}:${w.detail}`, w] as const))(
    "%s has a sentence of its own",
    (_, warning) => {
      const words = describeSetWarning(warning);
      expect(words).not.toMatch(/^Check: /);
      expect(words).not.toMatch(/undefined|NaN|null|\[object/);
    },
  );

  it("gives each warning a different sentence", () => {
    const sentences = WARNINGS.map(describeSetWarning);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it("reads as a DJ would say it", () => {
    expect(WARNINGS.map(describeSetWarning)).toEqual([
      "Tempo jumps 16.7% faster: 120 → 140",
      "Tempo jumps 14.3% slower: 140 → 120",
      "Keys clash: 8A → 3B",
      "The track before has no BPM to compare",
      "This track has no BPM to compare",
      "Neither track has a BPM to compare",
      "The track before has no key to compare",
      "This track has no key to compare",
      "Neither track has a key to compare",
      "The file was missing when files were last checked",
      "The file's drive was not connected when files were last checked",
      "The file could not be read when files were last checked",
      "Planned out at 5:30, after the track ends at 5:00",
      "Planned in at 5:10, after the track ends at 5:00",
      "1:00 over the 5:00 target",
      "1:00 over the 5:00 target, before 1 entry still untimed",
      "5:00 under the 10:00 target",
      "1 track slower than 118 BPM",
      "1 track faster than 122 BPM",
      "2 tracks outside 118–122 BPM",
    ]);
  });

  it("offers acknowledging only a transition's warnings", () => {
    const transitions = WARNINGS.filter(isAcknowledgeable).map((w) => w.kind);
    expect(new Set(transitions)).toEqual(
      new Set(["tempo_jump", "key_clash", "tempo_unknown", "key_unknown"]),
    );
  });
});

describe("notices and file checks", () => {
  it("names a repeat's other places, counting from 1", () => {
    expect(NOTICES.map(describeSetNotice)).toEqual(["Also at 3"]);
    expect(describeSetNotice({ kind: "repeat", detail: "track", compared: { others: [0, 4, 8] } })).toBe(
      "Also at 1, 5 and 9",
    );
  });

  it("says a Set was never checked rather than that nothing is missing", () => {
    expect(FILES.map(describeFileCheck)).toEqual([
      "Files in this Set have never been checked, so a missing file would not show here",
      "1 track in this Set has never been checked",
      null,
    ]);
  });
});

describe("the words", () => {
  it("names the end of an open-ended range it crossed", () => {
    const base = { kind: "bpm_outside_range", acknowledged: false } as const;
    expect(
      describeSetWarning({
        ...base,
        detail: "below",
        compared: { min: 118, max: null, entries: [{ entry_id: 1, bpm: 110 }] },
      }),
    ).toBe("1 track slower than 118 BPM");
    expect(
      describeSetWarning({
        ...base,
        detail: "above",
        compared: { min: null, max: 122.5, entries: [{ entry_id: 1, bpm: 130 }, { entry_id: 2, bpm: 131 }] },
      }),
    ).toBe("2 tracks faster than 122.5 BPM");
  });

  it("counts untimed entries in the plural", () => {
    expect(
      describeSetWarning({
        kind: "over_target",
        detail: "partly_timed",
        compared: { target: 2400, planned: 2700, untimed: 3 },
        acknowledged: false,
      }),
    ).toBe("5:00 over the 40:00 target, before 3 entries still untimed");
  });

  it("names an unknown warning rather than saying nothing", () => {
    const future = { kind: "energy_drop", detail: "steep", compared: {}, acknowledged: false };
    expect(describeSetWarning(future as unknown as SetWarning)).toBe("Check: energy_drop");
  });
});

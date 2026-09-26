/**
 * Similar Tracks' reasons in words (DISCOVER-08, DEC-096).
 *
 * The engine scores a suggestion and says why as data — `{component, detail}`
 * with the values it compared, keys already in the library's own notation —
 * and this module is the one place the renderer turns that into a sentence.
 * DISCOVER-11's Reasons column draws these strings.
 *
 * `similarReasons.fixture.json` is every reason the engine can give, produced
 * by `src/tests/unit/services/test_similar_reasons_fixture.py` from the real
 * service. `similarReasons.test.ts` gives each one its own sentence, so a
 * reason added to the engine without words here fails a test on each side.
 */

import type { SimilarComponent, SimilarReason } from "../../api/cuepointBridge.types";

// The wire's own types, declared once with the rest of Discover's shapes
// (DISCOVER-09); re-exported so a caller of this module needs one import.
export type { SimilarComponent, SimilarReason };

/** What a component is called when a sentence names it. */
const COMPONENT_WORDS: Record<SimilarComponent, string> = {
  tempo: "BPM",
  key: "key",
  genre: "genre",
  label: "label",
  artist: "artist",
};

/** A BPM as a DJ reads it: "128", "127.5", never "128.00". */
export function formatBpm(bpm: number): string {
  return String(Number(bpm.toFixed(2)));
}

/** A reason as a sentence, e.g. "One step on the wheel: 8A → 9A". */
export function describeSimilarReason(reason: SimilarReason): string {
  switch (reason.component) {
    case "tempo": {
      const from = formatBpm(reason.from);
      const to = formatBpm(reason.to);
      switch (reason.detail) {
        case "same":
          return `Same tempo: ${from}`;
        case "close":
          return `Close tempo: ${from} → ${to}`;
        case "half":
          return `Half time: ${from} → ${to}`;
        case "double":
          return `Double time: ${from} → ${to}`;
      }
      break;
    }
    case "key":
      switch (reason.detail) {
        case "same":
          return `Same key: ${reason.from}`;
        case "adjacent":
          return `One step on the wheel: ${reason.from} → ${reason.to}`;
        case "relative":
          return `Relative key: ${reason.from} → ${reason.to}`;
      }
      break;
    case "genre":
      return `Same genre: ${reason.name}`;
    case "label":
      return `Same label: ${reason.name}`;
    case "artist":
      return reason.names.length === 1
        ? `Shared artist: ${reason.names[0]}`
        : `Shared artists: ${reason.names.join(", ")}`;
  }
  // A reason from a newer engine than this renderer: say what it compared
  // rather than nothing. The fixture test keeps every current reason from here.
  const unknown = reason as { component: string };
  return `Similar ${unknown.component}`;
}

/** Joins "a", "a or b", "a, b or c". */
function either(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/**
 * What a seed could not be compared by, as one sentence, or null when it had
 * everything: "This track has no BPM or key to compare." DEC-096 asks a seed
 * with no BPM and no key to say so.
 */
export function describeUnused(unused: SimilarComponent[]): string | null {
  if (unused.length === 0) return null;
  return `This track has no ${either(unused.map((c) => COMPONENT_WORDS[c]))} to compare.`;
}

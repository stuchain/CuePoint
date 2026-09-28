/**
 * A Set's warnings in words (PREP-05, DEC-106).
 *
 * The engine checks every transition, entry and chapter and says what it found
 * as data — `{kind, detail, compared}`, keys already in the library's notation
 * — and this module is the one place the renderer turns that into a sentence.
 * PREP-10 draws these strings beside the entries they belong to.
 *
 * `setWarnings.fixture.json` is every warning the engine can give, produced by
 * `src/tests/unit/services/test_set_warnings_fixture.py` from the real
 * services. `setWarnings.test.ts` gives each one its own sentence, so a warning
 * added to the engine without words here fails a test on each side.
 */

import type { SetFileCheck, SetNotice, SetWarning } from "../../api/cuepointBridge.types";
import { formatBpm } from "../discover/similarReasons";
import { formatTime } from "./setTime";

// The wire's own types, declared with the rest of the bridge's shapes;
// re-exported so a caller of this module needs one import.
export type { SetFileCheck, SetNotice, SetWarning };

/** "1 entry", "3 entries". */
function entries(count: number): string {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

/** "1 track", "3 tracks". */
function tracks(count: number): string {
  return `${count} ${count === 1 ? "track" : "tracks"}`;
}

/** Joins "a", "a and b", "a, b and c". */
function both(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** A warning as a sentence, e.g. "Tempo jumps 16.7% faster: 120 → 140". */
export function describeSetWarning(warning: SetWarning): string {
  switch (warning.kind) {
    case "tempo_jump": {
      const { from, to, percent } = warning.compared;
      return `Tempo jumps ${percent}% ${warning.detail}: ${formatBpm(from)} → ${formatBpm(to)}`;
    }
    case "key_clash":
      return `Keys clash: ${warning.compared.from} → ${warning.compared.to}`;
    case "tempo_unknown":
    case "key_unknown": {
      const what = warning.kind === "tempo_unknown" ? "BPM" : "key";
      switch (warning.detail) {
        case "from":
          return `The track before has no ${what} to compare`;
        case "to":
          return `This track has no ${what} to compare`;
        case "both":
          return `Neither track has a ${what} to compare`;
      }
      break;
    }
    case "file_missing":
      return warning.detail === "drive_unavailable"
        ? "The file's drive was not connected when files were last checked"
        : "The file was missing when files were last checked";
    case "file_unreadable":
      return "The file could not be read when files were last checked";
    case "time_outside_track": {
      const { length, in: start, out } = warning.compared;
      const planned =
        warning.detail === "in" ? `Planned in at ${formatTime(start ?? 0)}` : `Planned out at ${formatTime(out ?? 0)}`;
      return `${planned}, after the track ends at ${formatTime(length)}`;
    }
    case "over_target":
    case "under_target": {
      const { target, planned, untimed } = warning.compared;
      if (warning.kind === "under_target") {
        return `${formatTime(target - planned)} under the ${formatTime(target)} target`;
      }
      const over = `${formatTime(planned - target)} over the ${formatTime(target)} target`;
      return warning.detail === "partly_timed" ? `${over}, before ${entries(untimed)} still untimed` : over;
    }
    case "bpm_outside_range": {
      // A track is below only a range with a floor, and above only one with a
      // ceiling, so each detail names the end it crossed.
      const { min, max } = warning.compared;
      const count = tracks(warning.compared.entries.length);
      switch (warning.detail) {
        case "below":
          return `${count} slower than ${formatBpm(min ?? 0)} BPM`;
        case "above":
          return `${count} faster than ${formatBpm(max ?? 0)} BPM`;
        case "both":
          return `${count} outside ${formatBpm(min ?? 0)}–${formatBpm(max ?? 0)} BPM`;
      }
      break;
    }
  }
  // A warning from a newer engine than this renderer: name it rather than say
  // nothing. The fixture test keeps every current warning from here.
  const unknown = warning as { kind: string };
  return `Check: ${unknown.kind}`;
}

/** A notice as a sentence: "Also at 3 and 9" for a track played again. */
export function describeSetNotice(notice: SetNotice): string {
  return `Also at ${both(notice.compared.others.map((position) => String(position + 1)))}`;
}

/**
 * What the file checks leave unknown, as one sentence, or null when every
 * track was checked. A Set never checked says so rather than showing no
 * missing files, which would be a claim nobody has made (DEC-088).
 */
export function describeFileCheck(files: SetFileCheck): string | null {
  if (files.never_checked) {
    return "Files in this Set have never been checked, so a missing file would not show here";
  }
  if (files.unchecked > 0) {
    return `${tracks(files.unchecked)} in this Set ${files.unchecked === 1 ? "has" : "have"} never been checked`;
  }
  return null;
}

/** True for the warnings a user can acknowledge: a transition's (DEC-106). */
export function isAcknowledgeable(warning: SetWarning): boolean {
  return (
    warning.kind === "tempo_jump" ||
    warning.kind === "key_clash" ||
    warning.kind === "tempo_unknown" ||
    warning.kind === "key_unknown"
  );
}

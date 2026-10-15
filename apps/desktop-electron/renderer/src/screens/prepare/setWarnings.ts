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
import { formatBpm } from "../../components/format/bpm";
import { formatTempoPercent } from "../../format/units";
import { formatLength } from "../../format/durations";

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
      return `Tempo jumps ${warning.detail} (${formatTempoPercent(warning.detail === "faster" ? percent : -percent)}): ${formatBpm(from)} → ${formatBpm(to)}`;
    }
    case "key_clash":
      return `Keys clash: ${warning.compared.from} → ${warning.compared.to}`;
    case "tempo_unknown": {
      // A track with no key is no warning (DEC-201): there is no `key_unknown`.
      switch (warning.detail) {
        case "from":
          return "The track before has no BPM to compare";
        case "to":
          return "This track has no BPM to compare";
        case "both":
          return "Neither track has a BPM to compare";
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
        warning.detail === "in" ? `Planned in at ${formatLength(start ?? 0)}` : `Planned out at ${formatLength(out ?? 0)}`;
      return `${planned}, after the track ends at ${formatLength(length)}`;
    }
    case "over_target":
    case "under_target": {
      const { target, planned, untimed } = warning.compared;
      if (warning.kind === "under_target") {
        return `${formatLength(target - planned)} under the ${formatLength(target)} target`;
      }
      const over = `${formatLength(planned - target)} over the ${formatLength(target)} target`;
      return warning.detail === "partly_timed" ? `${over}, before ${entries(untimed)} still without times` : over;
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
    warning.kind === "tempo_unknown"
  );
}

/**
 * How well a track mixes in from the one before, in two sides: key and tempo
 * (R4-5). Only the open warnings count, so a "Mark OK" turns a side back to
 * fit. A key clash is the key side; a tempo jump, and a BPM that is not known
 * to compare, are the tempo side. Every other kind is about something else (a
 * file, a time, a target) and has no say in whether two tracks mix.
 *
 * `open` is the warnings that made it not fit, for the cell's hover and its
 * label. Pure: the same list always gives the same answer.
 */
export interface SetFit {
  keyOff: boolean;
  tempoOff: boolean;
  /** "fit": both sides fine; "one": one side off; "both": key and tempo off. */
  level: "fit" | "one" | "both";
  open: SetWarning[];
}

export function fitOf(transition: readonly SetWarning[]): SetFit {
  const open = transition.filter(
    (warning) =>
      !warning.acknowledged &&
      (warning.kind === "key_clash" ||
        warning.kind === "tempo_jump" ||
        warning.kind === "tempo_unknown"),
  );
  const keyOff = open.some((warning) => warning.kind === "key_clash");
  const tempoOff = open.some((warning) => warning.kind !== "key_clash");
  return {
    keyOff,
    tempoOff,
    level: keyOff && tempoOff ? "both" : keyOff || tempoOff ? "one" : "fit",
    open,
  };
}

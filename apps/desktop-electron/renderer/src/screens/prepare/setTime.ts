/**
 * A Set's planned times as the engine writes them (PREP-03, DEC-107).
 *
 * Whole seconds, written `m:ss` under an hour and `h:mm:ss` from one: the
 * engine's `core/set_timing.format_time`, restated here because a time is
 * drawn far more often than it is sent. `setWarnings.fixture.json` carries a
 * table of times the engine wrote, and `setTime.test.ts` holds this function to
 * every one of them, so the two cannot drift apart.
 */

/** Whole seconds as a DJ reads them: "3:45", "1:03:45". */
export function formatTime(seconds: number): string {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new RangeError(`A time is a whole number of seconds, not ${seconds}`);
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const ss = String(secs).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

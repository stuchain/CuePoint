/**
 * What the first run remembers (RUN-2, DEC-207).
 *
 * Four flags, each in its own localStorage key and each read and written in a
 * try/catch: storage can be disabled or full, and the app must start without it.
 * Storage that cannot be read means nothing is shown, as the old tour did, so a
 * profile that cannot remember is not asked again at every start. The first steps'
 * two flags are the exception: they only ever hide a list that ticks from real state.
 */

/** The first-run guide's flag; the old tour's key, kept so nobody sees the guide twice. */
const ONBOARDING_KEY = "cuepoint-onboarding-complete";
/** The update note's flag (DEC-207); Phase 16's "What's new" takes over from the next update. */
const NOTE_KEY = "cuepoint-phase14-note-seen";

/** Set once all four first steps are ticked; the checklist is then never shown again (RUN-3). */
const FIRST_STEPS_DONE_KEY = "cuepoint-first-steps-done";
/** Set when a track has been played once, since the player's own state lasts only a session. */
const FIRST_STEPS_PLAYED_KEY = "cuepoint-first-steps-played";

function read(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

function write(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Not remembered; it will be asked again at the next start.
  }
}

/** True when the guide has not been finished or skipped, and storage can say so. */
export function shouldShowOnboarding(): boolean {
  const stored = read(ONBOARDING_KEY);
  return stored !== undefined && stored !== "1";
}

export function markOnboardingDone(): void {
  write(ONBOARDING_KEY);
}

/**
 * True for someone who finished the old tour and has not seen the note: the
 * first start of this version. A new user has not finished a tour at all, and
 * has just been through the new guide.
 */
export function phase14NoteDue(): boolean {
  return read(ONBOARDING_KEY) === "1" && read(NOTE_KEY) === null;
}

export function markPhase14NoteSeen(): void {
  write(NOTE_KEY);
}

/** True when the first steps were all done once; unreadable storage says false, so the list shows. */
export function firstStepsDone(): boolean {
  return read(FIRST_STEPS_DONE_KEY) === "1";
}

export function markFirstStepsDone(): void {
  write(FIRST_STEPS_DONE_KEY);
}

/** True when a track was played in an earlier session or this one. */
export function firstStepsPlayed(): boolean {
  return read(FIRST_STEPS_PLAYED_KEY) === "1";
}

export function markFirstStepsPlayed(): void {
  write(FIRST_STEPS_PLAYED_KEY);
}

/**
 * The marker for an unclean exit (HARDEN-03).
 *
 * Main writes `session.lock` in the user-data folder once it holds DIST-06's single-instance lock,
 * and removes it in the quit's cleanup. Found at the next start, it means the last session did not
 * end: the app was killed, crashed or lost power. Written only by the first copy, and only after
 * `requestSingleInstanceLock()` succeeded, so a second launch never reads the first's marker as a
 * crash (and never overwrites it). A second copy neither reads nor writes it.
 *
 * The marker holds the process id, when the session started and the app's version, for whoever
 * reads a support bundle; nothing decides on them. Whether a marker is "stale" is not asked: the
 * single-instance lock is what says no other copy is running, so any marker found is the last
 * session's.
 *
 * Kept apart from `main.ts`, which cannot be imported without starting the app, so it can be tested.
 */
import fs from "node:fs";
import path from "node:path";

import { writeAtomicSync } from "./atomicWrite";

/** The marker's name, in `app.getPath("userData")`. */
export const SESSION_LOCK_FILE = "session.lock";

export interface SessionLockContents {
  pid: number;
  /** When this session started, as an ISO date-time. */
  startedAt: string;
  appVersion: string;
}

/** The file operations, injectable so a test can say what was touched. */
export interface SessionLockFiles {
  exists: (file: string) => boolean;
  write: (file: string, text: string) => void;
  remove: (file: string) => void;
}

const realFiles: SessionLockFiles = {
  exists: (file) => fs.existsSync(file),
  write: (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeAtomicSync(file, text);
  },
  remove: (file) => fs.rmSync(file, { force: true }),
};

export interface SessionLockOptions {
  /** `app.getPath("userData")`. */
  folder: string;
  /** The result of `enforceSingleInstance`: false in a second copy, which touches nothing. */
  first: boolean;
  appVersion: string;
  pid?: number;
  now?: () => Date;
  files?: SessionLockFiles;
}

export interface SessionLock {
  /** The last session did not end: the marker was there when this one started. False in a second copy. */
  readonly uncleanExit: boolean;
  /** Take the marker away: the quit's cleanup. Does nothing in a second copy, and when already released. */
  release: () => void;
}

/**
 * Look for the last session's marker and write this session's. Call it once, right after the
 * single-instance lock was granted; with `first: false` it neither reads nor writes anything.
 * Never throws: a folder that cannot be written reads as a clean start, as having no marker does.
 */
export function startSession(options: SessionLockOptions): SessionLock {
  if (!options.first) return { uncleanExit: false, release: () => undefined };
  const files = options.files ?? realFiles;
  const file = path.join(options.folder, SESSION_LOCK_FILE);

  let uncleanExit = false;
  try {
    uncleanExit = files.exists(file);
  } catch {
    uncleanExit = false;
  }
  const contents: SessionLockContents = {
    pid: options.pid ?? process.pid,
    startedAt: (options.now?.() ?? new Date()).toISOString(),
    appVersion: options.appVersion,
  };
  try {
    files.write(file, `${JSON.stringify(contents, null, 2)}\n`);
  } catch {
    /* no marker this session: a crash then reads as a clean exit, which is the safe way to be wrong */
  }

  let released = false;
  return {
    uncleanExit,
    release: () => {
      if (released) return;
      released = true;
      try {
        files.remove(file);
      } catch {
        /* the next start will read this session as unclean; nothing here can do better */
      }
    },
  };
}

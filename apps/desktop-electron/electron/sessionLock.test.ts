import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { enforceSingleInstance, type SingleInstanceApp } from "./singleInstance";
import { SESSION_LOCK_FILE, startSession, type SessionLockFiles } from "./sessionLock";

/**
 * The unclean-exit marker (HARDEN-03): written only after the single-instance lock, removed at a
 * clean quit, found after a kill, and untouched by a second copy.
 */

let folder: string;
const lockFile = (): string => path.join(folder, SESSION_LOCK_FILE);

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "cuepoint-session-"));
});
afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

/** Electron's `app`, with the lock granted or refused, recording the order of what happened. */
function fakeApp(granted: boolean, events: string[]): SingleInstanceApp {
  return {
    requestSingleInstanceLock: () => {
      events.push("lock");
      return granted;
    },
    exit: () => events.push("exit"),
    on: () => undefined,
  };
}

/** Real files, recording each touch, in the order the app's start would make them. */
function recordingFiles(events: string[]): SessionLockFiles {
  return {
    exists: (file) => {
      events.push("read");
      return fs.existsSync(file);
    },
    write: (file, text) => {
      events.push("write");
      fs.writeFileSync(file, text);
    },
    remove: (file) => {
      events.push("remove");
      fs.rmSync(file, { force: true });
    },
  };
}

/** What `main.ts` does at start: ask for the lock, and only then the marker. */
function launch(granted: boolean, events: string[]) {
  const first = enforceSingleInstance(fakeApp(granted, events), () => null);
  return startSession({ folder, first, appVersion: "1.0.0", files: recordingFiles(events) });
}

describe("the session marker", () => {
  it("is written only after the single-instance lock was granted", () => {
    const events: string[] = [];
    launch(true, events);
    expect(events.indexOf("lock")).toBe(0);
    expect(events.indexOf("write")).toBeGreaterThan(events.indexOf("lock"));
    expect(fs.existsSync(lockFile())).toBe(true);
  });

  it("holds the process, when it started and the app's version", () => {
    startSession({
      folder,
      first: true,
      appVersion: "1.2.3",
      pid: 4242,
      now: () => new Date("2026-10-29T12:00:00.000Z"),
    });
    expect(JSON.parse(fs.readFileSync(lockFile(), "utf8"))).toEqual({
      pid: 4242,
      startedAt: "2026-10-29T12:00:00.000Z",
      appVersion: "1.2.3",
    });
  });

  it("is a clean start the first time", () => {
    expect(launch(true, []).uncleanExit).toBe(false);
  });

  it("is removed at a clean quit, so the next start is clean", () => {
    const session = launch(true, []);
    session.release();
    expect(fs.existsSync(lockFile())).toBe(false);
    expect(launch(true, []).uncleanExit).toBe(false);
  });

  it("is found after a kill: the next start is unclean", () => {
    launch(true, []); // never released: the process was killed
    const next = launch(true, []);
    expect(next.uncleanExit).toBe(true);
    // And this session's marker replaces the old one.
    expect(JSON.parse(fs.readFileSync(lockFile(), "utf8")).pid).toBe(process.pid);
  });

  it("a second copy neither reads nor writes it, and does not remove it", () => {
    const first = launch(true, []);
    const before = fs.readFileSync(lockFile(), "utf8");

    const events: string[] = [];
    const second = launch(false, events);
    expect(events).toEqual(["lock", "exit"]); // no read, no write
    expect(second.uncleanExit).toBe(false);
    second.release();
    expect(events).toEqual(["lock", "exit"]);
    expect(fs.readFileSync(lockFile(), "utf8")).toBe(before);

    // The first copy's quit is clean, so nothing is found next time.
    first.release();
    expect(launch(true, []).uncleanExit).toBe(false);
  });

  it("does not read a running copy's marker as a crash", () => {
    launch(true, []); // the first copy is running
    const second = launch(false, []);
    expect(second.uncleanExit).toBe(false);
  });

  it("releases once, and reads a folder it cannot write as a clean start", () => {
    const calls: string[] = [];
    const session = startSession({
      folder,
      first: true,
      appVersion: "1.0.0",
      files: {
        exists: () => false,
        write: () => {
          throw new Error("read-only");
        },
        remove: () => calls.push("remove"),
      },
    });
    expect(session.uncleanExit).toBe(false);
    session.release();
    session.release();
    expect(calls).toEqual(["remove"]);
  });
});

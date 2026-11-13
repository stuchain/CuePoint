/**
 * The engine's stall dump (Sentry ELECTRON-3).
 *
 * The engine arms a watchdog (`stall_watchdog.py`) that writes every thread's stack to
 * `engine-stall.txt` when the whole process stops answering. When the heartbeat kills such an
 * engine, or a start gives up, the file's tail goes out with the incident. The supervisor hands the
 * engine the file's path (`CUEPOINT_STALL_FILE`) and clears it before each start, so what is read
 * was written by the engine being killed.
 */

import fs from "node:fs";

/** The file's name, in the folder main gives the engine (`app.getPath("logs")`). */
export const STALL_DUMP_FILE = "engine-stall.txt";

/**
 * The most that is read from the end of the file: twice the engine's own 256 KB restart size, so
 * a large dump (up to 100 threads of 100 frames each) is read whole.
 */
export const STALL_DUMP_MAX_BYTES = 512 * 1024;

/** What `faulthandler` writes at the head of each dump, and on each thread it lists. */
const DUMP_MARK = /^Timeout \(\d+:\d\d:\d\d(?:\.\d+)?\)!|\(most recent call first\):$/m;

/** The engine's `armed <iso time> [<launch token>]` line, rewritten by its ticker every few seconds. */
const ARMED_LINE = /^armed (\S+)(?: (\S+))?$/gm;

export interface StallDumpFs {
  openSync(path: string, flags: "r"): number;
  fstatSync(fd: number): { size: number };
  readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number): number;
  closeSync(fd: number): void;
  unlinkSync(path: string): void;
}

/**
 * The dump the engine wrote since its ticker last ran, from its last `armed` line on, or null when
 * the file is missing, unreadable, or holds no such dump.
 *
 * Only what follows the last `armed` line counts: the ticker writes that line after any dump it
 * lived through (a 60 s pause that recovered, a laptop waking), so an older dump is never sent as
 * the current freeze's. With `token`, an `armed` line carrying another launch's token (an older
 * engine still holding the file on Windows) gives null too. At most `maxBytes` are read from the
 * end; a tail with no `armed` line in it is one big dump, kept from its first whole line.
 */
export function readStallDump(
  file: string | null,
  token: string | null = null,
  ops: StallDumpFs = fs,
  maxBytes: number = STALL_DUMP_MAX_BYTES,
): string | null {
  if (file === null || file === "") return null;
  let fd: number | null = null;
  try {
    fd = ops.openSync(file, "r");
    const { size } = ops.fstatSync(fd);
    if (size <= 0) return null;
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    const read = ops.readSync(fd, buffer, 0, length, size - length);
    let text = buffer.subarray(0, read).toString("utf8");
    if (size > length) {
      const newline = text.indexOf("\n");
      text = newline >= 0 ? text.slice(newline + 1) : text;
    }
    let lastArmed: RegExpExecArray | null = null;
    for (const match of text.matchAll(ARMED_LINE)) lastArmed = match as RegExpExecArray;
    if (lastArmed !== null) {
      const armedToken = lastArmed[2] ?? null;
      if (token !== null && armedToken !== null && armedToken !== token) return null;
      text = text.slice(lastArmed.index);
    }
    return DUMP_MARK.test(text) ? text : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        ops.closeSync(fd);
      } catch {
        /* nothing to do */
      }
    }
  }
}

/** Remove the file before an engine starts, so an old dump is never read as the new engine's. */
export function clearStallDump(file: string | null, ops: Pick<StallDumpFs, "unlinkSync"> = fs): void {
  if (file === null || file === "") return;
  try {
    ops.unlinkSync(file);
  } catch {
    /* missing is the usual case */
  }
}

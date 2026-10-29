/**
 * Whole-or-nothing file writes for the main process (HARDEN-04).
 *
 * The same contract as the engine's `cuepoint/utils/atomic_write.py`: a file
 * CuePoint writes is, after a crash or a power cut, the old version or the new
 * one, never a mix and never empty. A temporary file beside the target is
 * written, flushed and `fsync`ed, renamed over the target, and the folder is
 * `fsync`ed (not on Windows, which cannot open a folder) so the rename itself
 * survives a power cut.
 *
 * The temporary file is named `.<name>.cuepoint-tmp-<pid>` (a `-<n>` is added
 * when two writes to one target overlap in this process), so what a killed
 * write leaves behind can be told apart and swept: `sweepTempFiles` removes
 * those whose process is gone. Both sides use the same names, so either can
 * sweep a folder the other wrote in.
 *
 * `writeAtomic` is the async form; `writeAtomicSync` is for the few callers
 * that are synchronous by contract (the settings store).
 */
import fs from "node:fs";
import path from "node:path";

/** Marks a temporary file; the name ends `<marker><pid>` or `<marker><pid>-<n>`. */
export const TEMP_MARKER = ".cuepoint-tmp-";

const TEMP_NAME = /^\..+\.cuepoint-tmp-(\d+)(?:-\d+)?$/;

export type AtomicData = string | Uint8Array | Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array>;

export interface AtomicWriteOptions {
  /** Text encoding for string data. Default `utf8`. */
  encoding?: BufferEncoding;
  /** Permission bits for a new file (POSIX). An existing file's bits are kept. */
  mode?: number;
}

/** The temporary file name for a file called `name`. */
export function tempNameFor(name: string, pid: number = process.pid, serial = 0): string {
  const base = `.${name}${TEMP_MARKER}${pid}`;
  return serial === 0 ? base : `${base}-${serial}`;
}

function asBytes(chunk: string | Uint8Array, encoding: BufferEncoding): Uint8Array {
  return typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk;
}

function isIterable(data: AtomicData): data is Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array> {
  return typeof data === "object" && data !== null && !(data instanceof Uint8Array);
}

/** The mode to give the new file: the old file's bits when there is one. */
function modeFor(file: string, requested: number | undefined): number | undefined {
  if (process.platform === "win32") return requested;
  try {
    return fs.statSync(file).mode & 0o7777;
  } catch {
    return requested;
  }
}

async function modeForAsync(file: string, requested: number | undefined): Promise<number | undefined> {
  if (process.platform === "win32") return requested;
  try {
    return (await fs.promises.stat(file)).mode & 0o7777;
  } catch {
    return requested;
  }
}

/** `fsync` a folder so a rename in it survives a power cut. Best effort; never on Windows. */
export async function fsyncFolder(folder: string): Promise<void> {
  if (process.platform === "win32") return;
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(folder, "r");
    await handle.sync();
  } catch {
    // A write that has landed is not worth failing over its folder.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export function fsyncFolderSync(folder: string): void {
  if (process.platform === "win32") return;
  let fd: number | undefined;
  try {
    fd = fs.openSync(folder, "r");
    fs.fsyncSync(fd);
  } catch {
    // As above.
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Nothing to do.
      }
    }
  }
}

/**
 * Replace `file` with `data` whole or not at all. A failure anywhere leaves the old file as
 * it was and no temporary file behind. Returns the number of bytes written.
 */
export async function writeAtomic(file: string, data: AtomicData, options: AtomicWriteOptions = {}): Promise<number> {
  const encoding = options.encoding ?? "utf8";
  const folder = path.dirname(file);
  const base = path.basename(file);
  let temporary = "";
  let handle: fs.promises.FileHandle | undefined;
  let size = 0;
  try {
    for (let serial = 0; ; serial += 1) {
      temporary = path.join(folder, tempNameFor(base, process.pid, serial));
      try {
        handle = await fs.promises.open(temporary, "wx", options.mode ?? 0o666);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || serial > 1000) throw error;
      }
    }
    if (typeof data === "string" || data instanceof Uint8Array) {
      const bytes = asBytes(data, encoding);
      await handle.writeFile(bytes);
      size = bytes.byteLength;
    } else if (isIterable(data)) {
      for await (const chunk of data) {
        const bytes = asBytes(chunk, encoding);
        await handle.write(bytes);
        size += bytes.byteLength;
      }
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    const mode = await modeForAsync(file, undefined);
    if (mode !== undefined) await fs.promises.chmod(temporary, mode);
    await fs.promises.rename(temporary, file);
    temporary = "";
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (temporary) await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  await fsyncFolder(folder);
  return size;
}

/** `writeAtomic`, synchronously. Data is a string or bytes. */
export function writeAtomicSync(file: string, data: string | Uint8Array, options: AtomicWriteOptions = {}): number {
  const encoding = options.encoding ?? "utf8";
  const folder = path.dirname(file);
  const base = path.basename(file);
  let temporary = "";
  let fd: number | undefined;
  let size = 0;
  try {
    for (let serial = 0; ; serial += 1) {
      temporary = path.join(folder, tempNameFor(base, process.pid, serial));
      try {
        fd = fs.openSync(temporary, "wx", options.mode ?? 0o666);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || serial > 1000) throw error;
      }
    }
    const bytes = asBytes(data, encoding);
    fs.writeSync(fd, bytes);
    size = bytes.byteLength;
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    const mode = modeFor(file, undefined);
    if (mode !== undefined) fs.chmodSync(temporary, mode);
    fs.renameSync(temporary, file);
    temporary = "";
  } catch (error) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Already failing.
      }
    }
    if (temporary) fs.rmSync(temporary, { force: true });
    throw error;
  }
  fsyncFolderSync(folder);
  return size;
}

/** Whether a process with this id exists. A process that cannot be asked about counts as alive. */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/**
 * Remove `.*.cuepoint-tmp-<pid>` files whose process is gone, from the top level of each
 * folder (a missing folder is skipped). Returns the files removed. Never throws.
 */
export function sweepTempFiles(folders: Iterable<string>, isAlive: (pid: number) => boolean = pidAlive): string[] {
  const removed: string[] = [];
  for (const folder of folders) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const match = TEMP_NAME.exec(entry.name);
      if (!match || !entry.isFile()) continue;
      if (isAlive(Number(match[1]))) continue;
      const file = path.join(folder, entry.name);
      try {
        fs.rmSync(file, { force: true });
        removed.push(file);
      } catch {
        // Left for the next start.
      }
    }
  }
  return removed;
}

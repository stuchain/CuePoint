import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BUSY_RETRY_DELAYS_MS,
  TEMP_MARKER,
  pidAlive,
  renameRetrying,
  renameRetryingSync,
  sweepTempFiles,
  sweepTempFilesAsync,
  tempNameFor,
  writeAtomic,
  writeAtomicSync,
} from "./atomicWrite";

/**
 * Whole-or-nothing writes (HARDEN-04): the same contract as the engine's
 * `cuepoint/utils/atomic_write.py`, with the same temporary names.
 */

const made: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function folder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuepoint-atomic-"));
  made.push(dir);
  return dir;
}

function leftovers(dir: string): string[] {
  return fs.readdirSync(dir).filter((name) => name.includes(TEMP_MARKER));
}

describe("names", () => {
  it("names the temporary file beside the target with the process id", () => {
    expect(tempNameFor("a.json", 42)).toBe(".a.json.cuepoint-tmp-42");
    expect(tempNameFor("a.json", 42, 2)).toBe(".a.json.cuepoint-tmp-42-2");
  });

  it("can keep the extension last, for a copy of an audio file", () => {
    expect(tempNameFor("song.mp3", 7, 0, true)).toBe(".song.cuepoint-tmp-7.mp3");
    expect(tempNameFor("song.mp3", 7, 2, true)).toBe(".song.cuepoint-tmp-7-2.mp3");
  });
});

describe("writeAtomic", () => {
  it("writes text, bytes and chunks", async () => {
    const dir = folder();
    const file = path.join(dir, "out.txt");
    expect(await writeAtomic(file, "héllo")).toBe(6);
    expect(fs.readFileSync(file, "utf8")).toBe("héllo");
    await writeAtomic(file, new Uint8Array([1, 2, 3]));
    expect([...fs.readFileSync(file)]).toEqual([1, 2, 3]);
    await writeAtomic(file, ["a", new Uint8Array([98]), "c"]);
    expect(fs.readFileSync(file, "utf8")).toBe("abc");
    expect(leftovers(dir)).toEqual([]);
  });

  it("leaves the old file and no temporary when a stream fails half way", async () => {
    const dir = folder();
    const file = path.join(dir, "out.txt");
    fs.writeFileSync(file, "old");
    async function* broken(): AsyncGenerator<string> {
      yield "new-part";
      throw new Error("disk went away");
    }
    await expect(writeAtomic(file, broken())).rejects.toThrow("disk went away");
    expect(fs.readFileSync(file, "utf8")).toBe("old");
    expect(leftovers(dir)).toEqual([]);
  });

  it("leaves the old file and no temporary when the rename is refused", async () => {
    const dir = folder();
    const file = path.join(dir, "out.txt");
    fs.writeFileSync(file, "old");
    vi.spyOn(fs.promises, "rename").mockRejectedValue(Object.assign(new Error("in use"), { code: "EPERM" }));
    await expect(writeAtomic(file, "new")).rejects.toThrow("in use");
    expect(fs.readFileSync(file, "utf8")).toBe("old");
    expect(leftovers(dir)).toEqual([]);
  });

  it("writes to a temporary beside the target, then renames it", async () => {
    const dir = folder();
    const file = path.join(dir, "settings.json");
    const real = fs.promises.rename.bind(fs.promises);
    const seen: Array<[string, string]> = [];
    vi.spyOn(fs.promises, "rename").mockImplementation(async (from, to) => {
      seen.push([String(from), String(to)]);
      return real(from, to);
    });
    await writeAtomic(file, "{}");
    expect(seen).toEqual([[path.join(dir, `.settings.json${TEMP_MARKER}${process.pid}`), file]]);
  });

  it.skipIf(process.platform === "win32")("fsyncs the folder after the rename", async () => {
    const dir = folder();
    const opened: string[] = [];
    const real = fs.promises.open.bind(fs.promises);
    vi.spyOn(fs.promises, "open").mockImplementation(((target: fs.PathLike, ...rest: unknown[]) => {
      opened.push(String(target));
      return (real as (...args: unknown[]) => Promise<fs.promises.FileHandle>)(target, ...rest);
    }) as typeof fs.promises.open);
    await writeAtomic(path.join(dir, "f"), "x");
    expect(opened[opened.length - 1]).toBe(dir);
  });

  it.skipIf(process.platform === "win32")("keeps an existing file's permission bits", async () => {
    const dir = folder();
    const file = path.join(dir, "f");
    fs.writeFileSync(file, "old");
    fs.chmodSync(file, 0o640);
    await writeAtomic(file, "new");
    expect(fs.statSync(file).mode & 0o777).toBe(0o640);
  });

  it("does not collide with another write to the same target in this process", async () => {
    const dir = folder();
    const file = path.join(dir, "f");
    await Promise.all([writeAtomic(file, "one"), writeAtomic(file, "two")]);
    expect(fs.readFileSync(file, "utf8")).toBe("two");
    expect(leftovers(dir)).toEqual([]);
  });

  it("lets writes to one target land one at a time, in the order they were asked", async () => {
    const dir = folder();
    const file = path.join(dir, "settings.json");
    const real = fs.promises.rename.bind(fs.promises);
    let inFlight = 0;
    let most = 0;
    vi.spyOn(fs.promises, "rename").mockImplementation(async (from, to) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return real(from, to);
    });
    await Promise.all(["1", "2", "3", "4"].map((text) => writeAtomic(file, text)));
    expect(most).toBe(1);
    expect(fs.readFileSync(file, "utf8")).toBe("4");
  });

  it("goes on with the next write to a target after one fails", async () => {
    const dir = folder();
    const file = path.join(dir, "f");
    const real = fs.promises.rename.bind(fs.promises);
    vi.spyOn(fs.promises, "rename")
      .mockRejectedValueOnce(Object.assign(new Error("disk"), { code: "EIO" }))
      .mockImplementation(real);
    const [first, second] = await Promise.allSettled([writeAtomic(file, "one"), writeAtomic(file, "two")]);
    expect(first.status).toBe("rejected");
    expect(second.status).toBe("fulfilled");
    expect(fs.readFileSync(file, "utf8")).toBe("two");
    expect(leftovers(dir)).toEqual([]);
  });

  it("does not hold up writes to other targets", async () => {
    const dir = folder();
    await Promise.all([writeAtomic(path.join(dir, "a"), "a"), writeAtomic(path.join(dir, "b"), "b")]);
    expect(fs.readFileSync(path.join(dir, "a"), "utf8")).toBe("a");
    expect(fs.readFileSync(path.join(dir, "b"), "utf8")).toBe("b");
  });
});

describe("a rename Windows refuses as busy", () => {
  const busy = (code: string) => Object.assign(new Error(`${code}: operation not permitted, rename`), { code });

  it.each(["EPERM", "EACCES", "EBUSY"])("is tried again on Windows after %s", async (code) => {
    const rename = vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(busy(code)).mockRejectedValueOnce(busy(code)).mockResolvedValue();
    await renameRetrying("from", "to", "win32");
    expect(rename).toHaveBeenCalledTimes(3);
  });

  it("gives up after about a second, with the last error", async () => {
    const rename = vi.spyOn(fs.promises, "rename").mockRejectedValue(busy("EPERM"));
    const started = Date.now();
    await expect(renameRetrying("from", "to", "win32")).rejects.toThrow("EPERM");
    expect(rename).toHaveBeenCalledTimes(BUSY_RETRY_DELAYS_MS.length + 1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it("is not tried again for another error, or on another system", async () => {
    const rename = vi.spyOn(fs.promises, "rename").mockRejectedValue(busy("ENOENT"));
    await expect(renameRetrying("from", "to", "win32")).rejects.toThrow("ENOENT");
    rename.mockRejectedValue(busy("EPERM"));
    await expect(renameRetrying("from", "to", "darwin")).rejects.toThrow("EPERM");
    expect(rename).toHaveBeenCalledTimes(2);
  });

  it("is tried again by the synchronous form too", () => {
    let calls = 0;
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      calls += 1;
      if (calls < 3) throw busy("EBUSY");
    });
    renameRetryingSync("from", "to", "win32");
    expect(calls).toBe(3);
    expect(() => renameRetryingSync("from", "to", "linux")).not.toThrow();
  });
});

describe("writeAtomicSync", () => {
  it("writes whole", () => {
    const dir = folder();
    const file = path.join(dir, "f.json");
    writeAtomicSync(file, '{"a":1}\n');
    expect(fs.readFileSync(file, "utf8")).toBe('{"a":1}\n');
    expect(leftovers(dir)).toEqual([]);
  });

  it("leaves the old file and no temporary when the rename is refused", () => {
    const dir = folder();
    const file = path.join(dir, "f.json");
    fs.writeFileSync(file, "old");
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("in use");
    });
    expect(() => writeAtomicSync(file, "new")).toThrow("in use");
    expect(fs.readFileSync(file, "utf8")).toBe("old");
    expect(leftovers(dir)).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("fsyncs the file before the rename and the folder after", () => {
    const dir = folder();
    const order: string[] = [];
    const realFsync = fs.fsyncSync;
    const realRename = fs.renameSync;
    vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
      order.push("fsync");
      return realFsync(fd);
    });
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      order.push("rename");
      return realRename(from, to);
    });
    writeAtomicSync(path.join(dir, "f"), "x");
    expect(order).toEqual(["fsync", "rename", "fsync"]);
  });
});

describe("sweepTempFiles", () => {
  it("removes temporaries of dead processes only", () => {
    const dir = folder();
    const dead = 4_000_000;
    const gone = path.join(dir, tempNameFor("a.json", dead));
    const goneSerial = path.join(dir, tempNameFor("b.json", dead, 1));
    const mine = path.join(dir, tempNameFor("c.json", process.pid));
    const plain = path.join(dir, "a.json");
    const lookalike = path.join(dir, `visible${TEMP_MARKER}${dead}`);
    for (const file of [gone, goneSerial, mine, plain, lookalike]) fs.writeFileSync(file, "x");

    const removed = sweepTempFiles([dir, path.join(dir, "missing")], (pid) => pid === process.pid);

    expect(removed.sort()).toEqual([gone, goneSerial].sort());
    for (const kept of [mine, plain, lookalike]) expect(fs.existsSync(kept)).toBe(true);
  });

  it("uses the real process table by default", () => {
    expect(pidAlive(process.pid)).toBe(true);
    expect(pidAlive(0)).toBe(false);
    const dir = folder();
    const mine = path.join(dir, tempNameFor("c.json", process.pid));
    fs.writeFileSync(mine, "x");
    expect(sweepTempFiles([dir])).toEqual([]);
    expect(fs.existsSync(mine)).toBe(true);
  });
});

describe("sweepTempFilesAsync", () => {
  it("removes the same files the synchronous sweep does, including copies that kept their extension", async () => {
    const dir = folder();
    const dead = 4_000_000;
    const plain = path.join(dir, tempNameFor("a.json", dead));
    const copy = path.join(dir, tempNameFor("song.mp3", dead, 1, true));
    const mine = path.join(dir, tempNameFor("song.mp3", process.pid, 0, true));
    const music = path.join(dir, "song.mp3");
    for (const file of [plain, copy, mine, music]) fs.writeFileSync(file, "x");

    const removed = await sweepTempFilesAsync([dir, path.join(dir, "missing")], (pid) => pid === process.pid);

    expect(removed.sort()).toEqual([plain, copy].sort());
    expect(fs.existsSync(mine)).toBe(true);
    expect(fs.existsSync(music)).toBe(true);
  });
});

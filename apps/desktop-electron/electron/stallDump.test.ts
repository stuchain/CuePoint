import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STALL_DUMP_MAX_BYTES, clearStallDump, readStallDump } from "./stallDump";

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cp-stalldump-"));
  file = path.join(dir, "engine-stall.txt");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("readStallDump", () => {
  it("is null when there is no file, no path, or no dump in it", () => {
    expect(readStallDump(null)).toBeNull();
    expect(readStallDump(file)).toBeNull();
    writeFileSync(file, "");
    expect(readStallDump(file)).toBeNull();
    writeFileSync(file, "armed 2026-11-13T10:00:00+00:00\n");
    expect(readStallDump(file)).toBeNull();
  });

  it("returns a small file whole", () => {
    const text = "armed x\nTimeout (0:01:00)!\n\nThread 0x1 (most recent call first):\n  File \"a.py\", line 1 in f\n";
    writeFileSync(file, text);
    expect(readStallDump(file)).toBe(text);
  });

  it("reads only the last 512 KB of a big file, from the start of a line", () => {
    const old = "OLD-LINE-THAT-MUST-NOT-COME-BACK\n".repeat(20_000);
    const tail = "Timeout (0:01:00)!\n" + "  File \"a.py\", line 1 in f\n".repeat(100);
    writeFileSync(file, old + tail);
    const read = readStallDump(file)!;
    expect(Buffer.byteLength(read)).toBeLessThanOrEqual(STALL_DUMP_MAX_BYTES);
    expect(read.endsWith(tail)).toBe(true);
    expect(read.startsWith("OLD-LINE")).toBe(true); // a whole line, never half of one
    expect(read.length).toBeLessThan(old.length);
  });

  it("asks the file system for no more than the bound", () => {
    const readSync = vi.fn((_fd: number, buffer: Buffer) => {
      buffer.write("half a line\nTimeout (0:01:00)!\n");
      return 31;
    });
    const ops = {
      openSync: () => 7,
      fstatSync: () => ({ size: 50 * 1024 * 1024 }),
      readSync,
      closeSync: vi.fn(),
      unlinkSync: vi.fn(),
    };
    expect(readStallDump("x", null, ops, 1024)).toContain("Timeout");
    const [, buffer, , length, position] = readSync.mock.calls[0]! as unknown as [number, Buffer, number, number, number];
    expect(buffer.length).toBe(1024);
    expect(length).toBe(1024);
    expect(position).toBe(50 * 1024 * 1024 - 1024);
    expect(ops.closeSync).toHaveBeenCalledWith(7);
  });

  it("ignores a dump the engine lived through before its last armed line", () => {
    writeFileSync(
      file,
      "armed 1\nTimeout (0:00:40)!\n\nThread 0x1 (most recent call first):\n  File \"a.py\", line 1 in f\narmed 2\n",
    );
    expect(readStallDump(file)).toBeNull();
  });

  it("returns the dump after the last armed line, from that line on", () => {
    const fresh = "armed 2 tok\nTimeout (0:00:40)!\n\nThread 0x2 (most recent call first):\n  File \"b.py\", line 2 in g\n";
    writeFileSync(file, "armed 1 tok\nTimeout (0:00:40)!\nOLD\n" + fresh);
    expect(readStallDump(file, "tok")).toBe(fresh);
  });

  it("is null when the armed line belongs to another launch", () => {
    writeFileSync(file, "armed 1 other\nTimeout (0:00:40)!\n\nThread 0x1 (most recent call first):\n");
    expect(readStallDump(file, "mine")).toBeNull();
    expect(readStallDump(file, "other")).not.toBeNull();
  });

  it("keeps a dump bigger than the tail it reads, with no armed line in it", () => {
    const frames = ("Thread 0x1 (most recent call first):\n" + '  File "a.py", line 1 in f\n'.repeat(50)).repeat(100);
    writeFileSync(file, "armed 1\nTimeout (0:00:40)!\n" + frames);
    const read = readStallDump(file, null, undefined, 16 * 1024);
    expect(read).not.toBeNull();
    expect(read).toContain("(most recent call first):");
  });

  it("never throws", () => {
    const ops = {
      openSync: () => {
        throw new Error("EACCES");
      },
      fstatSync: () => ({ size: 1 }),
      readSync: () => 0,
      closeSync: () => undefined,
      unlinkSync: () => undefined,
    };
    expect(readStallDump(file, null, ops)).toBeNull();
  });
});

describe("clearStallDump", () => {
  it("removes the file, and a missing one is fine", () => {
    writeFileSync(file, "x");
    clearStallDump(file);
    expect(existsSync(file)).toBe(false);
    expect(() => clearStallDump(file)).not.toThrow();
    expect(() => clearStallDump(null)).not.toThrow();
  });
});

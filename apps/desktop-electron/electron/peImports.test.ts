import { describe, expect, it } from "vitest";

import { MAX_IMPORT_DESCRIPTORS, MAX_READS, findMissingDlls, isApiSetName, readPeImports, type PeFs } from "./peImports";

/** A tiny PE32/PE32+ image: one section holding both import tables (mirrors the Python tests' `_pe`). */
function buildPe(
  imports: readonly string[] = [],
  options: {
    delay?: readonly string[];
    pe32?: boolean;
    delayAttributes?: number;
    imageBase?: number;
    /** Point the name of this import descriptor outside the file. */
    badNameIndex?: number;
  } = {},
): Uint8Array {
  const is64 = !options.pe32;
  const optionalSize = is64 ? 240 : 224;
  const dirsOffset = is64 ? 112 : 96;
  const peOffset = 0x40;
  const raw = 0x400;
  const va = 0x1000;
  const body: number[] = [];
  const names = new Map<string, number>();
  const nameAt = (name: string): number => {
    if (!names.has(name)) {
      names.set(name, body.length);
      for (const ch of name) body.push(ch.charCodeAt(0));
      body.push(0);
    }
    return va + names.get(name)!;
  };
  const importRvas = imports.map((n, i) => (i === options.badNameIndex ? nameAt(n) + 0x7ff00000 : nameAt(n)));
  const delayRvas = (options.delay ?? []).map(nameAt);
  while (body.length % 8) body.push(0);
  const u32 = (value: number): number[] => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
  const u16 = (value: number): number[] => [value & 255, (value >>> 8) & 255];
  const importTable = body.length;
  for (const rva of importRvas) body.push(...u32(0), ...u32(0), ...u32(0), ...u32(rva), ...u32(0));
  body.push(...Array.from({ length: 20 }, () => 0));
  const delayTable = body.length;
  const attributes = options.delayAttributes ?? 1;
  for (const rva of delayRvas) {
    const nameField = attributes & 1 ? rva : rva + (options.imageBase ?? 0);
    body.push(...u32(attributes), ...u32(nameField), ...Array.from({ length: 24 }, () => 0));
  }
  body.push(...Array.from({ length: 32 }, () => 0));

  const dos = Array.from({ length: peOffset }, () => 0);
  dos[0] = 0x4d;
  dos[1] = 0x5a;
  dos.splice(0x3c, 4, ...u32(peOffset));
  const coff = [0x50, 0x45, 0, 0, ...u16(0x8664), ...u16(1), ...u32(0), ...u32(0), ...u32(0), ...u16(optionalSize), ...u16(0x22)];
  const optional = Array.from({ length: optionalSize }, () => 0);
  optional.splice(0, 2, ...u16(is64 ? 0x20b : 0x10b));
  optional.splice(is64 ? 24 : 28, 4, ...u32(options.imageBase ?? 0));
  optional.splice(dirsOffset - 4, 4, ...u32(16));
  if (imports.length) optional.splice(dirsOffset + 8, 8, ...u32(va + importTable), ...u32(20 * (imports.length + 1)));
  if (delayRvas.length) {
    optional.splice(dirsOffset + 8 * 13, 8, ...u32(va + delayTable), ...u32(32 * (delayRvas.length + 1)));
  }
  const section = [
    0x2e, 0x72, 0x64, 0x61, 0x74, 0x61, 0, 0,
    ...u32(body.length),
    ...u32(va),
    ...u32(body.length),
    ...u32(raw),
    ...Array.from({ length: 16 }, () => 0),
  ];
  const head = dos.concat(coff, optional, section);
  const out = new Uint8Array(raw + body.length);
  out.set(head, 0);
  out.set(body, raw);
  return out;
}

const readerOf =
  (bytes: Uint8Array) =>
  (offset: number, length: number): Uint8Array =>
    bytes.subarray(Math.min(offset, bytes.length), Math.min(offset + length, bytes.length));

/** A fake `fs` holding one executable and some folder listings; records what was read. */
function fakeFs(files: Record<string, Uint8Array>, dirs: Record<string, string[] | Error>) {
  const log = { reads: [] as Array<[number, number]>, opened: 0, closed: 0 };
  const fs: PeFs = {
    openSync(path) {
      const file = files[path];
      if (!file) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      log.opened += 1;
      return Object.keys(files).indexOf(path) + 10;
    },
    readSync(fd, buffer, offset, length, position) {
      const file = Object.values(files)[fd - 10]!;
      log.reads.push([position, length]);
      const chunk = file.subarray(position, position + length);
      buffer.set(chunk, offset);
      return chunk.length;
    },
    closeSync() {
      log.closed += 1;
    },
    readdirSync(dir) {
      const entry = dirs[dir];
      if (entry === undefined || entry instanceof Error) throw entry ?? new Error("ENOENT");
      return entry;
    },
  };
  return { fs, log };
}

describe("readPeImports", () => {
  it("reads the import directory", () => {
    expect(readPeImports(readerOf(buildPe(["KERNEL32.dll", "MSVCP140.dll"]))).imports).toEqual(["KERNEL32.dll", "MSVCP140.dll"]);
  });

  it("reads the delay-import directory too, apart from the load-time one", () => {
    expect(readPeImports(readerOf(buildPe(["KERNEL32.dll"], { delay: ["vulkan-1.dll"] })))).toEqual({
      imports: ["KERNEL32.dll"],
      delayImports: ["vulkan-1.dll"],
    });
  });

  it("reads a PE32 image", () => {
    expect(readPeImports(readerOf(buildPe(["KERNEL32.dll"], { pe32: true }))).imports).toEqual(["KERNEL32.dll"]);
  });

  it("reads old-style delay-load names that are virtual addresses", () => {
    const bytes = buildPe([], { delay: ["old.dll"], delayAttributes: 0, imageBase: 0x400000 });
    expect(readPeImports(readerOf(bytes)).delayImports).toEqual(["old.dll"]);
  });

  it("an image without imports has none", () => {
    expect(readPeImports(readerOf(buildPe()))).toEqual({ imports: [], delayImports: [] });
  });

  it.each([
    ["empty", new Uint8Array()],
    ["not a PE", new TextEncoder().encode("hello, this is not an executable at all, no sir".repeat(4))],
  ])("rejects bytes that are %s", (_label, bytes) => {
    expect(() => readPeImports(readerOf(bytes))).toThrow();
  });

  it("every truncation of a real image throws or answers, and never hangs", () => {
    const full = buildPe(["KERNEL32.dll", "MSVCP140.dll"], { delay: ["vulkan-1.dll"] });
    for (let cut = 0; cut < full.length; cut += 7) {
      const bytes = full.subarray(0, cut);
      try {
        const { imports, delayImports } = readPeImports(readerOf(bytes));
        expect(imports.length + delayImports.length).toBeLessThanOrEqual(3);
      } catch {
        /* a refusal is the right answer for a cut image */
      }
    }
  });

  it("a name that points outside the file is skipped, and the others are kept", () => {
    const bytes = buildPe(["first.dll", "BAD.dll", "last.dll"], { badNameIndex: 1 });
    expect(readPeImports(readerOf(bytes)).imports).toEqual(["first.dll", "last.dll"]);
  });

  it("a name longer than the cap is skipped and the others are kept", () => {
    const bytes = readPeImports(readerOf(buildPe(["a".repeat(300) + ".dll", "KERNEL32.dll"])));
    expect(bytes.imports).toEqual(["KERNEL32.dll"]);
  });

  it("caps the descriptors it reads", () => {
    const many = Array.from({ length: MAX_IMPORT_DESCRIPTORS + 50 }, (_, i) => `d${i}.dll`);
    expect(readPeImports(readerOf(buildPe(many))).imports).toHaveLength(MAX_IMPORT_DESCRIPTORS);
  });

  it("stops at the read cap, which it counts", () => {
    const real = readerOf(buildPe(Array.from({ length: 30 }, (_, i) => `d${i}.dll`)));
    let calls = 0;
    const counted = (offset: number, length: number): Uint8Array => {
      calls += 1;
      return real(offset, length);
    };
    expect(() => readPeImports(counted, 10)).toThrow(/too many reads/);
    expect(calls).toBe(10);
    calls = 0;
    expect(readPeImports(counted).imports).toHaveLength(30);
    expect(calls).toBeLessThanOrEqual(MAX_READS);
  });
});

describe("isApiSetName", () => {
  it("knows the contract names, in any case", () => {
    expect(isApiSetName("api-ms-win-crt-runtime-l1-1-0.dll")).toBe(true);
    expect(isApiSetName("EXT-MS-WIN-foo.dll")).toBe(true);
    expect(isApiSetName("vulkan-1.dll")).toBe(false);
  });
});

const NONE = { missing: [], missingDelay: [] };

describe("findMissingDlls", () => {
  const exe = "C:\\app\\resources\\player\\mpv.exe";
  const folder = "C:\\app\\resources\\player";
  const system32 = "C:\\Windows\\System32";
  const imports = ["vulkan-1.dll", "KERNEL32.dll", "MSVCP140.dll", "api-ms-win-crt-runtime-l1-1-0.dll", "AVRT.dll"];

  it("names the imports found neither beside the exe nor in System32, ignoring case and API sets", () => {
    const { fs } = fakeFs(
      { [exe]: buildPe(imports) },
      { [folder]: ["mpv.exe", "msvcp140.DLL"], [system32]: ["kernel32.dll", "avrt.dll", "user32.dll"] },
    );
    expect(findMissingDlls(exe, { fs, systemRoot: "C:\\Windows" })).toEqual({ missing: ["vulkan-1.dll"], missingDelay: [] });
  });

  it("finds nothing missing when the loader ships beside the exe", () => {
    const { fs } = fakeFs(
      { [exe]: buildPe(imports) },
      { [folder]: ["mpv.exe", "msvcp140.dll", "vulkan-1.dll"], [system32]: ["kernel32.dll", "avrt.dll"] },
    );
    expect(findMissingDlls(exe, { fs, systemRoot: "C:\\Windows" })).toEqual(NONE);
  });

  it("lists delay-loaded imports apart, without repeats, up to the limit", () => {
    const { fs } = fakeFs(
      { [exe]: buildPe(["A.dll", "a.dll", "B.dll"], { delay: ["C.dll", "D.dll"] }) },
      { [folder]: [], [system32]: ["kernel32.dll"] },
    );
    expect(findMissingDlls(exe, { fs, systemRoot: "C:\\Windows" })).toEqual({
      missing: ["A.dll", "B.dll"],
      missingDelay: ["C.dll", "D.dll"],
    });
    expect(findMissingDlls(exe, { fs, systemRoot: "C:\\Windows", limit: 1 })).toEqual({
      missing: ["A.dll"],
      missingDelay: ["C.dll"],
    });
  });

  it("reads only a few headers and tables, not the file, and closes it", () => {
    const { fs, log } = fakeFs({ [exe]: buildPe(imports) }, { [folder]: [], [system32]: ["x.dll"] });
    findMissingDlls(exe, { fs, systemRoot: "C:\\Windows" });
    expect(log.closed).toBe(1);
    expect(log.reads.length).toBeLessThan(40);
    expect(Math.max(...log.reads.map(([, length]) => length))).toBeLessThanOrEqual(0x10000);
  });

  it("a DLL both imported and delay-loaded is reported once, as a static import", () => {
    const { fs } = fakeFs(
      { [exe]: buildPe(["vulkan-1.dll"], { delay: ["VULKAN-1.dll"] }) },
      { [folder]: [], [system32]: ["kernel32.dll"] },
    );
    expect(findMissingDlls(exe, { fs, systemRoot: "C:\\Windows" })).toEqual({
      missing: ["vulkan-1.dll"],
      missingDelay: [],
    });
  });

  it("says nothing, and does not throw, when it cannot tell", () => {
    const ok = { [folder]: [], [system32]: ["kernel32.dll"] };
    // No such file.
    expect(findMissingDlls(exe, { fs: fakeFs({}, ok).fs })).toEqual(NONE);
    // Not a PE.
    expect(findMissingDlls(exe, { fs: fakeFs({ [exe]: new Uint8Array(100) }, ok).fs })).toEqual(NONE);
    // A truncated PE.
    expect(findMissingDlls(exe, { fs: fakeFs({ [exe]: buildPe(imports).subarray(0, 0x410) }, ok).fs })).toEqual(NONE);
    // System32 cannot be listed: every name would look missing, so none is named.
    const noSystem = fakeFs({ [exe]: buildPe(imports) }, { [folder]: [], [system32]: new Error("EACCES") });
    expect(findMissingDlls(exe, { fs: noSystem.fs, systemRoot: "C:\\Windows" })).toEqual(NONE);
    const emptySystem = fakeFs({ [exe]: buildPe(imports) }, { [folder]: [], [system32]: [] });
    expect(findMissingDlls(exe, { fs: emptySystem.fs, systemRoot: "C:\\Windows" })).toEqual(NONE);
  });

  it("closes the file even when reading it fails", () => {
    const { fs, log } = fakeFs({ [exe]: buildPe(imports) }, { [folder]: [], [system32]: ["x.dll"] });
    const broken: PeFs = {
      ...fs,
      readSync() {
        throw new Error("EIO");
      },
    };
    expect(findMissingDlls(exe, { fs: broken })).toEqual(NONE);
    expect(log.opened).toBe(1);
    expect(log.closed).toBe(1);
  });
});

import nodeFs from "node:fs";
import path from "node:path";

/**
 * Which DLLs a Windows executable needs that this PC cannot supply (Sentry ELECTRON-C).
 *
 * When the bundled mpv exits 0xC0000135 (STATUS_DLL_NOT_FOUND) the exit code does not say which
 * DLL the loader could not find. This reads the executable's import tables and checks each name the
 * way the loader's first two stops would: the executable's own folder, then System32. The names go on
 * the incident, so the report says "vulkan-1.dll" instead of "a DLL".
 *
 * It is a diagnosis for a failure that has already happened, so it is built never to make things
 * worse: it reads only the headers, the import directory and the delay-import directory, through
 * positional reads of a few hundred bytes (mpv.exe is far too large to read whole); every count and
 * length is capped; a file that is not a well-formed PE is an empty answer, never an exception.
 *
 * It is a best guess, not the loader's full search (the PATH, the application directory's
 * dependencies' own imports, side-by-side manifests are not consulted), which is why a result is
 * called "missing" only in the report's words: "imported, not found in the usual two places".
 */

/** Reads at most `length` bytes at `offset`; fewer (or none) at the end of the file. */
export type ReadAt = (offset: number, length: number) => Uint8Array;

/** The most import descriptors read from either directory. mpv has about 40. */
export const MAX_IMPORT_DESCRIPTORS = 512;
/** The longest DLL name accepted. Windows' own limit is far smaller. */
export const MAX_DLL_NAME_BYTES = 256;
/** The most section headers read. A PE32+ file may have 96. */
const MAX_SECTIONS = 96;
/** How much of the file's start must hold the DOS header, NT headers and section table. */
const MAX_HEADER_BYTES = 0x10000;
/** The most `readAt` calls one parse makes; the work is bounded whatever the file says. */
export const MAX_READS = 4096;

const IMPORT_DIRECTORY = 1;
const DELAY_IMPORT_DIRECTORY = 13;

class PeReadError extends Error {}

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new PeReadError("short read");
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new PeReadError("short read");
  return (
    (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
  );
}

interface Section {
  rva: number;
  size: number;
  rawPointer: number;
}

/** The DLL names an image imports, apart: at load time, and through delay-load (needed only on first use). */
export interface PeImports {
  imports: string[];
  delayImports: string[];
}

/**
 * The DLL names a PE32 or PE32+ image imports at load time and through delay-load, in file order.
 * Throws on anything malformed; `findMissingDlls` is the entry that never does.
 */
export function readPeImports(readAt: ReadAt, maxReads: number = MAX_READS): PeImports {
  let reads = 0;
  const read = (offset: number, length: number): Uint8Array => {
    reads += 1;
    if (reads > maxReads) throw new PeReadError("too many reads");
    return readAt(offset, length);
  };

  const head = read(0, MAX_HEADER_BYTES);
  if (head.length < 0x40 || head[0] !== 0x4d || head[1] !== 0x5a) throw new PeReadError("no MZ header");
  const peOffset = u32(head, 0x3c);
  if (
    peOffset + 4 > head.length ||
    head[peOffset] !== 0x50 ||
    head[peOffset + 1] !== 0x45 ||
    head[peOffset + 2] !== 0 ||
    head[peOffset + 3] !== 0
  ) {
    throw new PeReadError("no PE signature");
  }
  const coff = peOffset + 4;
  const sectionCount = u16(head, coff + 2);
  const optionalSize = u16(head, coff + 16);
  const optional = coff + 20;
  const magic = u16(head, optional);
  let directories: number;
  let imageBase: number;
  if (magic === 0x20b) {
    directories = optional + 112;
    imageBase = u32(head, optional + 24); // The low half: enough for the old VA-style names.
  } else if (magic === 0x10b) {
    directories = optional + 96;
    imageBase = u32(head, optional + 28);
  } else {
    throw new PeReadError("unknown optional header");
  }
  const directoryCount = u32(head, directories - 4);
  if (sectionCount > MAX_SECTIONS) throw new PeReadError("too many sections");

  const sections: Section[] = [];
  const sectionTable = optional + optionalSize;
  for (let i = 0; i < sectionCount; i += 1) {
    const at = sectionTable + 40 * i;
    const virtualSize = u32(head, at + 8);
    const rawSize = u32(head, at + 16);
    sections.push({ rva: u32(head, at + 12), size: Math.max(virtualSize, rawSize), rawPointer: u32(head, at + 20) });
  }

  const toOffset = (rva: number): number => {
    for (const section of sections) {
      if (rva >= section.rva && rva < section.rva + section.size) return section.rawPointer + (rva - section.rva);
    }
    throw new PeReadError("RVA outside every section");
  };

  const cString = (rva: number): string | null => {
    const bytes = read(toOffset(rva), MAX_DLL_NAME_BYTES + 1);
    const end = bytes.indexOf(0);
    if (end <= 0 || end > MAX_DLL_NAME_BYTES) return null; // empty, unterminated or too long: skip it
    let name = "";
    for (let i = 0; i < end; i += 1) name += String.fromCharCode(bytes[i]!);
    return name;
  };

  const directoryRva = (index: number): number => (index < directoryCount ? u32(head, directories + 8 * index) : 0);

  const walk = (
    names: string[],
    index: number,
    recordSize: number,
    nameOf: (record: Uint8Array) => number | null,
  ): void => {
    const rva = directoryRva(index);
    if (rva === 0) return;
    const start = toOffset(rva);
    for (let i = 0; i < MAX_IMPORT_DESCRIPTORS; i += 1) {
      const record = read(start + i * recordSize, recordSize);
      if (record.length < recordSize || record.every((byte) => byte === 0)) return;
      const nameRva = nameOf(record);
      if (nameRva === null || nameRva === 0) continue;
      try {
        const name = cString(nameRva);
        if (name !== null) names.push(name);
      } catch (error) {
        // One bad name (outside the file, say) is not a reason to lose the others.
        if (!(error instanceof PeReadError)) throw error;
      }
    }
  };

  const imports: string[] = [];
  const delayImports: string[] = [];
  walk(imports, IMPORT_DIRECTORY, 20, (record) => u32(record, 12));
  walk(delayImports, DELAY_IMPORT_DIRECTORY, 32, (record) => {
    const attributes = u32(record, 0);
    const name = u32(record, 4);
    // Bit 0 set: an RVA. Clear: a virtual address, from the very old images.
    if (attributes & 1) return name;
    return name >= imageBase ? name - imageBase : null;
  });
  return { imports, delayImports };
}

/** The slice of `node:fs` this module uses; a test passes a fake. */
export interface PeFs {
  openSync(path: string, flags: string): number;
  readSync(fd: number, buffer: Uint8Array, offset: number, length: number, position: number): number;
  closeSync(fd: number): void;
  readdirSync(path: string): string[];
}

/** A `ReadAt` over one open file; the caller closes the descriptor. */
export function readAtFd(fs: PeFs, fd: number): ReadAt {
  return (offset, length) => {
    const buffer = new Uint8Array(length);
    const count = fs.readSync(fd, buffer, 0, length, offset);
    return buffer.subarray(0, Math.max(0, count));
  };
}

/** Whether Windows supplies `name` itself: the API-set contracts have no file to look for. */
export function isApiSetName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("api-ms-win-") || lower.startsWith("ext-ms-win-");
}

/** Lower-cased file names in `dir`, or null when it cannot be listed. */
function listLower(fs: PeFs, dir: string): Set<string> | null {
  try {
    return new Set(fs.readdirSync(dir).map((name) => name.toLowerCase()));
  } catch {
    return null;
  }
}

/** What `findMissingDlls` found: static imports apart from delay-loaded ones. */
export interface MissingDlls {
  /** Needed at load time: the process cannot start without them. */
  missing: string[];
  /** Delay-loaded, and not also a static import: needed only when first used. */
  missingDelay: string[];
}

export interface FindMissingDllsOptions {
  fs?: PeFs;
  /** `%SystemRoot%`; the default is the environment's, then `C:\Windows`. */
  systemRoot?: string;
  /** The most names returned. */
  limit?: number;
}

/**
 * The DLLs `exePath` imports that are in neither its own folder nor System32 (API sets count as
 * present), in the order the file lists them, without repeats, apart for static and delay-loaded
 * imports. Empty when it cannot tell: the file will not open, is not a PE, or nothing is missing.
 * Never throws.
 */
export function findMissingDlls(exePath: string, options: FindMissingDllsOptions = {}): MissingDlls {
  const fs: PeFs = options.fs ?? nodeFs;
  const limit = options.limit ?? 16;
  const none: MissingDlls = { missing: [], missingDelay: [] };
  let fd: number | null = null;
  try {
    fd = fs.openSync(exePath, "r");
    const { imports, delayImports } = readPeImports(readAtFd(fs, fd));
    const systemRoot = options.systemRoot ?? process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
    const dir = exePath.includes("\\") ? path.win32.dirname(exePath) : path.posix.dirname(exePath);
    const here = listLower(fs, dir);
    const system = listLower(fs, path.win32.join(systemRoot, "System32"));
    // Without both listings every name would look missing: say nothing rather than guess.
    if (here === null || system === null || system.size === 0) return none;
    const seen = new Set<string>();
    const absent = (names: readonly string[]): string[] => {
      const out: string[] = [];
      for (const name of names) {
        const lower = name.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        if (isApiSetName(name) || here.has(lower) || system.has(lower)) continue;
        if (out.length < limit) out.push(name);
      }
      return out;
    };
    return { missing: absent(imports), missingDelay: absent(delayImports) };
  } catch {
    return none;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* nothing to do about it */
      }
    }
  }
}

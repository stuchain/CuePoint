import fsDefault from "node:fs";
import path from "node:path";

/**
 * The main process's own log file (`main.log`), written beside the engine's logs so the Log
 * viewer's "Open logs folder" and the support bundle's `*.log*` glob carry it with no other
 * change. A line holds an area, a sentence and short plain fields: never a path, a query, an
 * id or a token. Logging never throws and never makes a caller wait.
 */

export interface MainLog {
  info(area: string, message: string, fields?: Record<string, string>): void;
  warn(area: string, message: string, fields?: Record<string, string>): void;
  /** Resolves once everything queued so far has been written (or has failed quietly). */
  flush(): Promise<void>;
}

export interface MainLogFs {
  mkdir(dir: string, options: { recursive: true }): Promise<unknown>;
  appendFile(file: string, data: string): Promise<void>;
  stat(file: string): Promise<{ size: number }>;
  rename(from: string, to: string): Promise<void>;
  rm(file: string, options: { force: true }): Promise<void>;
}

export interface MainLogOptions {
  /** The engine's logs folder; may be slow or fail while the engine starts. */
  resolveDir: () => Promise<string>;
  /** Where lines go when the engine's folder never becomes known. */
  fallbackDir: string;
  resolveTimeoutMs?: number;
  fileName?: string;
  maxBytes?: number;
  /** How many files to keep: `main.log`, `main.1.log`, ... */
  keep?: number;
  now?: () => Date;
  fs?: MainLogFs;
}

const MAX_BUFFERED = 200;
const MAX_LINE = 300;
const AREA = /^[a-z-]{1,20}$/;
const FIELD_VALUE = /^[\w:.\- /|=+%()]{0,120}$/;
const FALLBACK_NOTE = "engine logs folder unknown, writing here";

const realFs: MainLogFs = {
  mkdir: (dir, options) => fsDefault.promises.mkdir(dir, options),
  appendFile: (file, data) => fsDefault.promises.appendFile(file, data),
  stat: (file) => fsDefault.promises.stat(file),
  rename: (from, to) => fsDefault.promises.rename(from, to),
  rm: (file, options) => fsDefault.promises.rm(file, options),
};

/** ASCII only: anything else is a `?`, so a stray name cannot ride in on a sentence. */
function ascii(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, "?");
}

export function createMainLog(options: MainLogOptions): MainLog {
  const fs = options.fs ?? realFs;
  // A packaged cold start can take ten seconds or more before the engine answers; and if it
  // answers later still, the log moves there (below), so the bundle carries what follows.
  const timeoutMs = options.resolveTimeoutMs ?? 30_000;
  const fileName = options.fileName ?? "main.log";
  const maxBytes = options.maxBytes ?? 1_048_576;
  const keep = Math.max(1, options.keep ?? 3);
  const now = options.now ?? ((): Date => new Date());
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  const rotated = (n: number): string => `${stem}.${n}${ext}`;

  let dir: string | null = null;
  let buffer: string[] = [];
  let queue: Promise<void> = Promise.resolve();
  let madeDir = false;

  function format(level: "INFO" | "WARN", area: string, message: string, fields?: Record<string, string>): string {
    const safeArea = AREA.test(area) ? area : "?";
    let line = `${now().toISOString()}  ${level}  [${safeArea}] ${ascii(message)}`;
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        const safeKey = /^[\w-]{1,30}$/.test(key) ? key : "?";
        line += ` ${safeKey}=${typeof value === "string" && FIELD_VALUE.test(value) ? value.replace(/ /g, "_") : "?"}`;
      }
    }
    return `${line.slice(0, MAX_LINE)}\n`;
  }

  async function write(folder: string, text: string): Promise<void> {
    try {
      if (!madeDir) {
        await fs.mkdir(folder, { recursive: true });
        madeDir = true;
      }
      const file = path.join(folder, fileName);
      let size = 0;
      try {
        size = (await fs.stat(file)).size;
      } catch {
        // No file yet.
      }
      if (size > 0 && size + Buffer.byteLength(text) > maxBytes) {
        // The current file is moved aside first: on Windows it can be held open for a moment
        // (the support bundle zipping it), and then nothing older is touched and the line is
        // still appended to it.
        const aside = path.join(folder, `${fileName}.rotating`);
        let moved = false;
        try {
          await fs.rename(file, aside);
          moved = true;
        } catch {
          // Held open: try again at the next line.
        }
        if (moved) {
          try {
            await fs.rm(path.join(folder, rotated(keep - 1)), { force: true });
            for (let n = keep - 2; n >= 1; n--) {
              try {
                await fs.rename(path.join(folder, rotated(n)), path.join(folder, rotated(n + 1)));
              } catch {
                // That generation does not exist yet.
              }
            }
            if (keep > 1) await fs.rename(aside, path.join(folder, rotated(1)));
            else await fs.rm(aside, { force: true });
          } catch {
            // An older generation is lost at worst; the new line still goes in.
          }
        }
      }
      await fs.appendFile(file, text);
    } catch {
      // A log that cannot be written is not worth a failure.
    }
  }

  function enqueue(folder: string, text: string): void {
    queue = queue.then(() => write(folder, text)).catch(() => undefined);
  }

  function settleDir(folder: string, fellBack: boolean): void {
    if (dir !== null) return;
    dir = folder;
    const lines = buffer;
    buffer = [];
    if (fellBack) lines.unshift(format("WARN", "log", FALLBACK_NOTE));
    // One write each, so a long backlog still rotates at the limit.
    for (const line of lines) enqueue(folder, line);
  }

  // Resolve once, with a limit: the engine may not be up, or may never be.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const resolved = new Promise<void>((done) => {
    timer = setTimeout(() => {
      settleDir(options.fallbackDir, true);
      done();
    }, timeoutMs);
    // Not worth keeping the app alive for.
    (timer as { unref?: () => void }).unref?.();
    let pending: Promise<string>;
    try {
      pending = options.resolveDir();
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (folder) => {
        if (timer !== null) clearTimeout(timer);
        if (dir === options.fallbackDir && typeof folder === "string" && folder !== "" && folder !== dir) {
          // The engine answered after the wait: from here on, write where the bundle looks.
          dir = folder;
          madeDir = false;
          enqueue(folder, format("INFO", "log", "engine logs folder known late, earlier lines are in the app logs folder"));
          return;
        }
        settleDir(typeof folder === "string" && folder !== "" ? folder : options.fallbackDir, !(typeof folder === "string" && folder !== ""));
        done();
      },
      () => {
        if (timer !== null) clearTimeout(timer);
        settleDir(options.fallbackDir, true);
        done();
      },
    );
  });

  function add(level: "INFO" | "WARN", area: string, message: string, fields?: Record<string, string>): void {
    try {
      const line = format(level, area, message, fields);
      if (dir !== null) {
        enqueue(dir, line);
        return;
      }
      buffer.push(line);
      if (buffer.length > MAX_BUFFERED) buffer.shift();
    } catch {
      // Never throws.
    }
  }

  return {
    info: (area, message, fields) => add("INFO", area, message, fields),
    warn: (area, message, fields) => add("WARN", area, message, fields),
    async flush(): Promise<void> {
      try {
        await resolved;
        await queue;
      } catch {
        // Nothing to report.
      }
    },
  };
}

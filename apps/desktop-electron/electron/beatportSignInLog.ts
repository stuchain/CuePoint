/**
 * The Beatport sign-in log (C20): `beatport-signin.log`, one line per event, so a sign-in that
 * never finishes on someone's PC can say which step it stopped at.
 *
 * It holds scopes, HTTP statuses, hosts and paths, and never a token (nor a hash or part of
 * one), a header, a cookie, a query string, an email, a username or a user id. That is enforced
 * here, not left to the callers: only allow-listed keys are written, and a value that does not
 * look like plain words becomes `?`. Always on, because it holds nothing secret.
 *
 * It sits next to `cuepoint.log` (the engine says where) so Help, Get help, Details for support,
 * Log viewer, Open logs folder shows it and the diagnostics bundle picks it up. A write that fails is dropped: the
 * log never breaks a sign-in.
 */
import * as nodeFs from "node:fs/promises";
import * as path from "node:path";

export const SIGNIN_LOG_FILE = "beatport-signin.log";
const ROTATED_FILE = "beatport-signin.1.log";
const ROTATING_FILE = "beatport-signin.rotating.log";
/** The log is rotated once, to `beatport-signin.1.log`, when it would pass this size. */
export const SIGNIN_LOG_MAX_BYTES = 256 * 1024;
/** Lines kept while the engine has not yet said where the logs go. */
const MAX_BUFFERED_LINES = 200;
/**
 * How long to wait for the engine's logs folder before using Electron's own. A cold packaged
 * engine can take ~10 s, and the renderer can reach the sign-in early, so the wait is generous.
 */
const FOLDER_WAIT_MS = 30_000;
/** While the engine is not answering, ask again this often until the wait is over. */
const FOLDER_RETRY_MS = 1_000;
/** After a fallback, keep asking this often, at most `LATE_ASKS` times, to move to the engine's folder. */
const LATE_RETRY_MS = 5_000;
const LATE_ASKS = 24;
/** A path keeps its first segments only. */
const MAX_PATH_SEGMENTS = 3;
const MAX_LINE_LENGTH = 200;

/** The keys a line may carry. Anything else is dropped. */
const ALLOWED_KEYS = new Set([
  "app", "platform", "arch", "electron", "endpoints", "fallback", "mode", "host", "path", "code", "by", "n", "jwt",
  "len", "status", "type", "keys", "token", "scope", "anon", "expires", "introspect", "active", "username", "user_id",
  "exp", "verdict", "reason", "next_s", "via", "expires_in_s", "store", "engine", "outcome", "backoff_s", "why",
  "kind", "source", "state", "attempts", "window", "token_scope", "introspect_scope",
]);

/** Keys that only say whether something is there; their value is one of these words. */
const FLAG_KEYS = new Set(["jwt", "token", "anon", "active", "username", "user_id", "exp", "expires", "introspect"]);
const FLAG_VALUE = /^(yes|no|true|false|missing|null|number)$/;
/** Any other value: plain words, digits and a few separators, at most 80 characters. */
const PLAIN_VALUE = /^[\w:.\- /|=+*]{0,80}$/;
/** Even a plain-looking value is refused when it looks like a token, a header or a query. */
const SECRET_SHAPE = /eyJ|Bearer|code=|state=|access_?token/i;

export type SignInLogValue = string | number | boolean | null | undefined;
export type SignInLogFields = Record<string, SignInLogValue>;
/** What `BeatportAuth` and the sign-in window host are given to log with. */
export type SignInLogFn = (event: string, fields?: SignInLogFields) => void;

/** The parts of `fs/promises` the log uses, so a test can run it in memory. */
export interface SignInLogFs {
  mkdir(dir: string, options: { recursive: true }): Promise<unknown>;
  appendFile(file: string, text: string): Promise<void>;
  stat(file: string): Promise<{ size: number }>;
  rename(from: string, to: string): Promise<void>;
  rm(file: string, options?: { force: true }): Promise<void>;
}

export interface BeatportSignInLogOptions {
  /** The engine's logs folder (`engine.getLogsDir()`), asked for on first use. */
  getLogsDir: () => Promise<string | null | undefined>;
  /** Used when the engine does not answer in time (or cannot): Electron's own logs folder. */
  fallbackDir: () => string;
  fs?: SignInLogFs;
  now?: () => number;
  maxBytes?: number;
  folderWaitMs?: number;
}

/**
 * A path with ids kept out: a segment that is all digits, or a long mix of letters and digits
 * (an id, a token), becomes `*`; only the first three segments are kept, with `/*` after them
 * when the path was longer.
 */
function safePath(pathname: string): string {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  const kept = segments.slice(0, MAX_PATH_SEGMENTS).map((segment) => {
    const looksLikeId = /^\d+$/.test(segment) || (segment.length > 24 && /[a-z]/i.test(segment) && /\d/.test(segment));
    return looksLikeId ? "*" : segment;
  });
  return `/${kept.join("/")}${segments.length > MAX_PATH_SEGMENTS ? "/*" : ""}`;
}

/** A URL as `{ host, path }` with no query and no hash (the OAuth `code` and `state` live there). */
export function hostAndPath(url: string | null | undefined): { host: string; path: string } {
  if (typeof url !== "string") return { host: "?", path: "?" };
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: safePath(parsed.pathname) };
  } catch {
    return { host: "?", path: "?" };
  }
}

/** The key names of an object, as `a|b|c` kept short; `none` when it is not an object or empty. */
function keyNames(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "none";
  let out = "";
  for (const key of Object.keys(value)) {
    const next = out === "" ? key : `${out}|${key}`;
    if (next.length > 70) break;
    out = next;
  }
  return out === "" ? "none" : out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function scopeOf(value: unknown): string | undefined {
  return isObject(value) && typeof value.scope === "string" ? value.scope : undefined;
}

/** What to log about the website's session JSON: key names, scopes and yes/no, never a value. */
export function sessionFields(json: unknown): SignInLogFields {
  const top = isObject(json) ? json : null;
  const token = top && isObject(top.token) ? top.token : null;
  const anon = token?.anon;
  return {
    keys: keyNames(top),
    token: token !== null && typeof token.accessToken === "string" && token.accessToken !== "" ? "yes" : "no",
    token_scope: scopeOf(token),
    anon: typeof anon === "boolean" ? String(anon) : "missing",
    expires: token !== null && token.accessTokenExpires !== undefined && token.accessTokenExpires !== null ? "yes" : "no",
    introspect_scope: scopeOf(top?.introspect),
  };
}

/** What to log about an introspection answer: key names, `active`, the scope and yes/no for the rest. */
export function introspectFields(body: unknown): SignInLogFields {
  if (!isObject(body)) return { keys: "none" };
  const named = (value: unknown): string => (value === undefined || value === null || value === "" ? "no" : "yes");
  const exp = body.exp;
  return {
    keys: keyNames(body),
    active: typeof body.active === "boolean" ? String(body.active) : "missing",
    scope: scopeOf(body),
    username: named(body.username),
    user_id: named(body.user_id),
    exp: typeof exp === "number" ? "number" : exp === null ? "null" : "missing",
  };
}

function cleanEvent(event: string): string {
  return /^[a-z][a-z0-9 #-]{0,30}$/i.test(event) ? event : "event";
}

function cleanValue(key: string, value: Exclude<SignInLogValue, undefined | null>): string {
  const text = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  if (FLAG_KEYS.has(key)) return FLAG_VALUE.test(text) ? text : "?";
  return PLAIN_VALUE.test(text) && !SECRET_SHAPE.test(text) ? text : "?";
}

export class BeatportSignInLog {
  private readonly fs: SignInLogFs;
  private readonly now: () => number;
  private readonly maxBytes: number;
  private dir: string | null = null;
  private asked = false;
  private buffer: string[] = [];
  private chain: Promise<void> = Promise.resolve();
  private size: number | null = null;
  /** The folder in use is Electron's, not the engine's. */
  private onFallback = false;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private askTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly options: BeatportSignInLogOptions) {
    this.fs = options.fs ?? (nodeFs as unknown as SignInLogFs);
    this.now = options.now ?? Date.now;
    this.maxBytes = options.maxBytes ?? SIGNIN_LOG_MAX_BYTES;
  }

  /** Add a line. Never throws, and never waits for the disk. */
  log(event: string, fields: SignInLogFields = {}): void {
    try {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(fields)) {
        if (!ALLOWED_KEYS.has(key) || value === undefined || value === null) continue;
        parts.push(`${key}=${cleanValue(key, value)}`);
      }
      const stamp = new Date(this.now()).toISOString();
      const line = `${stamp}  ${cleanEvent(event)}  ${parts.join(" ")}`.trimEnd().slice(0, MAX_LINE_LENGTH);
      // Plain ASCII only: anything else would be a name or a path we did not mean to write.
      this.push(line.replace(/[^\x20-\x7e]/g, "?"));
    } catch {
      // The log never breaks a sign-in.
    }
  }

  /** Resolves once every line given so far has been written (or dropped). For tests and quitting. */
  flush(): Promise<void> {
    return this.chain;
  }

  private push(line: string): void {
    if (this.dir !== null) {
      this.write([line]);
      return;
    }
    this.buffer.push(line);
    if (this.buffer.length > MAX_BUFFERED_LINES) this.buffer.splice(0, this.buffer.length - MAX_BUFFERED_LINES);
    this.askForFolder();
  }

  /**
   * Ask the engine where the logs go, and keep the lines until it answers. If it is still silent
   * after the wait, use Electron's folder; then keep asking (every few seconds, a bounded number
   * of times) so later lines can go to the engine's folder after all.
   */
  private askForFolder(): void {
    if (this.asked) return;
    this.asked = true;
    this.waitTimer = setTimeout(() => {
      this.waitTimer = null;
      if (this.dir !== null || this.closed) return;
      this.onFallback = true;
      this.useFolder(this.options.fallbackDir(), true);
    }, this.options.folderWaitMs ?? FOLDER_WAIT_MS);
    (this.waitTimer as { unref?: () => void }).unref?.();
    this.ask(0);
  }

  private ask(lateAsks: number): void {
    if (this.closed) return;
    const answered = (dir: string | null | undefined): void => {
      if (this.closed) return;
      if (typeof dir === "string" && dir !== "") {
        this.engineAnswered(dir);
        return;
      }
      // The engine may still be starting: ask again.
      let next = lateAsks;
      let delay = FOLDER_RETRY_MS;
      if (this.dir !== null) {
        if (lateAsks >= LATE_ASKS) return;
        next = lateAsks + 1;
        delay = LATE_RETRY_MS;
      }
      this.askTimer = setTimeout(() => this.ask(next), delay);
      (this.askTimer as { unref?: () => void }).unref?.();
    };
    try {
      this.options.getLogsDir().then(answered, () => answered(null));
    } catch {
      answered(null);
    }
  }

  private engineAnswered(dir: string): void {
    if (this.dir === null) {
      if (this.waitTimer) clearTimeout(this.waitTimer);
      this.waitTimer = null;
      this.useFolder(dir, false);
    } else if (this.onFallback && dir !== this.dir) {
      // A late answer: from now on the engine's folder, with a note of where the earlier lines are.
      this.onFallback = false;
      this.dir = dir;
      this.size = null;
      this.write([`${new Date(this.now()).toISOString()}  logs-folder  fallback=earlier`]);
    }
  }

  /** Stop asking and write what is still buffered to Electron's folder. For quitting. */
  close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      if (this.waitTimer) clearTimeout(this.waitTimer);
      if (this.askTimer) clearTimeout(this.askTimer);
      this.waitTimer = this.askTimer = null;
      if (this.dir === null && this.buffer.length > 0) {
        try {
          this.onFallback = true;
          this.useFolder(this.options.fallbackDir(), true);
        } catch {
          // Best effort.
        }
      }
    }
    return this.chain;
  }

  private useFolder(dir: string, fallback: boolean): void {
    if (this.dir !== null) return;
    this.dir = dir;
    const pending = this.buffer;
    this.buffer = [];
    if (fallback) {
      pending.unshift(`${new Date(this.now()).toISOString()}  logs-folder  fallback=yes`);
    }
    this.write(pending);
  }

  /** One queue, so lines stay in order; a failure drops that batch and the queue carries on. */
  private write(lines: string[]): void {
    const dir = this.dir;
    if (dir === null || lines.length === 0) return;
    this.chain = this.chain.then(() => this.append(dir, lines)).catch(() => undefined);
  }

  /**
   * Rotate once: the live log becomes beatport-signin.1.log (Windows will not rename over a file).
   * The live file moves aside first, so a failed move loses nothing: the old .1 is still there and
   * the live file keeps growing. Only then is the old .1 removed.
   */
  private async rotate(dir: string, file: string): Promise<void> {
    const rotated = path.join(dir, ROTATED_FILE);
    const aside = path.join(dir, ROTATING_FILE);
    try {
      await this.fs.rm(aside, { force: true });
      await this.fs.rename(file, aside);
    } catch {
      return;
    }
    try {
      await this.fs.rm(rotated, { force: true });
      await this.fs.rename(aside, rotated);
    } catch {
      // The rotated log stays under its temporary name; the next rotation clears it.
    }
  }

  private async append(dir: string, lines: string[]): Promise<void> {
    const file = path.join(dir, SIGNIN_LOG_FILE);
    await this.fs.mkdir(dir, { recursive: true });
    if (this.size === null) {
      try {
        this.size = (await this.fs.stat(file)).size;
      } catch {
        this.size = 0;
      }
    }
    for (const line of lines) {
      const text = `${line}\n`;
      const bytes = Buffer.byteLength(text);
      if (this.size > 0 && this.size + bytes > this.maxBytes) {
        await this.rotate(dir, file);
        // Rotated or not, count from zero: a rotation that fails is tried again only after another
        // full file's worth of lines, and the batch is never dropped for it.
        this.size = 0;
      }
      await this.fs.appendFile(file, text);
      this.size += bytes;
    }
  }
}

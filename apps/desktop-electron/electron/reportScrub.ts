/**
 * Scrub a report of everything personal before it leaves the machine (REPORT-02, DEC-127).
 *
 * Pure functions over plain event objects shaped like Sentry events; no SDK is imported and
 * nothing here sends anything. `src/cuepoint/reporting/scrub.py` is the same rule in Python;
 * both are held to `src/tests/fixtures/reporting/scrub_corpus.json` and must give the same
 * output on every entry. Change one, change the other, and add the example to the corpus.
 *
 * The home folder is replaced first (rule 2, even with spaces in it, either separator, any case for
 * Windows-style homes) and paths continue from `<home>`. Rules below are numbered after that: 3 quotes,
 * 4 paths, 5 the user's name, 6 URLs. A path may start after `:` or `>`, may carry a `:line:col` suffix
 * that is kept, and an API route keeps its path but loses its query values.
 *
 * Text rules, in this order (`scrubText`):
 *
 * 1. Tokens: literals in `ctx.tokens`, `Bearer x`, `token=x` style pairs, JWTs (`eyJ...` with
 *    three dot-separated parts), and runs of 32 or more hex characters or of 32 or more base64
 *    characters with at least one digit (so a long word or a slug is not hit). The key stays and
 *    the value becomes `<token>`: `Bearer <token>`, `token=<token>`.
 * 2. Quoted values: text inside '...', "...", curly double quotes and curly single quotes becomes
 *    `<value>` and the quotes stay. When the inside is a path, rule 3 shapes it instead. An
 *    apostrophe inside a word (don't) is not a quote: an opening quote is not preceded by a letter
 *    or digit and a closing one is not followed by one. A quote does not span lines.
 * 3. Paths keep their shape: `C:\Users\anna\Music\a.flac` becomes `<home>\<dir>\<dir>\<file>.flac`.
 *    Windows drive paths, UNC paths, POSIX paths with two or more segments, `~/...`, `file://`
 *    URLs and percent-encoded forms are recognised. Under the home folder the path starts with
 *    `<home>`; elsewhere it keeps its drive, its leading `/` or its UNC prefix
 *    (`\\<host>\<share>`). Under an app root it starts with `<app>` and keeps its real segments.
 *    The final extension stays when it is 1 to 5 letters or digits. A `file://` prefix stays. API
 *    routes (`/api/v1/...`) are not files and are left alone.
 *    **An unquoted path ends at whitespace**, so a path with spaces is only safe when quoted (or
 *    when it is a whole field value, as `abs_path` and `transaction` are).
 * 4. The home folder anywhere else, and the user's name as a whole word (case-insensitive).
 * 5. http and https URLs: scheme, host and first path segment stay, later non-numeric segments and
 *    every query value become `<value>`. Loopback URLs keep the whole path. User info and the
 *    fragment are removed.
 *
 * Event rules (`scrubEvent`) are described on that function. Both functions return new objects and
 * never touch their input.
 */

export interface ScrubContext {
  home: string | null;
  userName: string | null;
  /** Install and resources folders whose paths keep their names. */
  appRoots: string[];
  /** Literal secrets, such as the engine's session token. */
  tokens: string[];
}

type Json = Record<string, unknown>;

/** Attachments the reporter adds on purpose (REPORT-05); every other attachment is dropped. */
export const OUTPUT_TAIL_ATTACHMENTS = ["engine-output.txt", "player-output.txt"] as const;

/**
 * A key in `extra`, a non-standard context or breadcrumb `data` whose lower-cased form, with `_`
 * and `-` removed, ends with one of these has its value replaced. Plurals are included so `notes`
 * and `playlists` are covered as well as `note` and `playlist`.
 */
export const KEY_SUFFIXES = [
  "title", "artist", "label", "album", "remixer", "playlist", "name", "note", "tag", "tags",
  "comment", "query", "search", "path", "file", "location", "token", "password", "secret",
  "titles", "artists", "labels", "albums", "remixers", "playlists", "names", "notes", "comments",
  "queries", "searches", "paths", "files", "locations", "tokens", "passwords", "secrets",
] as const;

/** Contexts the SDKs fill in themselves. They are kept as they are, except a device name. */
export const STANDARD_CONTEXTS = [
  "os", "runtime", "app", "device", "browser", "trace", "culture", "gpu", "chrome", "node",
  "electron",
] as const;

const DROPPED_EVENT_KEYS = new Set(["server_name", "user", "request"]);
const DROPPED_BREADCRUMB_CATEGORIES = new Set(["ui.click", "ui.input", "console"]);
const DEVICE_NAME_KEYS = new Set(["device_name", "hostname"]);
/** Top-level keys that describe the SDK, the build or the event itself and are kept untouched. */
const KEPT_EVENT_KEYS = new Set([
  "event_id", "timestamp", "level", "platform", "release", "dist", "environment", "sdk",
  "modules", "fingerprint", "type", "debug_meta",
]);
const FRAME_KEYS = [
  "filename", "module", "function", "lineno", "colno", "in_app", "context_line", "pre_context",
  "post_context",
] as const;

const VALUE = "<value>";
const TOKEN = "<token>";

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

// Character classes shared by every pattern. Whitespace is an explicit set, the same in the Python
// scrubber, so the two never disagree about where an unquoted path ends.

const WS = " \\t\\n\\r\\f\\v\\u00a0\\u2028\\u2029";
const S = `[${WS}]`;
const NS = `[^${WS}]`;

// Rule 1: tokens

const BEARER = new RegExp(String.raw`(?<![A-Za-z0-9])(Bearer${S}+)[A-Za-z0-9._~+/=-]+`, "giu");
const AUTH_SCHEME = new RegExp(
  String.raw`(?<![A-Za-z0-9])(Authorization${S}*:${S}*(?:Basic|Digest|Negotiate)${S}+)${NS}+`,
  "giu",
);
const COOKIE = new RegExp(String.raw`(?<![A-Za-z0-9-])((?:Set-)?Cookie${S}*:[ \t]*)[^\r\n]+`, "giu");
const KEY_VALUE = new RegExp(
  String.raw`(?<![A-Za-z0-9])((?:access[_-]?token|refresh[_-]?token|api[_-]?key|token|password|secret|credentials?)${S}*[=:]${S}*)(['"]?)([^&${WS}'"]+)`,
  "giu",
);
const JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/gu;
const HEX_RUN = /(?<![A-Za-z0-9])[0-9A-Fa-f]{32,}(?![A-Za-z0-9])/gu;
const BASE64_RUN = /(?<![A-Za-z0-9+])(?=[A-Za-z+]*[0-9])[A-Za-z0-9+]{32,}(?![A-Za-z0-9+])/gu;
const MIN_TOKEN_LITERAL = 4;

function scrubTokens(input: string, ctx: ScrubContext): string {
  let text = input;
  const literals = [...new Set(ctx.tokens.filter((t) => t.length >= MIN_TOKEN_LITERAL))].sort(
    (a, b) => b.length - a.length,
  );
  for (const literal of literals) text = text.split(literal).join(TOKEN);
  text = text.replace(BEARER, (_m, key: string) => key + TOKEN);
  text = text.replace(AUTH_SCHEME, (_m, key: string) => key + TOKEN);
  text = text.replace(COOKIE, (_m, key: string) => key + TOKEN);
  text = text.replace(KEY_VALUE, (_m, key: string, quote: string) => key + quote + TOKEN);
  text = text.replace(JWT, TOKEN);
  text = text.replace(HEX_RUN, TOKEN);
  return text.replace(BASE64_RUN, TOKEN);
}

// The home folder, replaced before anything else reads the text

const homePatterns = new Map<string, RegExp | null>();

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function caseInsensitive(char: string): string {
  return /^[A-Za-z]$/u.test(char) ? `[${char.toLowerCase()}${char.toUpperCase()}]` : escapeRegExp(char);
}

/** The home folder as a pattern: either separator, case-insensitive for Windows-style homes. */
function homePattern(home: string): RegExp | null {
  const known = homePatterns.get(home);
  if (known !== undefined) return known;
  const bare = home.replace(/[\\/]+$/u, "");
  let pattern: RegExp | null = null;
  if (Array.from(bare).length >= 3) {
    const windows = isWindowsStyle(bare);
    const pieces = bare
      .split(/[\\/]+/u)
      .map((part) => Array.from(part).map((c) => (windows ? caseInsensitive(c) : escapeRegExp(c))).join(""));
    const lead = pieces[0] === "" ? String.raw`[\\/]` : "";
    pattern = new RegExp(
      lead + pieces.filter((p) => p !== "").join(String.raw`[\\/]+`) + "(?![A-Za-z0-9_])",
      "gu",
    );
  }
  homePatterns.set(home, pattern);
  return pattern;
}

/** Rule 2: the home folder wherever it appears, even with spaces in it. Paths continue from it. */
function replaceHome(text: string, ctx: ScrubContext): string {
  const pattern = ctx.home ? homePattern(ctx.home) : null;
  return pattern ? text.replace(pattern, "<home>") : text;
}

// Rule 4: paths

const SEPARATOR = /([\\/])/u;
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/u;
const UNC = /^(\\\\|\/\/)([^\\/]+)([\\/])([^\\/]+)/u;
const ROUTE = /^\/api\/v[0-9]+(?:\/|$)/u;
const PATH_START =
  /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+\\[^\\/]+|\/\/[^/]+\/[^/]+|~[\\/]|[Ff][Ii][Ll][Ee]:\/\/|<home>[\\/]|\/[^/]+\/[^/]+)/u;
const EXTENSION = /^[A-Za-z0-9]{1,5}$/u;
const LINE_COL = /(?::[0-9]+){1,2}$/u;
const PERCENT_RUN = /(?:%[0-9A-Fa-f]{2})+/gu;
const TRAILING_PUNCTUATION = new Set([...".,;:!?)]}'\"\u2019\u201d"]);

function percentDecode(text: string): string {
  return text.replace(PERCENT_RUN, (run) => {
    const bytes = new Uint8Array(run.length / 3);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(run.slice(i * 3 + 1, i * 3 + 3), 16);
    return new TextDecoder("utf-8").decode(bytes);
  });
}

function isPath(text: string): boolean {
  return PATH_START.test(text);
}

function isWindowsStyle(text: string): boolean {
  return WINDOWS_DRIVE.test(text) || text.startsWith("\\\\");
}

function trimEnd(text: string, chars: Set<string>): string {
  let end = text.length;
  while (end > 0 && chars.has(text[end - 1])) end--;
  return text.slice(0, end);
}

/** The part of `path` after `root` (empty or starting with a separator), else null. */
function under(path: string, root: string, windowsStyle?: boolean): string | null {
  const bare = root.replace(/[\\/]+$/u, "");
  if (!bare) return null;
  const windows = windowsStyle ?? isWindowsStyle(bare);
  const norm = (value: string): string => {
    const slashed = value.replaceAll("\\", "/");
    return windows ? slashed.toLowerCase() : slashed;
  };
  const a = norm(path);
  const b = norm(bare);
  if (a.startsWith(b) && (a.length === b.length || a[b.length] === "/")) return path.slice(bare.length);
  return null;
}

function shapeRest(rest: string): string {
  const parts = rest.split(SEPARATOR);
  const last = parts.length - 1;
  for (let i = 0; i < parts.length; i += 2) {
    const segment = parts[i];
    if (!segment) continue;
    if (i === last) {
      const dot = segment.lastIndexOf(".");
      const ext = dot > 0 ? segment.slice(dot + 1) : "";
      parts[i] = EXTENSION.test(ext) ? `<file>.${ext}` : "<file>";
    } else {
      parts[i] = "<dir>";
    }
  }
  return parts.join("");
}

/** Every query value becomes `<value>`; keys stay. */
function scrubQuery(query: string): string {
  return query
    .split("&")
    .map((param) => {
      const eq = param.indexOf("=");
      if (eq === -1) return param;
      const value = param.slice(eq + 1);
      return value && value !== TOKEN ? `${param.slice(0, eq)}=${VALUE}` : param;
    })
    .join("&");
}

function scrubRoute(raw: string): string {
  const mark = raw.indexOf("?");
  return mark === -1 ? raw : `${raw.slice(0, mark + 1)}${scrubQuery(raw.slice(mark + 1))}`;
}

/** For the text after `<home>`: an app root inside the home folder, as [prefix, remainder]. */
function appRootRest(rest: string, ctx: ScrubContext): [string, string] | null {
  if (!ctx.home) return null;
  const windows = isWindowsStyle(ctx.home);
  for (const root of ctx.appRoots) {
    const relative = under(root, ctx.home);
    if (relative) {
      const remainder = under(rest, relative, windows);
      if (remainder !== null) return ["<app>", remainder];
    }
  }
  return null;
}

/** Rule 4 for one path. Anything that turns out not to be a path comes back unchanged. */
function shapePath(raw: string, ctx: ScrubContext): string {
  const suffix = LINE_COL.exec(raw);
  if (suffix && suffix.index > 0 && isPath(raw.slice(0, suffix.index))) {
    return shapePath(raw.slice(0, suffix.index), ctx) + suffix[0];
  }
  let path = raw.includes("%") ? percentDecode(raw) : raw;
  let prefix = "";
  let slashUnc = false;
  if (path.slice(0, 7).toLowerCase() === "file://") {
    prefix = "file://";
    path = path.slice(7);
    if (/^\/[A-Za-z]:[\\/]/u.test(path) || path.startsWith("/<home>")) {
      prefix += "/";
      path = path.slice(1);
    } else if (!path.startsWith("/") && !path.startsWith("<home>")) {
      path = `//${path}`;
      slashUnc = true;
    }
  }
  if (ROUTE.test(path)) return scrubRoute(raw);
  for (const root of ctx.appRoots) {
    const rest = under(path, root);
    if (rest !== null) return `${prefix}<app>${rest}`;
  }
  if (path.startsWith("<home>") && (path.length === 6 || "\\/".includes(path[6]))) {
    const rest = path.slice(6);
    const found = appRootRest(rest, ctx);
    if (found !== null) return `${prefix}${found[0]}${found[1]}`;
    return `${prefix}<home>${shapeRest(rest)}`;
  }
  if (path.startsWith("~/") || path.startsWith("~\\")) return `${prefix}<home>${shapeRest(path.slice(1))}`;
  if (ctx.home) {
    const rest = under(path, ctx.home);
    if (rest !== null) return `${prefix}<home>${shapeRest(rest)}`;
  }
  if (WINDOWS_DRIVE.test(path)) return `${prefix}${path.slice(0, 2)}${shapeRest(path.slice(2))}`;
  const unc = UNC.exec(path);
  if (unc) {
    const lead = slashUnc ? "" : unc[1];
    return `${prefix}${lead}<host>${unc[3]}<share>${shapeRest(path.slice(unc[0].length))}`;
  }
  if (path.startsWith("/")) return `${prefix}${shapeRest(path)}`;
  return raw;
}

// Rule 6: URLs

const URL_PARTS = /^([Hh][Tt][Tt][Pp][Ss]?):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/su;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const DIGITS = /^[0-9]+$/u;

function scrubUrl(url: string): string {
  const match = URL_PARTS.exec(url);
  if (match === null) return url;
  const scheme = match[1];
  const query = match[4];
  const fragment = match[5];
  let authority = match[2];
  let path = match[3];
  authority = authority.slice(authority.lastIndexOf("@") + 1);
  const host = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1)
    : authority.split(":")[0];
  if (!LOOPBACK_HOSTS.has(host.toLowerCase())) {
    const segments = path.split("/");
    for (let i = 2; i < segments.length; i++) {
      if (segments[i] && segments[i] !== TOKEN && !DIGITS.test(segments[i])) segments[i] = VALUE;
    }
    path = segments.join("/");
  }
  let out = `${scheme}://${authority}${path}`;
  if (query) out += `?${scrubQuery(query.slice(1))}`;
  if (fragment && fragment.length > 1) out += `#${VALUE}`;
  return out;
}

// Plain text (rules 4, 5, 6) and quotes (rule 3)

const BEFORE = String.raw`(?<![A-Za-z0-9_/\\.~%-])`;
const PLAIN = new RegExp(
  [
    String.raw`(?<![A-Za-z0-9])([Hh][Tt][Tt][Pp][Ss]?://[^${WS}"]+)`,
    String.raw`(?<![A-Za-z0-9])([Ff][Ii][Ll][Ee]://${NS}+)`,
    String.raw`(?<![A-Za-z0-9\\])(\\\\[^${WS}\\/]+\\${NS}+)`,
    String.raw`(?<![A-Za-z0-9])([A-Za-z]:[\\/]${NS}*)`,
    String.raw`${BEFORE}(~[\\/]${NS}*)`,
    String.raw`${BEFORE}(/[^${WS}/]+/[^${WS}/]+${NS}*)`,
    String.raw`(<home>[\\/]${NS}*)`,
    String.raw`(?<![A-Za-z0-9_:/\\.~%-])(//[^${WS}/]+/[^${WS}/]+${NS}*)`,
    String.raw`(?<![A-Za-z0-9%])((?:[A-Za-z]%3[Aa])?%(?:2[Ff]|5[Cc])${NS}*)`,
  ].join("|"),
  "gu",
);
const PERCENT_PATH_GROUP = 9;
const PLACEHOLDER = /(<(?:home|dir|file|app|user|value|token|host|share)>)/u;

function scrubMatch(whole: string, group: number, ctx: ScrubContext): string {
  let core = trimEnd(whole, TRAILING_PUNCTUATION);
  const tail = whole.slice(core.length);
  if (group === 1) return scrubUrl(core) + tail;
  if (group === PERCENT_PATH_GROUP) core = percentDecode(core);
  if (!core || !isPath(core)) return whole;
  return shapePath(core, ctx) + tail;
}

function fold(char: string): string {
  const lowered = char.toLowerCase();
  return Array.from(lowered).length === 1 && lowered.length === char.length ? lowered : char;
}

function isWordChar(char: string): boolean {
  return /^[A-Za-z0-9_]$/u.test(char);
}

function replaceUserIn(text: string, name: string): string {
  const foldedText = Array.from(text, fold).join("");
  const foldedName = Array.from(name, fold).join("");
  const out: string[] = [];
  let start = 0;
  let at = foldedText.indexOf(foldedName);
  while (at !== -1) {
    const end = at + foldedName.length;
    const beforeOk = at === 0 || !isWordChar(text[at - 1]);
    const afterOk = end >= text.length || !isWordChar(text[end]);
    if (beforeOk && afterOk && at >= start) {
      out.push(text.slice(start, at), "<user>");
      start = end;
      at = foldedText.indexOf(foldedName, end);
    } else {
      at = foldedText.indexOf(foldedName, at + 1);
    }
  }
  out.push(text.slice(start));
  return out.join("");
}

function replaceUser(text: string, name: string): string {
  const parts = text.split(PLACEHOLDER);
  for (let i = 0; i < parts.length; i += 2) parts[i] = replaceUserIn(parts[i], name);
  return parts.join("");
}

function scrubPlain(input: string, ctx: ScrubContext): string {
  let text = input.replace(PLAIN, (...args: unknown[]) => {
    const groups = args.slice(1, 10) as (string | undefined)[];
    const index = groups.findIndex((g) => g !== undefined);
    return scrubMatch(args[0] as string, index + 1, ctx);
  });
  if (ctx.userName && Array.from(ctx.userName).length >= 2) text = replaceUser(text, ctx.userName);
  return text;
}

const CLOSING: Record<string, string> = { "'": "'", '"': '"', "“": "”", "‘": "’" };
const CLOSERS = ["'", '"', "”", "’"];
const ALNUM = /^[\p{L}\p{N}]$/u;

/** Whether the code point that starts at `index` is a letter or a digit. */
function alnumAt(text: string, index: number): boolean {
  if (index >= text.length) return false;
  return ALNUM.test(String.fromCodePoint(text.codePointAt(index) as number));
}

/** Whether the code point that ends just before `index` is a letter or a digit. */
function alnumBefore(text: string, index: number): boolean {
  if (index <= 0) return false;
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return ALNUM.test(text.slice(index - 2, index));
  }
  return ALNUM.test(text[index - 1]);
}

function scrubInside(inner: string, ctx: ScrubContext): string {
  if (inner === "" || inner === TOKEN) return inner;
  if (isPath(inner)) return shapePath(inner, ctx);
  return VALUE;
}

function scrubQuotes(text: string, ctx: ScrubContext): string {
  if (!Object.keys(CLOSING).some((c) => text.includes(c))) return scrubPlain(text, ctx);
  const n = text.length;
  // One right-to-left pass: the next valid closer of each kind, and the next newline, at every
  // position. A closer is valid when the character after it is not a letter or digit. This keeps
  // the whole scan linear, whatever the input.
  const nextCloser = new Map<string, Int32Array>(CLOSERS.map((c) => [c, new Int32Array(n + 2).fill(-1)]));
  const nextNewline = new Int32Array(n + 2).fill(-1);
  const current = new Map<string, number>(CLOSERS.map((c) => [c, -1]));
  let newline = -1;
  for (let j = n - 1; j >= 0; j--) {
    const char = text[j];
    if (char === "\n") newline = j;
    if (current.has(char) && !alnumAt(text, j + 1)) current.set(char, j);
    for (const c of CLOSERS) (nextCloser.get(c) as Int32Array)[j] = current.get(c) as number;
    nextNewline[j] = newline;
  }
  const out: string[] = [];
  let plainFrom = 0;
  let i = 0;
  while (i < n) {
    if (Object.hasOwn(CLOSING, text[i]) && !alnumBefore(text, i)) {
      const close = (nextCloser.get(CLOSING[text[i]]) as Int32Array)[i + 1];
      if (close !== -1 && (nextNewline[i + 1] === -1 || close < nextNewline[i + 1])) {
        out.push(scrubPlain(text.slice(plainFrom, i), ctx));
        out.push(text[i] + scrubInside(text.slice(i + 1, close), ctx) + text[close]);
        i = plainFrom = close + 1;
        continue;
      }
    }
    i++;
  }
  out.push(scrubPlain(text.slice(plainFrom), ctx));
  return out.join("");
}

/** Apply the text rules to free text such as a message or a log line. */
export function scrubText(text: string, ctx: ScrubContext): string {
  return scrubQuotes(replaceHome(scrubTokens(text, ctx), ctx), ctx);
}

/** A whole field that holds a path (it may contain spaces), else ordinary text. */
function scrubPathValue(input: string, ctx: ScrubContext): string {
  const text = replaceHome(input, ctx);
  return isPath(text) ? shapePath(text, ctx) : scrubText(text, ctx);
}

// Events

const CONTEXT_TYPES = new Set(["runtime", "os", "browser", "app", "device", "gpu", "trace", "culture"]);
const ID_KEYS = new Set(["reportid", "eventid", "traceid", "spanid"]);
const ID_VALUE = /^[0-9A-Fa-f]{32}$/u;

function flatKey(key: string): string {
  return key.toLowerCase().replaceAll("_", "").replaceAll("-", "");
}

function isLibraryKey(key: string): boolean {
  const flat = flatKey(key);
  return KEY_SUFFIXES.some((suffix) => flat.endsWith(suffix));
}

/** A library value is replaced when it is text or a collection; a number or flag is not data. */
function blank(value: unknown): unknown {
  return typeof value === "string" || typeof value === "object" && value !== null ? VALUE : clone(value);
}

function walkItem(key: string, value: unknown, ctx: ScrubContext): unknown {
  if (isLibraryKey(key)) return blank(value);
  if (ID_KEYS.has(flatKey(key)) && typeof value === "string" && ID_VALUE.test(value)) return value;
  return walk(value, ctx);
}

/** Strings are scrubbed; a dict's library-named keys lose their values at every depth. */
function walk(value: unknown, ctx: ScrubContext): unknown {
  if (typeof value === "string") return scrubText(value, ctx);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walkItem(k, v, ctx)]));
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, ctx));
  return clone(value);
}

function scrubFrame(frame: unknown, ctx: ScrubContext): unknown {
  if (!isRecord(frame)) return clone(frame);
  const out: Json = {};
  for (const key of FRAME_KEYS) if (key in frame) out[key] = clone(frame[key]);
  for (const key of ["filename", "abs_path"]) {
    const value = frame[key];
    if (typeof value === "string") out[key] = scrubPathValue(value, ctx);
  }
  return out;
}

function scrubStacktrace(stacktrace: unknown, ctx: ScrubContext): unknown {
  if (!isRecord(stacktrace)) return clone(stacktrace);
  const out: Json = {};
  for (const [k, v] of Object.entries(stacktrace)) if (k !== "frames") out[k] = clone(v);
  if ("frames" in stacktrace) {
    const frames = stacktrace.frames;
    out.frames = Array.isArray(frames) ? frames.map((f) => scrubFrame(f, ctx)) : clone(frames);
  }
  return out;
}

function scrubMechanism(mechanism: unknown, ctx: ScrubContext): unknown {
  if (!isRecord(mechanism)) return clone(mechanism);
  return Object.fromEntries(
    Object.entries(mechanism).map(([k, v]) => [k, k === "data" ? walk(v, ctx) : clone(v)]),
  );
}

/** `exception` and `threads`: `{values: [...]}` whose items carry a `value` and a stack. */
function scrubValueList(container: unknown, ctx: ScrubContext): unknown {
  if (!isRecord(container)) return clone(container);
  const out: Json = {};
  for (const [k, v] of Object.entries(container)) if (k !== "values") out[k] = clone(v);
  if ("values" in container) {
    const items = container.values;
    if (!Array.isArray(items)) {
      out.values = clone(items);
      return out;
    }
    out.values = items.map((item) => {
      if (!isRecord(item)) return clone(item);
      const entry: Json = {};
      for (const [k, v] of Object.entries(item)) {
        if (k !== "value" && k !== "stacktrace" && k !== "mechanism") entry[k] = clone(v);
      }
      if ("value" in item) entry.value = typeof item.value === "string" ? scrubText(item.value, ctx) : item.value;
      if ("stacktrace" in item) entry.stacktrace = scrubStacktrace(item.stacktrace, ctx);
      if ("mechanism" in item) entry.mechanism = scrubMechanism(item.mechanism, ctx);
      return entry;
    });
  }
  return out;
}

function scrubBreadcrumbList(crumbs: unknown[], ctx: ScrubContext): unknown[] {
  const out: unknown[] = [];
  for (const crumb of crumbs) {
    if (!isRecord(crumb)) {
      out.push(clone(crumb));
      continue;
    }
    if (typeof crumb.category === "string" && DROPPED_BREADCRUMB_CATEGORIES.has(crumb.category)) continue;
    const entry: Json = {};
    for (const [k, v] of Object.entries(crumb)) if (k !== "message" && k !== "data") entry[k] = clone(v);
    if ("message" in crumb) entry.message = typeof crumb.message === "string" ? scrubText(crumb.message, ctx) : crumb.message;
    if ("data" in crumb) entry.data = walk(crumb.data, ctx);
    out.push(entry);
  }
  return out;
}

function scrubBreadcrumbs(breadcrumbs: unknown, ctx: ScrubContext): unknown {
  if (Array.isArray(breadcrumbs)) return scrubBreadcrumbList(breadcrumbs, ctx);
  if (isRecord(breadcrumbs) && Array.isArray(breadcrumbs.values)) {
    const out: Json = {};
    for (const [k, v] of Object.entries(breadcrumbs)) if (k !== "values") out[k] = clone(v);
    out.values = scrubBreadcrumbList(breadcrumbs.values, ctx);
    return out;
  }
  return clone(breadcrumbs);
}

/** Which standard context this is: by its name, or by the `type` it declares. */
function contextKind(name: string, value: unknown): string | null {
  if ((STANDARD_CONTEXTS as readonly string[]).includes(name)) return name;
  if (isRecord(value) && typeof value.type === "string" && CONTEXT_TYPES.has(value.type)) return value.type;
  return null;
}

function scrubContexts(contexts: unknown, ctx: ScrubContext): unknown {
  if (!isRecord(contexts)) return clone(contexts);
  const out: Json = {};
  for (const [name, value] of Object.entries(contexts)) {
    const kind = contextKind(name, value);
    if (kind !== null) {
      if (isRecord(value)) {
        const kept: Json = {};
        for (const [k, v] of Object.entries(value)) {
          if (DEVICE_NAME_KEYS.has(k) || (kind === "device" && k === "name")) continue;
          kept[k] = clone(v);
        }
        out[name] = kept;
      } else {
        out[name] = clone(value);
      }
    } else if (isLibraryKey(name)) {
      out[name] = blank(value);
    } else if (isRecord(value)) {
      const kept: Json = {};
      for (const [k, v] of Object.entries(value)) {
        if (DEVICE_NAME_KEYS.has(k)) continue;
        kept[k] = walkItem(k, v, ctx);
      }
      out[name] = kept;
    } else {
      out[name] = walk(value, ctx);
    }
  }
  return out;
}

// A logging call's arguments are values, whatever the template says: a path keeps its shape and
// anything else is replaced.
const FORMAT = /%(?:\(([^)]*)\))?([^A-Za-z%]*)([A-Za-z%])/gu;

function scrubParam(value: unknown, ctx: ScrubContext): unknown {
  if (typeof value === "string") {
    const text = replaceHome(value, ctx);
    return isPath(text) ? shapePath(text, ctx) : VALUE;
  }
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubParam(v, ctx)]));
  if (Array.isArray(value)) return value.map((v) => scrubParam(v, ctx));
  return clone(value);
}

function renderParam(value: unknown, conversion: string): string | null {
  if (typeof value === "string") return "ra".includes(conversion) ? `'${value}'` : value;
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") {
    if ("diu".includes(conversion)) return String(Math.trunc(value));
    if (conversion === "f") return value.toFixed(6);
    return String(value);
  }
  return null;
}

/** Fill `%s`-style conversions (`s r a d i u f`, no flags or width), else null. */
function formatMessage(template: string, params: unknown): string | null {
  const positional = Array.isArray(params);
  const mapping = isRecord(params);
  if (!positional && !mapping) return null;
  let used = 0;
  let failed = false;
  const out = template.replace(FORMAT, (_m, key: string | undefined, flags: string, conversion: string) => {
    if (conversion === "%" && key === undefined && !flags) return "%";
    if (flags || !"sradiuf".includes(conversion)) {
      failed = true;
      return "";
    }
    let value: unknown;
    if (key !== undefined) {
      if (!mapping || !Object.hasOwn(params as Json, key)) {
        failed = true;
        return "";
      }
      value = (params as Json)[key];
    } else {
      if (!positional || used >= (params as unknown[]).length) {
        failed = true;
        return "";
      }
      value = (params as unknown[])[used];
      used += 1;
    }
    const rendered = renderParam(value, conversion);
    if (rendered === null) {
      failed = true;
      return "";
    }
    return rendered;
  });
  if (failed || (positional && used !== (params as unknown[]).length)) return null;
  return out;
}

/** `params` become values; `formatted` is rebuilt from the template and them, else dropped. */
function scrubLogentry(logentry: unknown, ctx: ScrubContext): unknown {
  if (!isRecord(logentry)) return clone(logentry);
  const params = logentry.params;
  const hasParams = params !== undefined && params !== null;
  const scrubbedParams = hasParams ? scrubParam(params, ctx) : null;
  const out: Json = {};
  for (const [key, value] of Object.entries(logentry)) {
    if (key === "message" && typeof value === "string") {
      out[key] = scrubText(value, ctx);
    } else if (key === "params") {
      out[key] = hasParams ? scrubbedParams : clone(value);
    } else if (key === "formatted" && typeof value === "string") {
      if (!hasParams) {
        out[key] = scrubText(value, ctx);
        continue;
      }
      const template = logentry.message;
      const rebuilt = typeof template === "string" ? formatMessage(template, scrubbedParams) : null;
      if (rebuilt !== null) out[key] = scrubText(rebuilt, ctx);
    } else {
      out[key] = clone(value);
    }
  }
  return out;
}

/** Tags are keyed like `extra`: an object, or a list of `[key, value]` pairs. */
function scrubTags(tags: unknown, ctx: ScrubContext): unknown {
  if (Array.isArray(tags)) {
    return tags.map((item) =>
      Array.isArray(item) && item.length === 2 && typeof item[0] === "string"
        ? [item[0], walkItem(item[0], item[1], ctx)]
        : walk(item, ctx),
    );
  }
  return walk(tags, ctx);
}

/** Keep only the output tails, scrubbed. An item is an object naming itself `filename` or `name`. */
function scrubEventAttachments(attachments: unknown, ctx: ScrubContext): unknown[] {
  const kept: unknown[] = [];
  if (!Array.isArray(attachments)) return kept;
  for (const item of attachments) {
    if (!isRecord(item)) continue;
    const name = "filename" in item ? item.filename : item.name;
    if (typeof name !== "string" || !(OUTPUT_TAIL_ATTACHMENTS as readonly string[]).includes(name)) continue;
    const entry: Json = {};
    for (const [k, v] of Object.entries(item)) if (k !== "data" && k !== "text" && k !== "bytes") entry[k] = clone(v);
    for (const field of ["data", "text"]) {
      const content = item[field];
      if (typeof content === "string") entry[field] = scrubAttachment(name, content, ctx) ?? "";
    }
    kept.push(entry);
  }
  return kept;
}

function pathField(value: unknown, ctx: ScrubContext): unknown {
  return typeof value === "string" ? scrubPathValue(value, ctx) : clone(value);
}

function textField(value: unknown, ctx: ScrubContext): unknown {
  return typeof value === "string" ? scrubText(value, ctx) : clone(value);
}

const IMAGE_PATH_KEYS = ["code_file", "debug_file"];

/**
 * Keep `debug_meta` (debug ids tie a frame to its source map), but its images' file paths go through
 * the path rule, as a frame's `filename` does: a loaded module's path names the user.
 */
function scrubDebugMeta(debugMeta: unknown, ctx: ScrubContext): unknown {
  if (!isRecord(debugMeta)) return clone(debugMeta);
  const out = clone(debugMeta) as Json;
  if (Array.isArray(debugMeta.images)) {
    out.images = debugMeta.images.map((image) => {
      if (!isRecord(image)) return clone(image);
      const copy = clone(image) as Json;
      for (const key of IMAGE_PATH_KEYS) {
        const value = image[key];
        if (typeof value === "string") copy[key] = scrubPathValue(value, ctx);
      }
      return copy;
    });
  }
  return out;
}

const EVENT_HANDLERS: Record<string, (value: unknown, ctx: ScrubContext) => unknown> = {
  debug_meta: scrubDebugMeta,
  message: textField,
  logentry: scrubLogentry,
  exception: scrubValueList,
  threads: scrubValueList,
  breadcrumbs: scrubBreadcrumbs,
  tags: scrubTags,
  transaction: pathField,
  culprit: pathField,
  contexts: scrubContexts,
  extra: walk,
  attachments: scrubEventAttachments,
};

/**
 * Return a scrubbed copy of a Sentry-shaped event. The input is not changed.
 *
 * Removed whatever their content: `server_name`, `user`, `request`, the device's name, every
 * frame's local variables, breadcrumbs of category `ui.click`, `ui.input` and `console`, and every
 * attachment but the output tails. Text-scrubbed: `message`, exception values, breadcrumb
 * messages. `logentry.params` become paths or `<value>` and `formatted` is rebuilt from them.
 * `transaction`, `culprit` and a frame's `abs_path` and `filename` and a debug image's `code_file` go through the path rule.
 * Library-named keys lose their string and collection values in `extra`, `tags`, non-standard
 * `contexts`, breadcrumb `data` and `mechanism.data` (numbers and flags stay; a 32-hex value under
 * `event_id`, `trace_id`, `span_id` or `report_id` stays). Event, SDK and build fields
 * (`KEPT_EVENT_KEYS`) and the standard contexts, including any context declaring a standard
 * `type`, are kept; any other top-level key is walked like `extra`.
 */
export function scrubEvent(event: Record<string, unknown>, ctx: ScrubContext): Record<string, unknown> {
  const out: Json = {};
  for (const [key, value] of Object.entries(event)) {
    if (DROPPED_EVENT_KEYS.has(key)) continue;
    const handler = Object.hasOwn(EVENT_HANDLERS, key) ? EVENT_HANDLERS[key] : undefined;
    if (handler) out[key] = handler(value, ctx);
    else if (KEPT_EVENT_KEYS.has(key)) out[key] = clone(value);
    else out[key] = walk(value, ctx);
  }
  return out;
}

/** Scrub a process-output tail line by line. Any other attachment is dropped (null). */
export function scrubAttachment(name: string, text: string, ctx: ScrubContext): string | null {
  if (!(OUTPUT_TAIL_ATTACHMENTS as readonly string[]).includes(name)) return null;
  return text.split("\n").map((line) => scrubText(line, ctx)).join("\n");
}

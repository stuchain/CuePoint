/**
 * The pure rules of the Beatport sign-in (C12): what counts as a token, which pages the sign-in
 * window may show, when a token is renewed, and what the renderer is told about it.
 *
 * No Electron and no I/O here, so every rule is tested without a window. `beatportAuth.ts`
 * wires them to the window and the engine; the token itself never leaves main.
 */

/** The states the renderer shows (`BeatportAuth.state` in the bridge types). */
export type BeatportAuthState = "signed_out" | "signed_in" | "expired" | "pasted" | "env" | "unavailable";

/** What the renderer is told: a state and a preview, never the token. */
export interface BeatportAuthStatus {
  state: BeatportAuthState;
  masked: string | null;
  expires_at: string | null;
  secure_storage: boolean;
}

/** Where a stored token came from. */
export type BeatportTokenOrigin = "signin" | "pasted";

export interface StoredBeatportToken {
  token: string;
  /** An ISO date-time, or null when the token has no known end (a pasted one). */
  expires_at: string | null;
  source: BeatportTokenOrigin;
}

/** Renew this long before the token ends. */
export const REFRESH_LEAD_MS = 10 * 60 * 1000;
/** Never sooner than this from now, so a token already past its end does not spin. */
export const REFRESH_FLOOR_MS = 30 * 1000;
/** `setTimeout` takes at most a signed 32-bit number of milliseconds. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Beatport's own site, and the hosts its social sign-in goes through (Q2). */
const SOCIAL_HOSTS = new Set(["accounts.google.com", "appleid.apple.com", "www.facebook.com", "facebook.com"]);

/** `Bearer abc` out of a header bag whose keys may be in any case; null when there is none. */
export function bearerFrom(headers: Record<string, string | string[] | undefined> | null | undefined): string | null {
  if (!headers) return null;
  for (const [name, raw] of Object.entries(headers)) {
    if (name.toLowerCase() !== "authorization") continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") return null;
    const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(value);
    return match ? match[1]! : null;
  }
  return null;
}

/**
 * Whether the sign-in window (or a popup it opens) may show `url`: https on Beatport's own
 * domain or one of the social sign-in hosts, on the default port, with no credentials in it.
 * `extraOrigins` are exact origins an end-to-end run adds for its local stand-in.
 */
export function isAllowedSignInUrl(url: unknown, extraOrigins: readonly string[] = []): boolean {
  if (typeof url !== "string" || url === "") return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (extraOrigins.includes(parsed.origin)) return true;
  if (parsed.protocol !== "https:") return false;
  if (parsed.username !== "" || parsed.password !== "") return false;
  if (parsed.port !== "" && parsed.port !== "443") return false;
  const host = parsed.hostname.toLowerCase();
  return host === "beatport.com" || host.endsWith(".beatport.com") || SOCIAL_HOSTS.has(host);
}

/** An ISO date-time (or a millisecond epoch) as milliseconds; null when it is neither. */
export function expiryMs(expiresAt: string | number | null | undefined): number | null {
  if (typeof expiresAt === "number") return Number.isFinite(expiresAt) ? expiresAt : null;
  if (typeof expiresAt !== "string" || expiresAt === "") return null;
  const ms = Date.parse(expiresAt);
  return Number.isNaN(ms) ? null : ms;
}

/** How long to wait before renewing: ten minutes before the end, at least 30 s; null with no end. */
export function refreshDelay(expiresAt: string | number | null | undefined, now: number): number | null {
  const end = expiryMs(expiresAt);
  if (end === null) return null;
  return Math.min(MAX_TIMER_MS, Math.max(REFRESH_FLOOR_MS, end - REFRESH_LEAD_MS - now));
}

/** `••••` and the last four characters; never more of the token than that. */
export function maskToken(token: string | null | undefined): string {
  const value = (token ?? "").trim();
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

/**
 * Whether Beatport's introspection names a live token that belongs to a person. A guest token
 * (the site's own, before anyone signs in) is active but has no user, and would only get
 * "forbidden" from playlist work (DEC-099).
 */
export function isUserToken(introspection: unknown): boolean {
  if (!introspection || typeof introspection !== "object" || Array.isArray(introspection)) return false;
  const record = introspection as Record<string, unknown>;
  if (record.active !== true) return false;
  // The site's anonymous session is `user:anon`, and it can carry a username and a user id too.
  if (typeof record.scope === "string" && record.scope.split(/\s+/).some((entry) => entry.startsWith("user:anon"))) {
    return false;
  }
  const username = record.username;
  if (typeof username === "string" && username.trim() !== "") return true;
  const userId = record.user_id;
  if (typeof userId === "number") return Number.isFinite(userId);
  if (typeof userId === "string") return userId.trim() !== "";
  if (userId && typeof userId === "object" && !Array.isArray(userId)) {
    const id = (userId as Record<string, unknown>).id;
    return typeof id === "number" && Number.isFinite(id);
  }
  return false;
}

/** Used when nothing says how long a token lasts, so a renewal probe still happens. */
export const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * The end an introspection names: its `exp` (seconds since the epoch), else its `expires_in`
 * (seconds from `now`); null when it gives neither.
 */
export function introspectExpiresAt(introspection: unknown, now: number = Date.now()): string | null {
  if (!introspection || typeof introspection !== "object") return null;
  const record = introspection as Record<string, unknown>;
  const exp = record.exp;
  if (typeof exp === "number" && Number.isFinite(exp) && exp > 0) return new Date(exp * 1000).toISOString();
  const expiresIn = record.expires_in;
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0) {
    return new Date(now + expiresIn * 1000).toISOString();
  }
  return null;
}

/** The `exp` of a JWT-shaped token (it starts `eyJ`), else null. The signature is not checked. */
export function jwtExpiresAt(token: string): string | null {
  if (!token.startsWith("eyJ")) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const exp = payload && typeof payload === "object" ? (payload as Record<string, unknown>).exp : null;
    return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? new Date(exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

const TOKEN_KEY = /^access_?token$/i;
const EXPIRY_KEYS = [
  "accessTokenExpires",
  "access_token_expires",
  "expires_at",
  "expiresAt",
  "expires",
  "expiry",
  "exp",
] as const;

/**
 * A token and its end from the website's `/api/auth/session` JSON: a string field named like
 * `access_token` or `accessToken`, at the top or inside a nested `token` or `user` object.
 * The end is a hint only; the introspection's `exp` is what is kept.
 */
export function tokenFromSessionJson(json: unknown, now: number = Date.now()): { token: string; expiresAt: string | null } | null {
  const scopes: unknown[] = [json];
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const record = json as Record<string, unknown>;
    for (const key of ["token", "user", "session", "data"]) scopes.push(record[key]);
  }
  for (const scope of scopes) {
    if (!scope || typeof scope !== "object" || Array.isArray(scope)) continue;
    const record = scope as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (TOKEN_KEY.test(key) && typeof value === "string" && value.trim() !== "") {
        // Only the object the token sits in: a top-level `expires` is the session cookie's end.
        return { token: value.trim(), expiresAt: sessionExpiry(record, now) };
      }
    }
  }
  return null;
}

function sessionExpiry(record: Record<string, unknown> | null, now: number): string | null {
  if (!record || typeof record !== "object") return null;
  const relative = record.expires_in;
  if (typeof relative === "number" && Number.isFinite(relative) && relative > 0) {
    return new Date(now + relative * 1000).toISOString();
  }
  for (const key of EXPIRY_KEYS) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      // Seconds or milliseconds since the epoch.
      return new Date(value < 1e11 ? value * 1000 : value).toISOString();
    }
    if (typeof value === "string" && value !== "") {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) return new Date(ms).toISOString();
    }
  }
  return null;
}

export interface AuthStateInput {
  /** `BEATPORT_ACCESS_TOKEN` is set in main's environment (the engine's wins over everything). */
  envSet: boolean;
  stored: StoredBeatportToken | null;
  /** A renewal ended with no new token. */
  expired: boolean;
  secureStorage: boolean;
  now: number;
  /** Sign-in cannot be offered (nothing else makes it so today). */
  unavailable?: boolean;
}

/** The status the renderer is shown. */
export function authState(input: AuthStateInput): BeatportAuthStatus {
  const { envSet, stored, expired, secureStorage, now } = input;
  const base = { secure_storage: secureStorage };
  if (envSet) return { state: "env", masked: null, expires_at: null, ...base };
  if (input.unavailable) return { state: "unavailable", masked: null, expires_at: null, ...base };
  if (!stored) return { state: expired ? "expired" : "signed_out", masked: null, expires_at: null, ...base };
  const masked = maskToken(stored.token);
  if (stored.source === "pasted") return { state: "pasted", masked, expires_at: stored.expires_at, ...base };
  const end = expiryMs(stored.expires_at);
  const over = expired || (end !== null && end <= now);
  return { state: over ? "expired" : "signed_in", masked, expires_at: stored.expires_at, ...base };
}

export interface BeatportEndpoints {
  signInUrl: string;
  apiBase: string;
  /** The website's session JSON, read in the sign-in partition. */
  sessionUrl: string;
  /** Exact origins the sign-in window may show beyond `isAllowedSignInUrl`'s. */
  extraOrigins: string[];
}

export const BEATPORT_SIGNIN_URL = "https://www.beatport.com/";
export const BEATPORT_API_BASE = "https://api.beatport.com/v4";
export const E2E_SIGNIN_URL_ENV = "CUEPOINT_E2E_BEATPORT_SIGNIN_URL";
export const E2E_API_URL_ENV = "CUEPOINT_E2E_BEATPORT_API_URL";

/**
 * The pages and API the sign-in uses. Beatport's own, unless an end-to-end run (never a packaged
 * build) points them at a local stand-in; the stand-in's origins are then allowed too.
 */
export function beatportEndpoints(
  env: Record<string, string | undefined>,
  options: { packaged: boolean; e2e: boolean },
): BeatportEndpoints {
  let signInUrl = BEATPORT_SIGNIN_URL;
  let apiBase = BEATPORT_API_BASE;
  const extraOrigins: string[] = [];
  if (options.e2e && !options.packaged) {
    const overrideSignIn = parseUrl(env[E2E_SIGNIN_URL_ENV]);
    const overrideApi = parseUrl(env[E2E_API_URL_ENV]);
    if (overrideSignIn) {
      signInUrl = overrideSignIn.href;
      extraOrigins.push(overrideSignIn.origin);
    }
    if (overrideApi) {
      apiBase = overrideApi.href.replace(/\/+$/, "");
      extraOrigins.push(overrideApi.origin);
    }
  }
  const sessionUrl = `${new URL(signInUrl).origin}/api/auth/session`;
  return { signInUrl, apiBase, sessionUrl, extraOrigins };
}

function parseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

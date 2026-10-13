/**
 * The Beatport sign-in (C12): a sign-in window, the token it yields, and its upkeep.
 *
 * The person signs in on Beatport's own page in a window of its own, in a persistent partition
 * the rest of the app never shares. The token is read two ways, whichever comes first: the
 * `Authorization: Bearer` header the site sends to `api.beatport.com/v4`, and the website's own
 * `/api/auth/session` JSON, polled while the window is open. Each candidate is checked with
 * Beatport's introspection and accepted only when it is a live token with a user on it (a guest
 * token would be refused by playlist work). The token then goes to `beatportTokenStore.ts`
 * (encrypted at rest) and to the engine's memory; the renderer is only ever told a state and a
 * masked preview. Nothing here logs a header or a token.
 *
 * Renewal (measured on a live sign-in, 2026-10-12, Windows): the token rotates about every 12
 * minutes, and Beatport's `/api/auth/session` hands out the new one (the site renews it server-side
 * once it has ended) for as long as the NextAuth session cookie lives, about 30 days, sliding. So
 * `BeatportAuth` renews by reading that endpoint in the sign-in partition, with no window; a hidden
 * window is only a single fallback after a failed read.
 *
 * Two halves. `BeatportAuth` holds the logic and is given everything it touches, so it is tested
 * with fakes. `ElectronSignInHost` is the thin part that makes the real windows and wires the
 * partition: its navigation and permission rules are the security boundary of the second window
 * (ADR-011), and the pure rules it applies are in `beatportAuthRules.ts`.
 */
import type { BrowserWindow, Session, WebContents } from "electron";

import {
  DEFAULT_TOKEN_TTL_MS,
  REFRESH_FLOOR_MS,
  REFRESH_LEAD_MS,
  authState,
  bearerFrom,
  expiryMs,
  introspectExpiresAt,
  introspectVerdict,
  isAllowedSignInUrl,
  isSignedOutSession,
  jwtExpiresAt,
  rebaseSessionExpiry,
  refreshDelay,
  tokenFromSessionJson,
  type BeatportAuthStatus,
  type BeatportEndpoints,
  type StoredBeatportToken,
} from "./beatportAuthRules";

/** The partition the sign-in window lives in; the default session never sees Beatport's cookies. */
export const BEATPORT_PARTITION = "persist:beatport-signin";

/** How often the website's session JSON is read while a window is open. */
export const SESSION_POLL_MS = 2000;
/** How long a silent renewal waits for a new token before the state becomes "expired". */
export const REFRESH_WAIT_MS = 30_000;
const INTROSPECT_TIMEOUT_MS = 15_000;
/** The longest pasted token taken; real ones are a few hundred characters. */
const MAX_PASTED_TOKEN = 8192;

/** One window, as `BeatportAuth` sees it. */
export interface SignInSurface {
  /** Called with each bearer the site sends to the API. */
  onBearer(listener: (token: string) => void): void;
  /** The website's session JSON read inside the partition; null when it cannot be read. */
  fetchSessionJson(): Promise<unknown>;
  onClosed(listener: () => void): void;
  close(): void;
}

export interface SignInHost {
  /** A window on the sign-in page: shown and modal, or hidden for a silent renewal. */
  open(options: { visible: boolean }): SignInSurface;
  /** The website's session JSON read in the partition with no window; null when it cannot be read. */
  fetchSessionJson(): Promise<unknown>;
  /** Cookies, storage and cache of the partition. */
  clearData(): Promise<void>;
}

export interface TokenStoreLike {
  /** Asks the system; the macOS Keychain may need the person for it. */
  isSecure(): boolean;
  /** The same answer for display, without asking where asking could need the person. */
  canKeep(): boolean;
  load(): StoredBeatportToken | null;
  save(stored: StoredBeatportToken): boolean;
  clear(): void;
}

/** What main asks of the engine. */
export interface EnginePort {
  setSession(token: string | null): Promise<unknown>;
  takeLegacy(): Promise<{ token: string | null }>;
  /** Blank the config key's value (the existing set-token call with ""). */
  blankLegacy(): Promise<unknown>;
}

export interface BeatportAuthOptions {
  host: SignInHost;
  store: TokenStoreLike;
  engine: EnginePort;
  /** Used for the introspection only. */
  fetch: typeof fetch;
  apiBase: string;
  /** `BEATPORT_ACCESS_TOKEN` is set: it outranks every token CuePoint holds. */
  envTokenSet: () => boolean;
  /** Tells every renderer the new status (never a token). */
  broadcast: (status: BeatportAuthStatus) => void;
  /** Gives the live token to the report scrubber. */
  onToken?: (token: string) => void;
  /** A breadcrumb with no token or header in it. */
  breadcrumb?: (message: string) => void;
  now?: () => number;
  pollMs?: number;
  refreshWaitMs?: number;
}

interface Verified {
  token: string;
  expiresAt: string | null;
  /** Whether the end came from the website's session JSON, which is the one that carries it. */
  fromSession: boolean;
}

/**
 * What checking a token came to. `rejected` is a definite no (401, an inactive token, a guest's)
 * and is never asked about again. `inconclusive` (a 403, a 5xx, an answer that names no user) and
 * `error` (no network, a timeout, an answer that is not JSON) leave the token open: it is asked
 * again after a backoff. `reason` goes in the sign-in log, never a token.
 */
type Verdict =
  | { kind: "ok"; verified: Verified }
  | { kind: "rejected"; reason: string }
  | { kind: "inconclusive"; reason: string }
  | { kind: "error"; reason: string };

/**
 * How long to wait before asking Beatport again about a token it could not decide on: after the
 * first failure, the second and the third; the last repeats.
 */
export const VERIFY_BACKOFF_MS: readonly number[] = [2_000, 5_000, 15_000, 30_000];

/** After a failed renewal: how long to wait before the next try (the last one repeats). */
export const RENEW_BACKOFF_MS: readonly number[] = [60_000, 5 * 60_000, 15 * 60_000];
/** When the session endpoint repeats the token, look again this long after the token's end. */
export const SAME_TOKEN_GRACE_MS = 3_000;
/** The same token still counts as the site's current one this long after its end (clock skew). */
export const SAME_TOKEN_SLACK_MS = 2 * 60_000;
/** A session read that has not answered by now has failed. */
export const SESSION_READ_TIMEOUT_MS = 12_000;
/** The site's sign-in has ended (its session JSON is empty): look this rarely for a new one. */
export const SITE_SIGNED_OUT_RETRY_MS = 6 * 60 * 60_000;

export class BeatportAuth {
  private readonly now: () => number;
  private expired = false;
  private migrated = false;
  /** Bumped by sign-out and a pasted token: a capture that began before it must not store anything. */
  private generation = 0;
  private retry = 0;
  /** The hidden-window fallback is tried once per run of failures. */
  private fallbackTried = false;
  private signingIn: Promise<BeatportAuthStatus> | null = null;
  private refreshing: Promise<BeatportAuthStatus> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private pushChain: Promise<void> = Promise.resolve();
  private readonly open = new Set<SignInSurface>();

  constructor(private readonly options: BeatportAuthOptions) {
    this.now = options.now ?? Date.now;
  }

  /** What the renderer is shown now. */
  status(): BeatportAuthStatus {
    return authState({
      envSet: this.options.envTokenSet(),
      stored: this.options.store.load(),
      expired: this.expired,
      secureStorage: this.options.store.canKeep(),
      now: this.now(),
    });
  }

  /** At launch: pick up a stored token and arrange its renewal. */
  init(): void {
    const stored = this.options.store.load();
    if (stored) this.options.onToken?.(stored.token);
    this.resume();
  }

  /**
   * Arrange renewal: at once when the stored token's end has already passed (the computer slept,
   * or the app was off), else at its time. Also called when the main window is made again after
   * `dispose` (macOS keeps the app running with no window) and after the computer wakes.
   */
  resume(): void {
    if (this.signingIn || this.refreshing || this.refreshTimer) return;
    const stored = this.options.store.load();
    if (!stored || stored.source !== "signin" || this.options.envTokenSet()) return;
    const end = expiryMs(stored.expires_at);
    if (end !== null && end <= this.now()) {
      void this.refreshNow();
      return;
    }
    this.scheduleRefresh();
  }

  /** The computer woke or unlocked: renew now if the token has run out meanwhile, else keep the plan. */
  wake(): void {
    const stored = this.options.store.load();
    if (!stored || stored.source !== "signin") return;
    const end = expiryMs(stored.expires_at);
    if (end !== null && end - REFRESH_LEAD_MS <= this.now()) {
      this.cancelRefreshTimer();
      void this.refreshNow();
    } else {
      this.resume();
    }
  }

  /**
   * After every start of the engine, which keeps the token only in its memory: move a token from
   * the old config key once (secure storage only), then hand the stored one over.
   */
  async onEngineStarted(): Promise<void> {
    if (!this.migrated) {
      try {
        await this.migrateLegacyToken();
        this.migrated = true;
      } catch {
        // Tried again at the next start.
        this.options.breadcrumb?.("legacy token migration failed");
      }
    }
    if (!this.options.store.load()) return;
    await this.pushToEngine();
  }

  /**
   * Move a token pasted before sign-in existed from the config file into secure storage, then
   * blank the file's value (the key stays). If it stops half way the token is in both places,
   * which is harmless, and the next launch finishes. Without secure storage the file is left.
   */
  async migrateLegacyToken(): Promise<void> {
    const { store, engine } = this.options;
    // The file first: secure storage is asked only when there is a token to move, so a launch
    // with none never touches the Keychain.
    const { token } = await engine.takeLegacy();
    if (!token) return;
    if (!store.isSecure()) return;
    if (store.load()) {
      // A token is already kept (an interrupted earlier migration, or a newer sign-in): the file's
      // copy is stale either way, and must not stay behind in the clear.
      await engine.blankLegacy();
      return;
    }
    if (!store.save({ token, expires_at: null, source: "pasted" })) return;
    this.options.onToken?.(token);
    await engine.blankLegacy();
    this.options.broadcast(this.status());
  }

  /**
   * Open the sign-in window and wait for a verified user token or for the window to close. While
   * a window is already open, or a renewal is running, that flow is what the call joins.
   */
  signIn(): Promise<BeatportAuthStatus> {
    if (this.options.envTokenSet()) return Promise.resolve(this.status());
    if (this.signingIn) return this.signingIn;
    if (this.refreshing) return this.refreshing;
    const run = this.runSignIn().finally(() => {
      this.signingIn = null;
    });
    this.signingIn = run;
    return run;
  }

  private async runSignIn(): Promise<BeatportAuthStatus> {
    const generation = this.generation;
    const surface = this.track(this.options.host.open({ visible: true }));
    const found = await this.capture(surface, { exclude: null, timeoutMs: null });
    this.release(surface);
    if (found && generation === this.generation) {
      await this.accept(await this.withSessionExpiry(found), generation);
    } else if (generation === this.generation) {
      // The window was closed with nothing: a renewal waiting for this must not have been lost.
      this.ensureScheduled();
    }
    return this.status();
  }

  /**
   * A token taken from the API header carries no end: read the session JSON once now to learn it
   * (and to prefer the session's own token if it differs, since that is the one that rotates).
   */
  private async withSessionExpiry(found: Verified): Promise<Verified> {
    if (found.fromSession) return found;
    const session = await this.readSession();
    if (session.kind !== "token") return found;
    if (session.token === found.token) {
      return session.expiresAt ? { ...found, expiresAt: session.expiresAt, fromSession: true } : found;
    }
    const verdict = await this.verify(session.token, session.expiresAt);
    return verdict.kind === "ok" ? verdict.verified : found;
  }

  /**
   * The session JSON now, read without a window and with a time limit. "token": a user's token;
   * "ended": the site says nobody is signed in (`{}`); "none": anything else, or a failed read.
   */
  private async readSession(): Promise<
    { kind: "token"; token: string; expiresAt: string | null } | { kind: "ended" } | { kind: "none" }
  > {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const json = await Promise.race([
        this.options.host.fetchSessionJson(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), SESSION_READ_TIMEOUT_MS);
        }),
      ]);
      const found = tokenFromSessionJson(json, this.now());
      if (found) return { kind: "token", token: found.token, expiresAt: found.expiresAt };
      return isSignedOutSession(json) ? { kind: "ended" } : { kind: "none" };
    } catch {
      return { kind: "none" };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Renew now; see `runRefresh`. */
  refreshNow(): Promise<BeatportAuthStatus> {
    if (this.refreshing) return this.refreshing;
    if (this.signingIn) return this.signingIn;
    const run = this.runRefresh().finally(() => {
      this.refreshing = null;
    });
    this.refreshing = run;
    return run;
  }

  /**
   * Read the session endpoint in the partition (no window) for the token the site has renewed.
   * A new token is checked, stored and handed to the engine. The same token again is fine while
   * it lasts: look once more just after its end. Anything else (nothing, a guest token, an error)
   * is tried once more through a hidden window, then retried after growing waits. "Expired" is
   * said only once the token's own end has passed and nothing new has come.
   */
  private async runRefresh(): Promise<BeatportAuthStatus> {
    const stored = this.options.store.load();
    if (!stored || stored.source !== "signin" || this.options.envTokenSet()) return this.status();
    const generation = this.generation;

    const direct = await this.renewDirect(stored);
    if (generation !== this.generation) return this.status();
    if (direct.kind === "renewed") {
      await this.accept(direct.verified, generation);
      return this.status();
    }
    if (direct.kind === "same") {
      this.sameToken(stored, direct.expiresAt);
      return this.status();
    }
    if (direct.kind === "ended") {
      this.siteSignInEnded(stored);
      return this.status();
    }

    if (!this.fallbackTried) {
      this.fallbackTried = true;
      // The site's home page, not the NextAuth sign-in page: loading that would only ask to sign in.
      const surface = this.track(this.options.host.open({ visible: false }));
      const found = await this.capture(surface, {
        exclude: stored.token,
        timeoutMs: this.options.refreshWaitMs ?? REFRESH_WAIT_MS,
      });
      this.release(surface);
      if (generation !== this.generation) return this.status();
      if (found) {
        const complete = await this.withSessionExpiry(found);
        await this.accept(complete, generation);
        return this.status();
      }
    }
    if (generation !== this.generation || this.options.store.load()?.token !== stored.token) return this.status();
    this.renewalFailed(stored);
    return this.status();
  }

  private async renewDirect(
    stored: StoredBeatportToken,
  ): Promise<
    | { kind: "renewed"; verified: Verified }
    | { kind: "same"; expiresAt: string }
    | { kind: "ended" }
    | { kind: "failed" }
  > {
    const session = await this.readSession();
    if (session.kind === "ended") return { kind: "ended" };
    if (session.kind !== "token") return { kind: "failed" };
    if (session.token === stored.token) {
      const expiresAt = session.expiresAt ?? stored.expires_at;
      const end = expiryMs(expiresAt);
      // The site renews a little after the end, and clocks differ: a short way past is still "same".
      if (expiresAt === null || end === null || end + SAME_TOKEN_SLACK_MS <= this.now()) return { kind: "failed" };
      return { kind: "same", expiresAt };
    }
    const verdict = await this.verify(session.token, session.expiresAt);
    return verdict.kind === "ok" ? { kind: "renewed", verified: verdict.verified } : { kind: "failed" };
  }

  /** The site has not renewed yet but the token lasts: keep it and look just after its end. */
  private sameToken(stored: StoredBeatportToken, expiresAt: string): void {
    if (this.options.store.load()?.token !== stored.token) return;
    if (expiresAt !== stored.expires_at) {
      this.options.store.save({ ...stored, expires_at: expiresAt });
    }
    const end = expiryMs(expiresAt)!;
    this.retry = 0;
    this.fallbackTried = false;
    this.scheduleRetry(Math.max(REFRESH_FLOOR_MS, end + SAME_TOKEN_GRACE_MS - this.now()));
    if (this.expired && end > this.now()) {
      this.expired = false;
      this.options.broadcast(this.status());
    }
  }

  /** Beatport's own sign-in is over (empty session): say so once the token has ended; ask rarely. */
  private siteSignInEnded(stored: StoredBeatportToken): void {
    if (this.options.store.load()?.token !== stored.token) return;
    const end = expiryMs(stored.expires_at) ?? this.now();
    if (end > this.now()) {
      this.scheduleRetry(end - this.now() + SAME_TOKEN_GRACE_MS);
      return;
    }
    if (!this.expired) {
      this.expired = true;
      this.options.breadcrumb?.("beatport sign-in has ended on the site");
      this.options.broadcast(this.status());
    }
    this.scheduleRetry(SITE_SIGNED_OUT_RETRY_MS);
  }

  private renewalFailed(stored: StoredBeatportToken): void {
    const end = expiryMs(stored.expires_at) ?? this.now();
    if (end <= this.now() && !this.expired) {
      this.expired = true;
      this.options.breadcrumb?.("beatport sign-in could not be renewed");
      this.options.broadcast(this.status());
    }
    this.scheduleRetry(RENEW_BACKOFF_MS[Math.min(this.retry, RENEW_BACKOFF_MS.length - 1)]!);
    this.retry += 1;
  }

  /** Forget the token everywhere: file, memory, the partition's cookies and the engine. */
  async signOut(): Promise<BeatportAuthStatus> {
    this.generation += 1;
    this.retry = 0;
    this.fallbackTried = false;
    this.cancelRefreshTimer();
    for (const surface of [...this.open]) this.release(surface);
    this.options.store.clear();
    this.expired = false;
    try {
      await this.options.host.clearData();
    } catch {
      this.options.breadcrumb?.("could not clear the sign-in window's storage");
    }
    await this.pushToEngine();
    const status = this.status();
    this.options.broadcast(status);
    return status;
  }

  /** A token pasted in Settings (the fallback): stored as "pasted", handed to the engine. */
  async savePastedToken(raw: unknown): Promise<BeatportAuthStatus> {
    if (typeof raw !== "string") throw new Error("The token must be text.");
    const token = raw.trim();
    if (token.length > MAX_PASTED_TOKEN) throw new Error("That token is too long.");
    this.generation += 1;
    this.retry = 0;
    this.fallbackTried = false;
    this.cancelRefreshTimer();
    this.expired = false;
    if (token === "") {
      this.options.store.clear();
    } else {
      this.options.store.save({ token, expires_at: null, source: "pasted" });
      this.options.onToken?.(token);
    }
    await this.pushToEngine();
    const status = this.status();
    this.options.broadcast(status);
    return status;
  }

  /** At quit, or when the main window has closed: stop the timer and close any window. */
  dispose(): void {
    this.generation += 1;
    this.cancelRefreshTimer();
    for (const surface of [...this.open]) this.release(surface);
  }

  private async accept(found: Verified, generation: number): Promise<void> {
    // Signed out, or a token pasted, while this was being checked: it is no longer wanted.
    if (generation !== this.generation) return;
    try {
      this.options.store.save({ token: found.token, expires_at: found.expiresAt, source: "signin" });
    } catch {
      // The store keeps the token in memory before it writes: the sign-in holds for this run.
      this.options.breadcrumb?.("could not keep the token");
    }
    this.options.onToken?.(found.token);
    this.expired = false;
    this.retry = 0;
    this.fallbackTried = false;
    await this.pushToEngine();
    // Signed out, or the app disposed, while the engine was being told: nothing more to arrange.
    if (generation !== this.generation) return;
    this.scheduleRefresh();
    this.options.breadcrumb?.("beatport sign-in accepted");
    this.options.broadcast(this.status());
  }

  /**
   * Hand the engine the token as the store holds it when the push is sent (null when signed out).
   * One queue, so a slow push cannot land after a newer one.
   */
  private pushToEngine(): Promise<void> {
    const next = this.pushChain.then(async () => {
      try {
        await this.options.engine.setSession(this.options.store.load()?.token ?? null);
      } catch {
        this.options.breadcrumb?.("could not hand the token to the engine");
      }
    });
    this.pushChain = next;
    return next;
  }

  /** A renewal is always on the calendar for a signed-in token: add one if none is. */
  private ensureScheduled(): void {
    if (this.refreshTimer || this.refreshing) return;
    const stored = this.options.store.load();
    if (!stored || stored.source !== "signin" || this.options.envTokenSet()) return;
    this.scheduleRefresh();
    if (!this.refreshTimer) this.scheduleRetry(RENEW_BACKOFF_MS[0]!);
  }

  private scheduleRefresh(): void {
    this.cancelRefreshTimer();
    const stored = this.options.store.load();
    if (!stored || stored.source !== "signin") return;
    const delay = refreshDelay(stored.expires_at, this.now());
    if (delay === null) return;
    this.scheduleRetry(delay);
  }

  private scheduleRetry(delay: number): void {
    this.cancelRefreshTimer();
    this.refreshTimer = setTimeout(
      () => {
        this.refreshTimer = null;
        void this.refreshNow();
      },
      Math.min(delay, 2 ** 31 - 1),
    );
    this.refreshTimer.unref?.();
  }

  private cancelRefreshTimer(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private track(surface: SignInSurface): SignInSurface {
    this.open.add(surface);
    return surface;
  }

  private release(surface: SignInSurface): void {
    if (!this.open.delete(surface)) return;
    try {
      surface.close();
    } catch {
      /* already gone */
    }
  }

  /**
   * Watch a window for a token: the first candidate Beatport confirms as a user's wins. A token
   * Beatport says no to (401, inactive, a guest's) is asked about once. One it could not decide on
   * is asked again after a growing wait (`VERIFY_BACKOFF_MS`), however it reappears. Resolves null
   * when the window closes first, or at `timeoutMs`.
   */
  private capture(
    surface: SignInSurface,
    options: { exclude: string | null; timeoutMs: number | null },
  ): Promise<Verified | null> {
    return new Promise((resolve) => {
      let done = false;
      let polling = false;
      const tried = new Map<
        string,
        { latched: boolean; asking: boolean; attempts: number; nextAt: number; hint: string | null; timer: ReturnType<typeof setTimeout> | null }
      >();
      let interval: ReturnType<typeof setInterval> | null = null;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const finish = (result: Verified | null): void => {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        if (timeout) clearTimeout(timeout);
        for (const entry of tried.values()) if (entry.timer) clearTimeout(entry.timer);
        resolve(result);
      };

      const consider = async (token: string, expiryHint: string | null = null): Promise<void> => {
        if (done || token === options.exclude) return;
        let entry = tried.get(token);
        if (!entry) {
          entry = { latched: false, asking: false, attempts: 0, nextAt: 0, hint: expiryHint, timer: null };
          tried.set(token, entry);
        }
        if (expiryHint !== null) entry.hint = expiryHint;
        if (entry.latched || entry.asking || this.now() < entry.nextAt) return;
        entry.asking = true;
        const verdict = await this.verify(token, entry.hint);
        entry.asking = false;
        if (done) return;
        if (verdict.kind === "ok") {
          finish(verdict.verified);
        } else if (verdict.kind === "rejected") {
          entry.latched = true;
        } else {
          const wait = VERIFY_BACKOFF_MS[Math.min(entry.attempts, VERIFY_BACKOFF_MS.length - 1)]!;
          entry.attempts += 1;
          entry.nextAt = this.now() + wait;
          // Ask again when the wait is over even if the page sends nothing more.
          entry.timer = setTimeout(() => {
            entry!.timer = null;
            void consider(token);
          }, wait);
        }
      };

      const poll = async (): Promise<void> => {
        if (done || polling) return;
        polling = true;
        try {
          const found = tokenFromSessionJson(await surface.fetchSessionJson(), this.now());
          if (found) await consider(found.token, found.expiresAt);
        } catch {
          /* the page is not ready; the next tick asks again */
        } finally {
          polling = false;
        }
      };

      surface.onBearer((token) => void consider(token));
      surface.onClosed(() => finish(null));
      interval = setInterval(() => void poll(), this.options.pollMs ?? SESSION_POLL_MS);
      if (options.timeoutMs !== null) timeout = setTimeout(() => finish(null), options.timeoutMs);
      void poll();
    });
  }

  /**
   * Ask Beatport who the token belongs to. Only a live token with a user is accepted. A 401, an
   * inactive token and a guest's are a definite no; a 403 (a firewall answers that too), another
   * failing status, an answer that is not JSON or one that names no user cannot decide.
   */
  private async verify(token: string, expiryHint: string | null): Promise<Verdict> {
    let text: string;
    try {
      const response = await this.options.fetch(`${this.options.apiBase.replace(/\/+$/, "")}/auth/o/introspect/`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(INTROSPECT_TIMEOUT_MS),
      });
      if (response.status === 401) return { kind: "rejected", reason: "http-401" };
      if (!response.ok) {
        return { kind: "inconclusive", reason: response.status >= 500 ? "http-5xx" : `http-${response.status}` };
      }
      text = await response.text();
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      return { kind: "error", reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { kind: "error", reason: "not-json" };
    }
    const verdict = introspectVerdict(body);
    if (verdict === "anon") return { kind: "rejected", reason: "anon" };
    if (verdict === "inactive") return { kind: "rejected", reason: "inactive" };
    if (verdict === "unknown") return { kind: "inconclusive", reason: "no-user" };
    // The session JSON's end is the one that holds; the introspection of this site gives none.
    const expiresAt =
      expiryHint ??
      introspectExpiresAt(body, this.now()) ??
      jwtExpiresAt(token) ??
      new Date(this.now() + DEFAULT_TOKEN_TTL_MS).toISOString();
    return { kind: "ok", verified: { token, expiresAt, fromSession: expiryHint !== null } };
  }
}

// ---------------------------------------------------------------------------------------------
// The Electron half

export interface ElectronSignInHostOptions {
  BrowserWindow: typeof BrowserWindow;
  /** `session.fromPartition(BEATPORT_PARTITION)`. */
  session: Session;
  /** The main window, which the visible sign-in window is modal to. */
  parent: () => BrowserWindow | null;
  packaged: boolean;
  endpoints: BeatportEndpoints;
}

/**
 * Makes the sign-in windows and wires the partition.
 *
 * Every window here: the sign-in partition, sandboxed, context isolated, no Node, no preload and
 * no developer tools in a packaged build. A navigation or redirect `isAllowedSignInUrl` refuses
 * is cancelled; a popup is allowed only for such a URL, in the same partition and under the same
 * rules, and only in the visible window (social sign-in); permissions are all denied.
 */
export class ElectronSignInHost implements SignInHost {
  private readonly bearerListeners = new Set<(token: string) => void>();

  constructor(private readonly options: ElectronSignInHostOptions) {
    const { session, endpoints } = options;
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    // A sign-in page has nothing to download; a file it offers is refused.
    session.on("will-download", (event) => event.preventDefault());
    // On this partition only, and only for the API: read the bearer, change nothing.
    session.webRequest.onBeforeSendHeaders({ urls: [`${endpoints.apiBase}/*`] }, (details, callback) => {
      try {
        const token = bearerFrom(details.requestHeaders);
        if (token) for (const listener of [...this.bearerListeners]) listener(token);
      } finally {
        callback({ requestHeaders: details.requestHeaders });
      }
    });
  }

  open({ visible }: { visible: boolean }): SignInSurface {
    const { BrowserWindow: Window, endpoints } = this.options;
    const parent = visible ? this.options.parent() : null;
    const win = new Window({
      width: 480,
      height: 720,
      show: visible,
      title: "Sign in to Beatport",
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      ...(parent ? { parent, modal: true } : {}),
      webPreferences: this.webPreferences(),
    });
    win.removeMenu();
    const popups = new Set<BrowserWindow>();
    this.guard(win.webContents, visible, popups);
    const closePopups = (): void => {
      for (const popup of [...popups]) {
        popups.delete(popup);
        if (!popup.isDestroyed()) popup.close();
      }
    };

    const bearerListeners = new Set<(token: string) => void>();
    const forward = (token: string): void => {
      for (const listener of [...bearerListeners]) listener(token);
    };
    this.bearerListeners.add(forward);
    const closed = new Set<() => void>();
    win.on("closed", () => {
      closePopups();
      this.bearerListeners.delete(forward);
      for (const listener of [...closed]) listener();
    });

    // A hidden renewal window loads the site, where the page renews its token; the sign-in page
    // (NextAuth's) would only ask for a sign-in.
    void win.loadURL(visible ? endpoints.signInUrl : endpoints.siteUrl).catch(() => undefined);

    return {
      onBearer: (listener) => void bearerListeners.add(listener),
      onClosed: (listener) => void closed.add(listener),
      fetchSessionJson: () => this.fetchSessionJson(),
      close: () => {
        closePopups();
        if (!win.isDestroyed()) win.close();
      },
    };
  }

  /** The website's session JSON, read in the partition with its cookies and no window. */
  async fetchSessionJson(): Promise<unknown> {
    try {
      const sent = Date.now();
      const response = await this.options.session.fetch(this.options.endpoints.sessionUrl, {
        headers: { Accept: "application/json" },
        credentials: "include",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return null;
      const json = (await response.json()) as unknown;
      // The server's clock may differ from this computer's: move the token's end onto ours.
      const date = Date.parse(response.headers.get("date") ?? "");
      return Number.isNaN(date) ? json : rebaseSessionExpiry(json, date - (sent + Date.now()) / 2);
    } catch {
      return null;
    }
  }

  async clearData(): Promise<void> {
    const { session } = this.options;
    await session.clearStorageData();
    await session.clearCache();
    await session.clearAuthCache?.();
  }

  private webPreferences() {
    return {
      partition: BEATPORT_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      devTools: !this.options.packaged,
      // A hidden window's page must keep running for the site to renew its token.
      backgroundThrottling: false,
    };
  }

  /**
   * A popup is allowed for an allowed page, or for `about:blank`, which a social sign-in opens and
   * then navigates (the navigation is checked like any other, so a popup that stays blank or
   * goes anywhere else is refused). Every popup is kept in `popups` so closing the sign-in closes
   * it too.
   */
  private guard(contents: WebContents, allowPopups: boolean, popups: Set<BrowserWindow>): void {
    const extra = this.options.endpoints.extraOrigins;
    const refuse = (event: { preventDefault: () => void }, url: string): void => {
      if (url === "about:blank") return;
      if (!isAllowedSignInUrl(url, extra)) event.preventDefault();
    };
    contents.setWindowOpenHandler(({ url }) => {
      if (!allowPopups || (url !== "about:blank" && !isAllowedSignInUrl(url, extra))) return { action: "deny" };
      return {
        action: "allow",
        overrideBrowserWindowOptions: { width: 480, height: 720, webPreferences: this.webPreferences() },
      };
    });
    contents.on("did-create-window", (child) => {
      popups.add(child);
      child.on("closed", () => popups.delete(child));
      this.guard(child.webContents, allowPopups, popups);
    });
    contents.on("will-navigate", refuse);
    contents.on("will-redirect", refuse);
  }
}

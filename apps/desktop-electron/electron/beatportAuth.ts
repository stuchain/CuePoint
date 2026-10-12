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
 * Two halves. `BeatportAuth` holds the logic and is given everything it touches, so it is tested
 * with fakes. `ElectronSignInHost` is the thin part that makes the real windows and wires the
 * partition: its navigation and permission rules are the security boundary of the second window
 * (ADR-011), and the pure rules it applies are in `beatportAuthRules.ts`.
 */
import type { BrowserWindow, Session, WebContents } from "electron";

import {
  DEFAULT_TOKEN_TTL_MS,
  authState,
  bearerFrom,
  expiryMs,
  introspectExpiresAt,
  isAllowedSignInUrl,
  isUserToken,
  jwtExpiresAt,
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
  /** Cookies, storage and cache of the partition. */
  clearData(): Promise<void>;
}

export interface TokenStoreLike {
  isSecure(): boolean;
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
}

type Verdict = { kind: "ok"; verified: Verified } | { kind: "rejected" } | { kind: "error" };

/** After a renewal found nothing: when to try again, counted from the token's real end. */
export const RETRY_AFTER_END_MS: readonly number[] = [2 * 60_000, 10 * 60_000, 30 * 60_000];

export class BeatportAuth {
  private readonly now: () => number;
  private expired = false;
  private migrated = false;
  /** Bumped by sign-out and a pasted token: a capture that began before it must not store anything. */
  private generation = 0;
  private retry = 0;
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
      secureStorage: this.options.store.isSecure(),
      now: this.now(),
    });
  }

  /** At launch: pick up a stored token and arrange its renewal. */
  init(): void {
    const stored = this.options.store.load();
    if (stored) this.options.onToken?.(stored.token);
    this.scheduleRefresh();
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
    if (!store.isSecure()) return;
    const { token } = await engine.takeLegacy();
    if (!token) return;
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
    if (found) await this.accept(found, generation);
    return this.status();
  }

  /** Renew now, in a hidden window; see `runRefresh`. */
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
   * Look for a new token in a hidden window. None is not yet the end of the sign-in: the old
   * token lasts until its real end, so the next look is just after that, then at growing
   * intervals. "Expired" is said only once the end has passed and nothing new has come.
   */
  private async runRefresh(): Promise<BeatportAuthStatus> {
    const stored = this.options.store.load();
    if (!stored || stored.source !== "signin" || this.options.envTokenSet()) return this.status();
    const generation = this.generation;
    const surface = this.track(this.options.host.open({ visible: false }));
    const found = await this.capture(surface, {
      exclude: stored.token,
      timeoutMs: this.options.refreshWaitMs ?? REFRESH_WAIT_MS,
    });
    this.release(surface);
    if (generation !== this.generation) return this.status();
    if (found) {
      await this.accept(found, generation);
      return this.status();
    }
    if (this.options.store.load()?.token !== stored.token) return this.status();
    const end = expiryMs(stored.expires_at) ?? this.now();
    if (end > this.now()) {
      this.scheduleRetry(end - this.now() + RETRY_AFTER_END_MS[0]!);
      this.retry = 1;
    } else {
      this.expired = true;
      this.options.breadcrumb?.("beatport sign-in could not be renewed");
      this.options.broadcast(this.status());
      const wait = RETRY_AFTER_END_MS[Math.min(this.retry, RETRY_AFTER_END_MS.length - 1)]!;
      if (this.retry < RETRY_AFTER_END_MS.length) this.scheduleRetry(wait);
      this.retry += 1;
    }
    return this.status();
  }

  /** Forget the token everywhere: file, memory, the partition's cookies and the engine. */
  async signOut(): Promise<BeatportAuthStatus> {
    this.generation += 1;
    this.retry = 0;
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
    this.options.store.save({ token: found.token, expires_at: found.expiresAt, source: "signin" });
    this.options.onToken?.(found.token);
    this.expired = false;
    this.retry = 0;
    await this.pushToEngine();
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
   * is tried once; one that could not be checked (a network error) is tried again when it next
   * appears. Resolves null when the window closes first, or at `timeoutMs`.
   */
  private capture(
    surface: SignInSurface,
    options: { exclude: string | null; timeoutMs: number | null },
  ): Promise<Verified | null> {
    return new Promise((resolve) => {
      let done = false;
      let polling = false;
      const tried = new Set<string>();
      let interval: ReturnType<typeof setInterval> | null = null;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const finish = (result: Verified | null): void => {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        if (timeout) clearTimeout(timeout);
        resolve(result);
      };

      const consider = async (token: string, expiryHint: string | null = null): Promise<void> => {
        if (done || tried.has(token) || token === options.exclude) return;
        tried.add(token);
        const verdict = await this.verify(token, expiryHint, surface);
        if (verdict.kind === "ok") finish(verdict.verified);
        else if (verdict.kind === "error") tried.delete(token);
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

  /** Ask Beatport who the token belongs to. Only a live token with a user is accepted. */
  private async verify(token: string, expiryHint: string | null, surface: SignInSurface): Promise<Verdict> {
    let body: unknown;
    try {
      const response = await this.options.fetch(`${this.options.apiBase.replace(/\/+$/, "")}/auth/o/introspect/`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(INTROSPECT_TIMEOUT_MS),
      });
      if (response.status === 401 || response.status === 403) return { kind: "rejected" };
      if (!response.ok) return { kind: "error" };
      body = await response.json();
    } catch {
      return { kind: "error" };
    }
    if (!isUserToken(body)) return { kind: "rejected" };
    const expiresAt =
      introspectExpiresAt(body, this.now()) ??
      expiryHint ??
      (await this.sessionExpiryOf(token, surface)) ??
      jwtExpiresAt(token) ??
      new Date(this.now() + DEFAULT_TOKEN_TTL_MS).toISOString();
    return { kind: "ok", verified: { token, expiresAt } };
  }

  /** The end the website's session JSON gives for this very token, if it names one. */
  private async sessionExpiryOf(token: string, surface: SignInSurface): Promise<string | null> {
    try {
      const found = tokenFromSessionJson(await surface.fetchSessionJson(), this.now());
      return found && found.token === token ? found.expiresAt : null;
    } catch {
      return null;
    }
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

    void win.loadURL(endpoints.signInUrl).catch(() => undefined);

    return {
      onBearer: (listener) => void bearerListeners.add(listener),
      onClosed: (listener) => void closed.add(listener),
      fetchSessionJson: async () => {
        try {
          const response = await this.options.session.fetch(endpoints.sessionUrl, {
            headers: { Accept: "application/json" },
          });
          return response.ok ? ((await response.json()) as unknown) : null;
        } catch {
          return null;
        }
      },
      close: () => {
        closePopups();
        if (!win.isDestroyed()) win.close();
      },
    };
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

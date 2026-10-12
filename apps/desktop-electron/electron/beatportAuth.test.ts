import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BeatportAuth,
  REFRESH_WAIT_MS,
  RETRY_AFTER_END_MS,
  SESSION_POLL_MS,
  type EnginePort,
  type SignInHost,
  type SignInSurface,
  type TokenStoreLike,
} from "./beatportAuth";
import type { BeatportAuthStatus, StoredBeatportToken } from "./beatportAuthRules";

/**
 * The sign-in's logic, with a fake window, store, engine and Beatport (C12).
 *
 * The window is a surface the test pushes bearers and session JSON into; Beatport is a table of
 * what the introspection says about each token.
 */

const T0 = Date.parse("2026-03-01T12:00:00Z");
const HOUR = 3600_000;

class FakeSurface implements SignInSurface {
  bearer: Array<(t: string) => void> = [];
  closedListeners: Array<() => void> = [];
  session: unknown = null;
  closed = false;
  onBearer(l: (t: string) => void) {
    this.bearer.push(l);
  }
  onClosed(l: () => void) {
    this.closedListeners.push(l);
  }
  async fetchSessionJson() {
    return this.session;
  }
  close() {
    this.closed = true;
    for (const l of this.closedListeners) l();
  }
  sendBearer(token: string) {
    for (const l of this.bearer) l(token);
  }
}

class FakeHost implements SignInHost {
  opened: Array<{ visible: boolean; surface: FakeSurface }> = [];
  cleared = 0;
  /** Runs when a window opens, to script what the page does. */
  onOpen: (surface: FakeSurface, visible: boolean) => void = () => undefined;
  open({ visible }: { visible: boolean }) {
    const surface = new FakeSurface();
    this.opened.push({ visible, surface });
    queueMicrotask(() => this.onOpen(surface, visible));
    return surface;
  }
  async clearData() {
    this.cleared += 1;
  }
}

class FakeStore implements TokenStoreLike {
  value: StoredBeatportToken | null = null;
  secure = true;
  saves = 0;
  isSecure() {
    return this.secure;
  }
  load() {
    return this.value;
  }
  save(stored: StoredBeatportToken) {
    this.value = stored;
    this.saves += 1;
    return this.secure;
  }
  clear() {
    this.value = null;
  }
}

class FakeEngine implements EnginePort {
  session: Array<string | null> = [];
  legacy: string | null = null;
  blanked = 0;
  async setSession(token: string | null) {
    this.session.push(token);
  }
  async takeLegacy() {
    return { token: this.legacy };
  }
  async blankLegacy() {
    this.blanked += 1;
    this.legacy = null;
  }
}

interface Introspection {
  status?: number;
  body?: unknown;
}

function setup(table: Record<string, Introspection> = {}) {
  const host = new FakeHost();
  const store = new FakeStore();
  const engine = new FakeEngine();
  const broadcasts: BeatportAuthStatus[] = [];
  const seenTokens: string[] = [];
  const introspected: string[] = [];
  let env = false;
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const bearer = String((init?.headers as Record<string, string>).Authorization).replace("Bearer ", "");
    introspected.push(bearer);
    const entry = table[bearer] ?? { status: 401 };
    return new Response(JSON.stringify(entry.body ?? {}), { status: entry.status ?? 200 });
  });
  const auth = new BeatportAuth({
    host,
    store,
    engine,
    fetch: fetchImpl as unknown as typeof fetch,
    apiBase: "https://api.beatport.com/v4",
    envTokenSet: () => env,
    broadcast: (s) => broadcasts.push(s),
    onToken: (t) => seenTokens.push(t),
  });
  return {
    auth,
    host,
    store,
    engine,
    broadcasts,
    seenTokens,
    introspected,
    fetchImpl,
    setEnv: (value: boolean) => {
      env = value;
    },
  };
}

const user = (exp: number, extra: Record<string, unknown> = {}) => ({
  body: { active: true, username: "anna", exp: Math.floor(exp / 1000), ...extra },
});

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("signing in", () => {
  it("takes a token from the API header, checks it, stores it and closes the window", async () => {
    const t = setup({ "user-token-abcd": user(T0 + 10 * HOUR) });
    t.host.onOpen = (surface) => surface.sendBearer("user-token-abcd");

    const status = await t.auth.signIn();

    expect(t.host.opened).toHaveLength(1);
    expect(t.host.opened[0]!.visible).toBe(true);
    expect(t.host.opened[0]!.surface.closed).toBe(true);
    expect(t.introspected).toEqual(["user-token-abcd"]);
    expect(t.store.value).toEqual({
      token: "user-token-abcd",
      expires_at: new Date(T0 + 10 * HOUR).toISOString(),
      source: "signin",
    });
    expect(t.engine.session).toEqual(["user-token-abcd"]);
    expect(status).toEqual({
      state: "signed_in",
      masked: "••••abcd",
      expires_at: new Date(T0 + 10 * HOUR).toISOString(),
      secure_storage: true,
    });
    expect(t.broadcasts.at(-1)).toEqual(status);
    expect(t.seenTokens).toContain("user-token-abcd");
  });

  it("takes a token from the website's session JSON when no header shows", async () => {
    const t = setup({ "from-session-wxyz": user(T0 + 9 * HOUR) });
    t.host.onOpen = (surface) => {
      surface.session = { user: { name: "anna" }, accessToken: "from-session-wxyz" };
    };

    const run = t.auth.signIn();
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS + 10);
    const status = await run;

    expect(status.state).toBe("signed_in");
    expect(t.store.value?.token).toBe("from-session-wxyz");
    expect(t.engine.session).toEqual(["from-session-wxyz"]);
  });

  it("reads the expiry from the session JSON when the introspection gives none", async () => {
    const t = setup({ "from-session-wxyz": { body: { active: true, user_id: 7 } } });
    t.host.onOpen = (surface) => {
      surface.session = { access_token: "from-session-wxyz", expires: "2026-03-01T20:00:00Z" };
    };
    const run = t.auth.signIn();
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS + 10);
    await run;
    expect(t.store.value?.expires_at).toBe("2026-03-01T20:00:00.000Z");
  });

  it("ignores a guest token and waits for the user's", async () => {
    const t = setup({
      "guest-token-0000": { body: { active: true, scope: "guest" } },
      "user-token-1111": user(T0 + 10 * HOUR),
    });
    t.host.onOpen = (surface) => {
      surface.sendBearer("guest-token-0000");
      setTimeout(() => surface.sendBearer("user-token-1111"), 5000);
    };

    const run = t.auth.signIn();
    await vi.advanceTimersByTimeAsync(100);
    expect(t.store.value).toBeNull();
    expect(t.engine.session).toEqual([]);
    expect(t.host.opened[0]!.surface.closed).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    const status = await run;
    expect(status.state).toBe("signed_in");
    expect(t.store.value?.token).toBe("user-token-1111");
    expect(t.introspected).toEqual(["guest-token-0000", "user-token-1111"]);
  });

  it("checks each token once, however often the site repeats it", async () => {
    const t = setup({ "guest-token-0000": { body: { active: true } } });
    t.host.onOpen = (surface) => {
      for (let i = 0; i < 5; i++) surface.sendBearer("guest-token-0000");
      surface.session = { access_token: "guest-token-0000" };
    };
    void t.auth.signIn();
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS * 3);
    expect(t.introspected).toEqual(["guest-token-0000"]);
  });

  it("asks again about a token it could not check", async () => {
    const t = setup();
    let calls = 0;
    t.fetchImpl.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return new Response(JSON.stringify({ active: true, username: "anna" }), { status: 200 });
    });
    t.host.onOpen = (surface) => {
      surface.session = { access_token: "flaky-token-9999" };
    };
    const run = t.auth.signIn();
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS * 2 + 10);
    expect((await run).state).toBe("signed_in");
    expect(calls).toBe(2);
  });

  it("stays signed out when the window is closed first", async () => {
    const t = setup();
    t.host.onOpen = (surface) => queueMicrotask(() => surface.close());
    const status = await t.auth.signIn();
    expect(status.state).toBe("signed_out");
    expect(t.store.saves).toBe(0);
    expect(t.engine.session).toEqual([]);
  });

  it("shares one window between two calls", async () => {
    const t = setup({ "user-token-abcd": user(T0 + HOUR) });
    t.host.onOpen = (surface) => surface.sendBearer("user-token-abcd");
    await Promise.all([t.auth.signIn(), t.auth.signIn()]);
    expect(t.host.opened).toHaveLength(1);
  });

  it("opens nothing when the environment holds the token", async () => {
    const t = setup();
    t.setEnv(true);
    const status = await t.auth.signIn();
    expect(status.state).toBe("env");
    expect(t.host.opened).toHaveLength(0);
  });

  it("still reports signed in when the engine cannot be told", async () => {
    const t = setup({ "user-token-abcd": user(T0 + HOUR) });
    t.engine.setSession = async () => {
      throw new Error("engine down");
    };
    t.host.onOpen = (surface) => surface.sendBearer("user-token-abcd");
    expect((await t.auth.signIn()).state).toBe("signed_in");
  });
});

describe("which token is a user's", () => {
  it("takes the user's token when the anonymous one arrives first", async () => {
    const t = setup({
      "anon-token-0000": {
        body: {
          active: true,
          scope: "app:prostore user:anon",
          user_id: { id: 1, name: "x" },
          username: "x",
          exp: null,
        },
      },
      "user-token-1111": user(T0 + 10 * HOUR, { scope: "app:prostore user:dj" }),
    });
    t.host.onOpen = (surface) => {
      surface.sendBearer("anon-token-0000");
      setTimeout(() => surface.sendBearer("user-token-1111"), 1000);
    };
    const run = t.auth.signIn();
    await vi.advanceTimersByTimeAsync(1500);
    expect((await run).state).toBe("signed_in");
    expect(t.store.value?.token).toBe("user-token-1111");
    expect(t.introspected).toEqual(["anon-token-0000", "user-token-1111"]);
  });
});

describe("when the introspection gives no end", () => {
  it("falls back to expires_in, then the session JSON, then a default hour", async () => {
    const withIn = setup({ "tok-in-aaaa": { body: { active: true, username: "a", exp: null, expires_in: 7200 } } });
    withIn.host.onOpen = (s) => s.sendBearer("tok-in-aaaa");
    await withIn.auth.signIn();
    expect(withIn.store.value?.expires_at).toBe(new Date(T0 + 7200_000).toISOString());

    const viaSession = setup({ "tok-ses-bbbb": { body: { active: true, username: "a", exp: null } } });
    viaSession.host.onOpen = (s) => {
      s.sendBearer("tok-ses-bbbb");
      s.session = { user: { accessToken: "tok-ses-bbbb", accessTokenExpires: "2026-03-01T18:00:00Z" } };
    };
    // The poll also finds the token; either path ends with the session's end for it.
    await viaSession.auth.signIn();
    expect(viaSession.store.value?.expires_at).toBe("2026-03-01T18:00:00.000Z");

    const bare = setup({ "tok-bare-cccc": { body: { active: true, username: "a", exp: null } } });
    bare.host.onOpen = (s) => s.sendBearer("tok-bare-cccc");
    await bare.auth.signIn();
    expect(bare.store.value?.expires_at).toBe(new Date(T0 + HOUR).toISOString());
    // A renewal probe is therefore always on the calendar.
    bare.host.opened.length = 0;
    await vi.advanceTimersByTimeAsync(HOUR - 10 * 60_000 + 1000);
    expect(bare.host.opened).toHaveLength(1);
  });

  it("reads the end of a JWT-shaped token", async () => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor((T0 + 5 * HOUR) / 1000) })).toString("base64url");
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
    const t = setup({ [jwt]: { body: { active: true, username: "a", exp: null } } });
    t.host.onOpen = (s) => s.sendBearer(jwt);
    await t.auth.signIn();
    expect(t.store.value?.expires_at).toBe(new Date(T0 + 5 * HOUR).toISOString());
  });
});

describe("a sign-out or a paste while a token is being checked", () => {
  it("wins: the token that was being checked is not stored", async () => {
    const t = setup({ "user-token-abcd": user(T0 + HOUR) });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = t.fetchImpl.getMockImplementation()!;
    t.fetchImpl.mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });
    t.host.onOpen = (s) => s.sendBearer("user-token-abcd");

    const run = t.auth.signIn();
    await vi.advanceTimersByTimeAsync(10);
    await t.auth.signOut();
    release();
    await run;

    expect(t.store.value).toBeNull();
    expect(t.engine.session.at(-1)).toBeNull();
    expect(t.auth.status().state).toBe("signed_out");

    // The same for a pasted token.
    const p = setup({ "user-token-abcd": user(T0 + HOUR) });
    let release2!: () => void;
    const gate2 = new Promise<void>((resolve) => {
      release2 = resolve;
    });
    const original2 = p.fetchImpl.getMockImplementation()!;
    p.fetchImpl.mockImplementation(async (...args) => {
      await gate2;
      return original2(...args);
    });
    p.host.onOpen = (s) => s.sendBearer("user-token-abcd");
    const run2 = p.auth.signIn();
    await vi.advanceTimersByTimeAsync(10);
    await p.auth.savePastedToken("pasted-token-1234");
    release2();
    await run2;
    expect(p.store.value?.token).toBe("pasted-token-1234");
  });
});

describe("engine pushes and sign-in calls", () => {
  it("sends what the store holds when the push goes out, one push at a time", async () => {
    const t = setup();
    const slow: Array<() => void> = [];
    t.engine.setSession = vi.fn((token: string | null) => {
      t.engine.session.push(token);
      return new Promise<void>((resolve) => slow.push(resolve));
    }) as never;
    const first = t.auth.savePastedToken("pasted-token-1111");
    const second = t.auth.signOut();
    await vi.advanceTimersByTimeAsync(10);
    // Signed out before the first push left: it carries the store's state, not the paste.
    expect(t.engine.session).toEqual([null]);
    expect(slow).toHaveLength(1);
    slow.shift()!();
    await vi.advanceTimersByTimeAsync(10);
    expect(t.engine.session).toEqual([null, null]);
    slow.shift()!();
    await Promise.all([first, second]);
  });

  it("joins the renewal that is running instead of opening a second window", async () => {
    const t = setup({ "first-token-aaaa": user(T0 + HOUR) });
    t.host.onOpen = (s) => s.sendBearer("first-token-aaaa");
    await t.auth.signIn();
    t.host.opened.length = 0;
    t.host.onOpen = () => undefined;
    const renewing = t.auth.refreshNow();
    const joined = t.auth.signIn();
    await vi.advanceTimersByTimeAsync(REFRESH_WAIT_MS + 10);
    await Promise.all([renewing, joined]);
    expect(t.host.opened).toHaveLength(1);
    expect(t.host.opened[0]!.visible).toBe(false);
  });

  it("dispose closes a hidden renewal window", async () => {
    const t = setup({ "first-token-aaaa": user(T0 + HOUR) });
    t.host.onOpen = (s) => s.sendBearer("first-token-aaaa");
    await t.auth.signIn();
    t.host.opened.length = 0;
    t.host.onOpen = () => undefined;
    void t.auth.refreshNow();
    await vi.advanceTimersByTimeAsync(10);
    t.auth.dispose();
    expect(t.host.opened[0]!.surface.closed).toBe(true);
  });

  it("tries the migration again at the next start when it failed", async () => {
    const t = setup();
    let fail = true;
    t.engine.takeLegacy = async () => {
      if (fail) throw new Error("engine down");
      return { token: "legacy-token-7777" };
    };
    await t.auth.onEngineStarted();
    fail = false;
    await t.auth.onEngineStarted();
    expect(t.store.value?.token).toBe("legacy-token-7777");
  });
});

describe("renewing", () => {
  async function signedIn() {
    const t = setup({
      "first-token-aaaa": user(T0 + 10 * HOUR),
      "second-token-bbbb": user(T0 + 20 * HOUR),
    });
    t.host.onOpen = (surface) => surface.sendBearer("first-token-aaaa");
    await t.auth.signIn();
    t.host.opened.length = 0;
    return t;
  }

  it("opens a hidden window ten minutes before the end and takes the new token", async () => {
    const t = await signedIn();
    t.host.onOpen = (surface, visible) => {
      expect(visible).toBe(false);
      // The site first repeats the old token, then renews it.
      surface.sendBearer("first-token-aaaa");
      setTimeout(() => surface.sendBearer("second-token-bbbb"), 3000);
    };

    await vi.advanceTimersByTimeAsync(10 * HOUR - 10 * 60_000 - 1000);
    expect(t.host.opened).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.host.opened).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4000);

    expect(t.store.value?.token).toBe("second-token-bbbb");
    expect(t.engine.session.at(-1)).toBe("second-token-bbbb");
    expect(t.host.opened[0]!.surface.closed).toBe(true);
    expect(t.auth.status().state).toBe("signed_in");
    // The old token was not asked about again.
    expect(t.introspected.filter((x) => x === "first-token-aaaa")).toHaveLength(1);
  });

  it("is not expired while the old token still has time: it looks again just after its real end", async () => {
    const t = await signedIn();
    // The site only ever repeats the old token.
    t.host.onOpen = (surface) => surface.sendBearer("first-token-aaaa");

    await vi.advanceTimersByTimeAsync(10 * HOUR - 10 * 60_000 + REFRESH_WAIT_MS + 100);
    expect(t.auth.status().state).toBe("signed_in");
    expect(t.host.opened).toHaveLength(1);
    expect(t.host.opened[0]!.surface.closed).toBe(true);

    // A new token appears at the second look, after the real end.
    t.host.onOpen = (surface) => surface.sendBearer("second-token-bbbb");
    await vi.advanceTimersByTimeAsync(10 * 60_000 + RETRY_AFTER_END_MS[0]!);
    expect(t.host.opened).toHaveLength(2);
    expect(t.store.value?.token).toBe("second-token-bbbb");
    expect(t.auth.status().state).toBe("signed_in");
  });

  it("is expired only when nothing new has come after the real end, then keeps trying", async () => {
    const t = await signedIn();
    t.host.onOpen = (surface) => surface.sendBearer("first-token-aaaa");

    // First look (before the end), then the look 2 minutes after the end.
    await vi.advanceTimersByTimeAsync(10 * HOUR + RETRY_AFTER_END_MS[0]! + REFRESH_WAIT_MS + 100);
    expect(t.host.opened).toHaveLength(2);
    expect(t.auth.status().state).toBe("expired");
    expect(t.broadcasts.at(-1)!.state).toBe("expired");

    // Later looks: +10 min, +30 min, then no more.
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_END_MS[1]! + REFRESH_WAIT_MS);
    expect(t.host.opened).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_END_MS[2]! + REFRESH_WAIT_MS);
    expect(t.host.opened).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(t.host.opened).toHaveLength(4);
  });

  it("does not take a guest token as a renewal", async () => {
    const t = await signedIn();
    t.fetchImpl.mockImplementation(async () => new Response(JSON.stringify({ active: true }), { status: 200 }));
    t.host.onOpen = (surface) => surface.sendBearer("guest-token-0000");
    await vi.advanceTimersByTimeAsync(10 * HOUR);
    expect(t.auth.status().state).toBe("expired");
    expect(t.store.value?.token).toBe("first-token-aaaa");
  });

  it("signs in again from expired", async () => {
    const t = await signedIn();
    t.host.onOpen = () => undefined;
    await vi.advanceTimersByTimeAsync(10 * HOUR);
    expect(t.auth.status().state).toBe("expired");

    t.host.onOpen = (surface) => surface.sendBearer("second-token-bbbb");
    const status = await t.auth.signIn();
    expect(status.state).toBe("signed_in");
    expect(t.store.value?.token).toBe("second-token-bbbb");
  });

  it("schedules a renewal for a token stored by an earlier launch", async () => {
    const t = setup({ "second-token-bbbb": user(T0 + 20 * HOUR) });
    t.store.value = { token: "first-token-aaaa", expires_at: new Date(T0 + HOUR).toISOString(), source: "signin" };
    t.host.onOpen = (surface) => surface.sendBearer("second-token-bbbb");
    t.auth.init();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(t.store.value?.token).toBe("second-token-bbbb");
  });

  it("never renews a pasted token", async () => {
    const t = setup();
    await t.auth.savePastedToken("pasted-token-1234");
    await vi.advanceTimersByTimeAsync(48 * HOUR);
    expect(t.host.opened).toHaveLength(0);
    expect(t.auth.status().state).toBe("pasted");
  });
});

describe("signing out", () => {
  it("clears the store, the partition and the engine, and says so", async () => {
    const t = setup({ "user-token-abcd": user(T0 + 10 * HOUR) });
    t.host.onOpen = (surface) => surface.sendBearer("user-token-abcd");
    await t.auth.signIn();
    t.broadcasts.length = 0;

    const status = await t.auth.signOut();

    expect(status.state).toBe("signed_out");
    expect(t.store.value).toBeNull();
    expect(t.host.cleared).toBe(1);
    expect(t.engine.session.at(-1)).toBeNull();
    expect(t.broadcasts).toEqual([status]);

    // No renewal is left waiting.
    t.host.opened.length = 0;
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(t.host.opened).toHaveLength(0);
  });

  it("closes a window that is open", async () => {
    const t = setup();
    const run = t.auth.signIn();
    await vi.advanceTimersByTimeAsync(10);
    await t.auth.signOut();
    expect((await run).state).toBe("signed_out");
    expect(t.host.opened[0]!.surface.closed).toBe(true);
  });
});

describe("a pasted token", () => {
  it("is stored as pasted, handed to the engine, and answered with a status only", async () => {
    const t = setup();
    const status = await t.auth.savePastedToken("  pasted-token-1234  ");
    expect(t.store.value).toEqual({ token: "pasted-token-1234", expires_at: null, source: "pasted" });
    expect(t.engine.session).toEqual(["pasted-token-1234"]);
    expect(status).toEqual({ state: "pasted", masked: "••••1234", expires_at: null, secure_storage: true });
    expect(JSON.stringify(status)).not.toContain("pasted-token-1234");
    expect(t.broadcasts).toEqual([status]);
  });

  it("an empty one removes the token", async () => {
    const t = setup();
    await t.auth.savePastedToken("pasted-token-1234");
    const status = await t.auth.savePastedToken("   ");
    expect(status.state).toBe("signed_out");
    expect(t.store.value).toBeNull();
    expect(t.engine.session.at(-1)).toBeNull();
  });

  it("refuses what is not text", async () => {
    const t = setup();
    await expect(t.auth.savePastedToken(42)).rejects.toThrow("text");
    await expect(t.auth.savePastedToken("x".repeat(9000))).rejects.toThrow("too long");
  });

  it("is reported as unsecured when storage cannot keep it", async () => {
    const t = setup();
    t.store.secure = false;
    expect((await t.auth.savePastedToken("pasted-token-1234")).secure_storage).toBe(false);
  });
});

describe("when the engine starts", () => {
  it("hands over the stored token every time", async () => {
    const t = setup();
    t.store.value = { token: "stored-token-5555", expires_at: null, source: "pasted" };
    await t.auth.onEngineStarted();
    await t.auth.onEngineStarted();
    expect(t.engine.session).toEqual(["stored-token-5555", "stored-token-5555"]);
  });

  it("hands over nothing when signed out", async () => {
    const t = setup();
    await t.auth.onEngineStarted();
    expect(t.engine.session).toEqual([]);
  });

  it("moves a legacy token once: save, blank the file, then push", async () => {
    const t = setup();
    t.engine.legacy = "legacy-token-7777";
    const order: string[] = [];
    const save = t.store.save.bind(t.store);
    t.store.save = (s) => {
      order.push("save");
      return save(s);
    };
    const blank = t.engine.blankLegacy.bind(t.engine);
    t.engine.blankLegacy = async () => {
      order.push("blank");
      return blank();
    };
    const push = t.engine.setSession.bind(t.engine);
    t.engine.setSession = async (token) => {
      order.push("push");
      return push(token);
    };

    await t.auth.onEngineStarted();

    expect(order).toEqual(["save", "blank", "push"]);
    expect(t.store.value).toEqual({ token: "legacy-token-7777", expires_at: null, source: "pasted" });
    expect(t.engine.session).toEqual(["legacy-token-7777"]);
    expect(t.auth.status().state).toBe("pasted");
  });

  it("leaves the config file alone without secure storage", async () => {
    const t = setup();
    t.store.secure = false;
    t.engine.legacy = "legacy-token-7777";
    await t.auth.onEngineStarted();
    expect(t.engine.blanked).toBe(0);
    expect(t.engine.legacy).toBe("legacy-token-7777");
    expect(t.store.value).toBeNull();
  });

  it("does not blank the file when the token did not reach secure storage", async () => {
    const t = setup();
    t.store.save = () => false;
    t.engine.legacy = "legacy-token-7777";
    await t.auth.onEngineStarted();
    expect(t.engine.blanked).toBe(0);
  });

  it("finishes a migration that stopped half way, and keeps a newer sign-in while blanking the file", async () => {
    const half = setup();
    half.store.value = { token: "legacy-token-7777", expires_at: null, source: "pasted" };
    half.engine.legacy = "legacy-token-7777";
    await half.auth.migrateLegacyToken();
    expect(half.engine.blanked).toBe(1);

    const newer = setup();
    newer.store.value = { token: "signed-in-token-1", expires_at: null, source: "signin" };
    newer.engine.legacy = "legacy-token-7777";
    await newer.auth.migrateLegacyToken();
    expect(newer.store.value.token).toBe("signed-in-token-1");
    // The file's copy is stale either way and does not stay behind in the clear.
    expect(newer.engine.blanked).toBe(1);
  });

  it("runs the migration once per launch", async () => {
    const t = setup();
    const take = vi.spyOn(t.engine, "takeLegacy");
    await t.auth.onEngineStarted();
    await t.auth.onEngineStarted();
    expect(take).toHaveBeenCalledTimes(1);
  });

  it("carries on when the migration fails", async () => {
    const t = setup();
    t.store.value = { token: "stored-token-5555", expires_at: null, source: "pasted" };
    t.engine.takeLegacy = async () => {
      throw new Error("engine down");
    };
    await t.auth.onEngineStarted();
    expect(t.engine.session).toEqual(["stored-token-5555"]);
  });
});

describe("the sign-in window's rules", () => {
  type Handler = (...args: never[]) => unknown;
  function fakeElectron(packaged: boolean) {
    const windows: Array<{
      options: Record<string, unknown>;
      contents: {
        handlers: Map<string, Handler>;
        openHandler: ((d: { url: string }) => { action: string; overrideBrowserWindowOptions?: Record<string, unknown> }) | null;
      };
      loaded: string[];
    }> = [];
    class FakeWindow {
      static last: FakeWindow;
      loaded: string[] = [];
      webContents: {
        handlers: Map<string, Handler>;
        openHandler: ((d: { url: string }) => { action: string; overrideBrowserWindowOptions?: Record<string, unknown> }) | null;
        setWindowOpenHandler: (h: never) => void;
        on: (name: string, h: Handler) => void;
      };
      constructor(public options: Record<string, unknown>) {
        const handlers = new Map<string, Handler>();
        this.webContents = {
          handlers,
          openHandler: null,
          setWindowOpenHandler(h) {
            this.openHandler = h as never;
          },
          on(name, h) {
            handlers.set(name, h);
          },
        };
        windows.push(this as never);
        FakeWindow.last = this;
      }
      closedListeners: Array<() => void> = [];
      removeMenu() {}
      on(name: string, listener: () => void) {
        if (name === "closed") this.closedListeners.push(listener);
      }
      isDestroyed() {
        return false;
      }
      close() {
        for (const listener of this.closedListeners) listener();
      }
      async loadURL(url: string) {
        this.loaded.push(url);
      }
    }
    const sessionHandlers = new Map<string, (...args: never[]) => unknown>();
    const permission: { request?: (c: (ok: boolean) => void) => void; check?: () => boolean } = {};
    const filters: unknown[] = [];
    const session = {
      setPermissionRequestHandler: (h: (a: unknown, b: unknown, cb: (ok: boolean) => void) => void) => {
        permission.request = (cb) => h(null, "media", cb);
      },
      setPermissionCheckHandler: (h: () => boolean) => {
        permission.check = h;
      },
      webRequest: {
        onBeforeSendHeaders: (filter: unknown, listener: unknown) => filters.push({ filter, listener }),
      },
      on: (name: string, handler: (...args: never[]) => unknown) => sessionHandlers.set(name, handler),
      fetch: vi.fn(),
    };
    return { FakeWindow, windows, session, sessionHandlers, permission, filters, packaged };
  }

  async function host(packaged: boolean) {
    const { ElectronSignInHost } = await import("./beatportAuth");
    const { beatportEndpoints } = await import("./beatportAuthRules");
    const fake = fakeElectron(packaged);
    const endpoints = beatportEndpoints({}, { packaged, e2e: false });
    const h = new ElectronSignInHost({
      BrowserWindow: fake.FakeWindow as never,
      session: fake.session as never,
      parent: () => ({ id: 1 }) as never,
      packaged,
      endpoints,
    });
    return { h, fake, endpoints };
  }

  it("is sandboxed, isolated, in its own partition, without a preload", async () => {
    const { h, fake, endpoints } = await host(true);
    h.open({ visible: true });
    const options = fake.windows[0]!.options as { modal: boolean; webPreferences: Record<string, unknown>; width: number; height: number };
    expect(options.modal).toBe(true);
    expect([options.width, options.height]).toEqual([480, 720]);
    expect(options.webPreferences).toMatchObject({
      partition: "persist:beatport-signin",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
    });
    expect(options.webPreferences).not.toHaveProperty("preload");
    expect(fake.FakeWindow.last.loaded).toEqual([endpoints.signInUrl]);
  });

  it("keeps developer tools only in an unpackaged build, and a hidden window is not modal", async () => {
    const { h, fake } = await host(false);
    h.open({ visible: false });
    const options = fake.windows[0]!.options as { show: boolean; modal?: boolean; webPreferences: { devTools: boolean } };
    expect(options.webPreferences.devTools).toBe(true);
    expect(options.show).toBe(false);
    expect(options.modal).toBeUndefined();
  });

  it("denies every permission", async () => {
    const { fake } = await host(true);
    const answers: boolean[] = [];
    fake.permission.request!((ok) => answers.push(ok));
    expect(answers).toEqual([false]);
    expect(fake.permission.check!()).toBe(false);
  });

  it("listens to the API's requests on this partition only", async () => {
    const { fake, endpoints } = await host(true);
    expect(fake.filters).toHaveLength(1);
    expect((fake.filters[0] as { filter: unknown }).filter).toEqual({ urls: [`${endpoints.apiBase}/*`] });
  });

  it("cancels a navigation or redirect to a page that is not allowed", async () => {
    const { h, fake } = await host(true);
    h.open({ visible: true });
    for (const name of ["will-navigate", "will-redirect"]) {
      const handler = fake.FakeWindow.last.webContents.handlers.get(name) as unknown as (e: { preventDefault: () => void }, url: string) => void;
      const refused = vi.fn();
      handler({ preventDefault: refused }, "https://evil.example/");
      handler({ preventDefault: refused }, "http://www.beatport.com/");
      expect(refused).toHaveBeenCalledTimes(2);
      const allowed = vi.fn();
      handler({ preventDefault: allowed }, "https://account.beatport.com/login");
      handler({ preventDefault: allowed }, "https://accounts.google.com/o/oauth2/auth");
      expect(allowed).not.toHaveBeenCalled();
    }
  });

  it("allows a popup only to an allowed page, in the same partition, with no preload", async () => {
    const { h, fake } = await host(true);
    h.open({ visible: true });
    const open = fake.FakeWindow.last.webContents.openHandler!;
    expect(open({ url: "https://evil.example/" })).toEqual({ action: "deny" });
    expect(open({ url: "javascript:alert(1)" })).toEqual({ action: "deny" });
    const popup = open({ url: "https://accounts.google.com/o/oauth2/auth" });
    expect(popup.action).toBe("allow");
    expect(popup.overrideBrowserWindowOptions!.webPreferences).toMatchObject({
      partition: "persist:beatport-signin",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    expect(popup.overrideBrowserWindowOptions!.webPreferences).not.toHaveProperty("preload");
  });

  it("allows no popup at all from a hidden window", async () => {
    const { h, fake } = await host(true);
    h.open({ visible: false });
    expect(fake.FakeWindow.last.webContents.openHandler!({ url: "https://accounts.google.com/" })).toEqual({ action: "deny" });
  });

  it("passes the bearer on to the window that is open and changes nothing", async () => {
    const { h, fake } = await host(true);
    const surface = h.open({ visible: true });
    const seen: string[] = [];
    surface.onBearer((t) => seen.push(t));
    const listener = (fake.filters[0] as { listener: (d: unknown, cb: (r: unknown) => void) => void }).listener;
    const callback = vi.fn();
    const headers = { Authorization: "Bearer from-the-wire-1234" };
    listener({ requestHeaders: headers }, callback);
    expect(seen).toEqual(["from-the-wire-1234"]);
    expect(callback).toHaveBeenCalledWith({ requestHeaders: headers });
  });

  it("cancels every download", async () => {
    const { fake } = await host(true);
    const event = { preventDefault: vi.fn() };
    (fake.sessionHandlers.get("will-download") as unknown as (e: typeof event) => void)(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("allows an about:blank popup, whose navigation is then checked", async () => {
    const { h, fake } = await host(true);
    h.open({ visible: true });
    const contents = fake.FakeWindow.last.webContents;
    expect(contents.openHandler!({ url: "about:blank" }).action).toBe("allow");

    const child = fakePopup();
    (contents.handlers.get("did-create-window") as unknown as (c: unknown) => void)(child);
    const navigate = child.webContents.handlers.get("will-navigate") as unknown as (
      e: { preventDefault: () => void },
      url: string,
    ) => void;
    const refused = vi.fn();
    navigate({ preventDefault: refused }, "https://evil.example/");
    expect(refused).toHaveBeenCalledOnce();
    const allowed = vi.fn();
    navigate({ preventDefault: allowed }, "https://accounts.google.com/signin");
    expect(allowed).not.toHaveBeenCalled();
  });

  it("denies about:blank from a hidden window", async () => {
    const { h, fake } = await host(true);
    h.open({ visible: false });
    expect(fake.FakeWindow.last.webContents.openHandler!({ url: "about:blank" })).toEqual({ action: "deny" });
  });

  it("closes the popups it opened when the sign-in is closed", async () => {
    const { h, fake } = await host(true);
    const surface = h.open({ visible: true });
    const child = fakePopup();
    (fake.FakeWindow.last.webContents.handlers.get("did-create-window") as unknown as (c: unknown) => void)(child);
    surface.close();
    expect(child.close).toHaveBeenCalled();
  });
});

function fakePopup() {
  const handlers = new Map<string, Handler>();
  return {
    close: vi.fn(),
    isDestroyed: () => false,
    on: vi.fn(),
    webContents: {
      handlers,
      setWindowOpenHandler: vi.fn(),
      on: (name: string, h: Handler) => handlers.set(name, h),
    },
  };
}
type Handler = (...args: never[]) => unknown;

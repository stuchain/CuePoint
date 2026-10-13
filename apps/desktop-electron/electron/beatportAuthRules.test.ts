import { describe, expect, it } from "vitest";

import {
  REFRESH_FLOOR_MS,
  REFRESH_LEAD_MS,
  authState,
  beatportEndpoints,
  bearerFrom,
  introspectExpiresAt,
  isAllowedSignInUrl,
  introspectVerdict,
  sessionUserScope,
  jwtExpiresAt,
  maskToken,
  refreshDelay,
  isSignedOutSession,
  rebaseSessionExpiry,
  tokenFromSessionJson,
  type StoredBeatportToken,
} from "./beatportAuthRules";

describe("bearerFrom", () => {
  it("reads the Authorization header in any case", () => {
    expect(bearerFrom({ Authorization: "Bearer abc123" })).toBe("abc123");
    expect(bearerFrom({ authorization: "Bearer abc123" })).toBe("abc123");
    expect(bearerFrom({ AUTHORIZATION: "bearer abc123" })).toBe("abc123");
  });

  it("takes the first of a list", () => {
    expect(bearerFrom({ Authorization: ["Bearer first", "Bearer second"] })).toBe("first");
  });

  it.each([
    ["no header", { "Content-Type": "x" }],
    ["a Basic header", { Authorization: "Basic abc" }],
    ["an empty bearer", { Authorization: "Bearer " }],
    ["a bearer with two words", { Authorization: "Bearer a b" }],
    ["an undefined value", { Authorization: undefined }],
  ])("is null for %s", (_name, headers) => {
    expect(bearerFrom(headers)).toBeNull();
  });

  it("is null for nothing", () => {
    expect(bearerFrom(null)).toBeNull();
    expect(bearerFrom(undefined)).toBeNull();
  });
});

describe("isAllowedSignInUrl", () => {
  it.each([
    "https://www.beatport.com/",
    "https://api.beatport.com/v4/auth/o/authorize/",
    "https://account.beatport.com/login?next=%2F",
    "https://beatport.com/",
    "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    "https://appleid.apple.com/auth/authorize",
    "https://www.facebook.com/v10.0/dialog/oauth",
    "https://facebook.com/login",
    "https://WWW.BEATPORT.COM/",
  ])("allows %s", (url) => {
    expect(isAllowedSignInUrl(url)).toBe(true);
  });

  it.each([
    "http://www.beatport.com/",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,<script>1</script>",
    "https://evil.com/",
    "https://beatport.com.evil.com/",
    "https://notbeatport.com/",
    "https://evilbeatport.com/",
    "https://www.beatport.com:8443/",
    "https://user:pw@www.beatport.com/",
    "https://m.facebook.com/",
    "https://google.com/",
    "about:blank",
    "not a url",
    "",
    null,
    undefined,
    42,
  ])("refuses %s", (url) => {
    expect(isAllowedSignInUrl(url)).toBe(false);
  });

  it("allows an exact extra origin, for a local stand-in", () => {
    expect(isAllowedSignInUrl("http://127.0.0.1:5555/login", ["http://127.0.0.1:5555"])).toBe(true);
    expect(isAllowedSignInUrl("http://127.0.0.1:5556/login", ["http://127.0.0.1:5555"])).toBe(false);
  });
});

describe("refreshDelay", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("is ten minutes before the end", () => {
    const end = new Date(now + 10 * 3600_000).toISOString();
    expect(refreshDelay(end, now)).toBe(10 * 3600_000 - REFRESH_LEAD_MS);
  });

  it("never goes below the floor", () => {
    expect(refreshDelay(new Date(now + 60_000).toISOString(), now)).toBe(REFRESH_FLOOR_MS);
    expect(refreshDelay(new Date(now - 3600_000).toISOString(), now)).toBe(REFRESH_FLOOR_MS);
  });

  it("is null with no end, or one that cannot be read", () => {
    expect(refreshDelay(null, now)).toBeNull();
    expect(refreshDelay("soon", now)).toBeNull();
    expect(refreshDelay(undefined, now)).toBeNull();
  });

  it("stays within what a timer can hold", () => {
    expect(refreshDelay(new Date(now + 400 * 86_400_000).toISOString(), now)).toBe(2 ** 31 - 1);
  });
});

describe("maskToken", () => {
  it("shows the last four", () => {
    expect(maskToken("abcdefgh")).toBe("••••efgh");
  });
  it("shows nothing of a short one", () => {
    expect(maskToken("abc")).toBe("••••");
    expect(maskToken("")).toBe("••••");
    expect(maskToken(null)).toBe("••••");
  });
});

describe("introspectVerdict", () => {
  it("says user for an active token with a username or a user id", () => {
    expect(introspectVerdict({ active: true, username: "anna", exp: 1 })).toBe("user");
    expect(introspectVerdict({ active: true, user_id: 42 })).toBe("user");
    expect(introspectVerdict({ active: true, user_id: "42" })).toBe("user");
  });

  it("regression: C20 a user token whose introspection has no `active` is still a user", () => {
    expect(introspectVerdict({ scope: "app:prostore user:dj", user_id: 123, username: "dj", exp: null })).toBe("user");
    expect(introspectVerdict({ scope: "app:prostore user:dj", user_id: { id: 5 } })).toBe("user");
  });

  it("says unknown for a guest token: active, but nobody's", () => {
    expect(introspectVerdict({ active: true, scope: "guest", client_id: "x" })).toBe("unknown");
    expect(introspectVerdict({ active: true, username: "", user_id: null })).toBe("unknown");
  });

  it("says inactive for an inactive token, however it names a user", () => {
    expect(introspectVerdict({ active: false, username: "anna" })).toBe("inactive");
    expect(introspectVerdict({ active: false, scope: "user:dj", username: "x" })).toBe("inactive");
  });

  it("does not take a non-boolean active for a yes", () => {
    expect(introspectVerdict({ active: "true", username: "anna" })).toBe("unknown");
  });

  it("says anon for the site's anonymous session, whatever else it carries", () => {
    expect(
      introspectVerdict({
        active: true,
        scope: "app:prostore user:anon",
        user_id: { id: 5, name: "x" },
        username: "x",
        exp: null,
      }),
    ).toBe("anon");
    expect(introspectVerdict({ active: true, scope: "user:anon", username: "x" })).toBe("anon");
    expect(introspectVerdict({ active: true, scope: "user:anonymous", user_id: 3 })).toBe("anon");
    expect(introspectVerdict({ scope: "app:prostore user:anon", username: "x" })).toBe("anon");
  });

  it("needs a user scope and an id when `active` is missing", () => {
    expect(introspectVerdict({ active: true })).toBe("unknown");
    expect(introspectVerdict({ scope: "user:dj" })).toBe("unknown");
    expect(introspectVerdict({ username: "anna", user_id: 3 })).toBe("unknown");
    expect(introspectVerdict({ scope: "app:prostore", username: "anna" })).toBe("unknown");
  });

  it("accepts an object user_id with a numeric id, and a real scope", () => {
    expect(introspectVerdict({ active: true, scope: "app:prostore user:dj", user_id: { id: 5 } })).toBe("user");
    expect(introspectVerdict({ active: true, user_id: { id: "x" } })).toBe("unknown");
    expect(introspectVerdict({ active: true, user_id: {} })).toBe("unknown");
  });

  it.each([null, undefined, "x", "<html>", 3, [], [{ active: true, username: "a" }]])("says unknown for %s", (value) => {
    expect(introspectVerdict(value)).toBe("unknown");
  });
});

describe("sessionUserScope", () => {
  const session = (token: Record<string, unknown> | undefined) => ({ expires: "2026-11-11T12:00:00.000Z", token });

  it("gives the token and its end when the scope names a user", () => {
    const ms = Date.parse("2026-10-12T10:12:00Z");
    expect(
      sessionUserScope(session({ accessToken: "t1", scope: "app:prostore user:dj", anon: false, accessTokenExpires: ms })),
    ).toEqual({ token: "t1", expiresAt: "2026-10-12T10:12:00.000Z" });
    expect(sessionUserScope(session({ accessToken: "t1", scope: "user:dj" }))).toEqual({ token: "t1", expiresAt: null });
  });

  it("is null for an anonymous token, an empty scope, no scope or no token", () => {
    expect(sessionUserScope(session({ accessToken: "t1", scope: "app:prostore user:dj", anon: true }))).toBeNull();
    expect(sessionUserScope(session({ accessToken: "t1", scope: "app:prostore user:anon" }))).toBeNull();
    expect(sessionUserScope(session({ accessToken: "t1", scope: "" }))).toBeNull();
    expect(sessionUserScope(session({ accessToken: "t1" }))).toBeNull();
    expect(sessionUserScope(session({ accessToken: "", scope: "user:dj" }))).toBeNull();
    expect(sessionUserScope(session({ scope: "user:dj" }))).toBeNull();
    expect(sessionUserScope(session(undefined))).toBeNull();
    expect(sessionUserScope({})).toBeNull();
    expect(sessionUserScope(null)).toBeNull();
    expect(sessionUserScope([])).toBeNull();
  });
});

describe("introspectExpiresAt", () => {
  it("turns exp seconds into an ISO date", () => {
    expect(introspectExpiresAt({ exp: 1_800_000_000 })).toBe("2027-01-15T08:00:00.000Z");
  });
  it("uses expires_in, counted from now, when there is no exp", () => {
    expect(introspectExpiresAt({ exp: null, expires_in: 600 }, 1_000_000)).toBe(new Date(1_600_000).toISOString());
  });
  it("is null without a usable exp", () => {
    expect(introspectExpiresAt({})).toBeNull();
    expect(introspectExpiresAt({ exp: "soon" })).toBeNull();
    expect(introspectExpiresAt({ exp: 0 })).toBeNull();
    expect(introspectExpiresAt(null)).toBeNull();
  });
});

describe("jwtExpiresAt", () => {
  const jwt = (payload: unknown) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
  it("reads exp from a JWT-shaped token only", () => {
    expect(jwtExpiresAt(jwt({ exp: 1_800_000_000 }))).toBe("2027-01-15T08:00:00.000Z");
    expect(jwtExpiresAt(jwt({}))).toBeNull();
    expect(jwtExpiresAt("opaque.abc.def")).toBeNull();
    expect(jwtExpiresAt("eyJbroken")).toBeNull();
  });
});

describe("tokenFromSessionJson", () => {
  const measured = (token: Record<string, unknown>) => ({
    user: { email: "anna@example.com" },
    expires: "2026-11-11T12:00:00.000Z",
    token: {
      accessToken: "user-token",
      expiresIn: 600,
      tokenType: "Bearer",
      scope: "app:prostore user:dj",
      anon: false,
      ...token,
    },
    introspect: { application_id: 1, user_id: 77, username: "anna", scope: "app:prostore user:dj", feature: [] },
  });

  it("reads the measured session shape, with accessTokenExpires in milliseconds or seconds", () => {
    const ms = Date.parse("2026-10-12T10:12:00Z");
    expect(tokenFromSessionJson(measured({ accessTokenExpires: ms }))).toEqual({
      token: "user-token",
      expiresAt: "2026-10-12T10:12:00.000Z",
      sessionExpiresAt: "2026-11-11T12:00:00.000Z",
    });
    expect(tokenFromSessionJson(measured({ accessTokenExpires: ms / 1000 }))?.expiresAt).toBe("2026-10-12T10:12:00.000Z");
  });

  it("falls back to expiresIn seconds from now when there is no accessTokenExpires", () => {
    expect(tokenFromSessionJson(measured({}), 1_000_000)?.expiresAt).toBe(new Date(1_600_000).toISOString());
  });

  it("refuses the anonymous token", () => {
    expect(tokenFromSessionJson(measured({ anon: true }))).toBeNull();
    expect(tokenFromSessionJson(measured({ scope: "app:prostore user:anon" }))).toBeNull();
  });

  it("regression: C20 a stale anonymous top-level introspect does not hide a token whose own scope is a user's", () => {
    const json = { ...measured({ scope: "app:prostore user:dj" }), introspect: { scope: "app:prostore user:anon" } };
    expect(tokenFromSessionJson(json)?.token).toBe("user-token");
  });

  it("still refuses an anonymous top-level introspect when the token has no scope of its own", () => {
    const base = measured({});
    const { scope: _scope, ...token } = base.token;
    expect(tokenFromSessionJson({ ...base, token, introspect: { scope: "app:prostore user:anon" } })).toBeNull();
  });

  it("reads accessTokenExpires, access_token_expires and a relative expires_in", () => {
    expect(tokenFromSessionJson({ user: { accessToken: "a", accessTokenExpires: "2030-01-01T00:00:00Z" } })?.expiresAt).toBe(
      "2030-01-01T00:00:00.000Z",
    );
    expect(tokenFromSessionJson({ token: { access_token: "a", access_token_expires: 1_900_000_000 } })?.expiresAt).toBe(
      "2030-03-17T17:46:40.000Z",
    );
    expect(tokenFromSessionJson({ access_token: "a", expires_in: 60 }, 1_000_000)?.expiresAt).toBe(new Date(1_060_000).toISOString());
  });

  it("never takes the top-level expires (the sign-in's end) for the token's end", () => {
    expect(tokenFromSessionJson({ expires: "2030-01-01T00:00:00Z", user: { accessToken: "a" } })).toEqual({
      token: "a",
      expiresAt: null,
      sessionExpiresAt: "2030-01-01T00:00:00.000Z",
    });
    expect(tokenFromSessionJson({ accessToken: "bbb", expires: "2030-01-01T00:00:00Z" })).toEqual({
      token: "bbb",
      expiresAt: null,
      sessionExpiresAt: "2030-01-01T00:00:00.000Z",
    });
  });

  it("finds access_token and accessToken at the top and inside a nested object", () => {
    expect(tokenFromSessionJson({ access_token: "aaa" })).toEqual({ token: "aaa", expiresAt: null, sessionExpiresAt: null });
    expect(tokenFromSessionJson({ token: { access_token: "ccc", expires_at: 1_900_000_000 } })).toEqual({
      token: "ccc",
      expiresAt: "2030-03-17T17:46:40.000Z",
      sessionExpiresAt: null,
    });
    expect(tokenFromSessionJson({ user: { accessToken: "ddd" } })?.token).toBe("ddd");
  });

  it("is null for a signed-out session or anything else", () => {
    expect(tokenFromSessionJson({})).toBeNull();
    expect(tokenFromSessionJson({ access_token: "" })).toBeNull();
    expect(tokenFromSessionJson({ access_token: 5 })).toBeNull();
    expect(tokenFromSessionJson(null)).toBeNull();
    expect(tokenFromSessionJson([{ access_token: "x" }])).toBeNull();
  });
});

describe("session clock and sign-out", () => {
  it("moves accessTokenExpires onto the local clock, seconds or milliseconds", () => {
    const json = { expires: "x", token: { accessToken: "a", accessTokenExpires: 1_800_000_000_000 } };
    expect(rebaseSessionExpiry(json, 5_000)).toEqual({
      expires: "x",
      token: { accessToken: "a", accessTokenExpires: 1_799_999_995_000 },
    });
    expect(rebaseSessionExpiry({ token: { accessTokenExpires: 1_800_000_000 } }, -2000)).toEqual({
      token: { accessTokenExpires: 1_800_000_002_000 },
    });
    expect(rebaseSessionExpiry(json, 0)).toBe(json);
    expect(rebaseSessionExpiry({}, 5000)).toEqual({});
  });

  it("knows an empty object for a session that has ended", () => {
    expect(isSignedOutSession({})).toBe(true);
    expect(isSignedOutSession(null)).toBe(false);
    expect(isSignedOutSession({ token: {} })).toBe(false);
    expect(isSignedOutSession([])).toBe(false);
  });
});

describe("authState", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const signin = (expires_at: string | null): StoredBeatportToken => ({ token: "tok-wxyz", expires_at, source: "signin" });
  const base = { envSet: false, stored: null, expired: false, secureStorage: true, now };

  it("is signed out with nothing stored", () => {
    expect(authState(base)).toEqual({ state: "signed_out", masked: null, expires_at: null, secure_storage: true });
  });

  it("is signed in with a token before its end", () => {
    const end = new Date(now + 3600_000).toISOString();
    expect(authState({ ...base, stored: signin(end) })).toEqual({
      state: "signed_in",
      masked: "••••wxyz",
      expires_at: end,
      secure_storage: true,
    });
  });

  it("is expired past the end, or after a renewal found nothing", () => {
    expect(authState({ ...base, stored: signin(new Date(now - 1).toISOString()) }).state).toBe("expired");
    expect(authState({ ...base, stored: signin(new Date(now + 3600_000).toISOString()), expired: true }).state).toBe("expired");
    expect(authState({ ...base, expired: true }).state).toBe("expired");
  });

  it("is pasted for a pasted token, whatever the time", () => {
    const pasted: StoredBeatportToken = { token: "pasted-1234", expires_at: null, source: "pasted" };
    expect(authState({ ...base, stored: pasted, expired: true })).toMatchObject({ state: "pasted", masked: "••••1234" });
  });

  it("is env when the environment holds the token, and says nothing of it", () => {
    expect(authState({ ...base, envSet: true, stored: signin(null) })).toEqual({
      state: "env",
      masked: null,
      expires_at: null,
      secure_storage: true,
    });
  });

  it("is unavailable when sign-in cannot be offered, and reports unsecured storage", () => {
    expect(authState({ ...base, unavailable: true, secureStorage: false })).toMatchObject({
      state: "unavailable",
      secure_storage: false,
    });
  });
});

describe("beatportEndpoints", () => {
  const env = {
    CUEPOINT_E2E_BEATPORT_SIGNIN_URL: "http://127.0.0.1:5001/login",
    CUEPOINT_E2E_BEATPORT_API_URL: "http://127.0.0.1:5002/v4/",
  };

  it("is Beatport's own by default", () => {
    expect(beatportEndpoints(env, { packaged: false, e2e: false })).toEqual({
      signInUrl: "https://www.beatport.com/api/auth/signin/beatport?callbackUrl=https%3A%2F%2Fwww.beatport.com%2F",
      apiBase: "https://api.beatport.com/v4",
      sessionUrl: "https://www.beatport.com/api/auth/session",
      siteUrl: "https://www.beatport.com/",
      extraOrigins: [],
    });
  });

  it("is overridden only in an end-to-end run of an unpackaged app", () => {
    expect(beatportEndpoints(env, { packaged: true, e2e: true }).apiBase).toBe("https://api.beatport.com/v4");
    expect(beatportEndpoints(env, { packaged: false, e2e: false }).signInUrl).toBe(
      "https://www.beatport.com/api/auth/signin/beatport?callbackUrl=https%3A%2F%2Fwww.beatport.com%2F",
    );
    expect(beatportEndpoints(env, { packaged: false, e2e: true })).toEqual({
      signInUrl: "http://127.0.0.1:5001/login",
      apiBase: "http://127.0.0.1:5002/v4",
      sessionUrl: "http://127.0.0.1:5001/api/auth/session",
      siteUrl: "http://127.0.0.1:5001/",
      extraOrigins: ["http://127.0.0.1:5001", "http://127.0.0.1:5002"],
    });
  });

  it("ignores an override that is not an http(s) URL", () => {
    const bad = { CUEPOINT_E2E_BEATPORT_SIGNIN_URL: "javascript:1", CUEPOINT_E2E_BEATPORT_API_URL: "nope" };
    expect(beatportEndpoints(bad, { packaged: false, e2e: true }).extraOrigins).toEqual([]);
  });
});

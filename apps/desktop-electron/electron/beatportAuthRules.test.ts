import { describe, expect, it } from "vitest";

import {
  REFRESH_FLOOR_MS,
  REFRESH_LEAD_MS,
  authState,
  beatportEndpoints,
  bearerFrom,
  introspectExpiresAt,
  isAllowedSignInUrl,
  isUserToken,
  jwtExpiresAt,
  maskToken,
  refreshDelay,
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

describe("isUserToken", () => {
  it("accepts an active token with a username or a user id", () => {
    expect(isUserToken({ active: true, username: "anna", exp: 1 })).toBe(true);
    expect(isUserToken({ active: true, user_id: 42 })).toBe(true);
    expect(isUserToken({ active: true, user_id: "42" })).toBe(true);
  });

  it("rejects a guest token: active, but nobody's", () => {
    expect(isUserToken({ active: true, scope: "guest", client_id: "x" })).toBe(false);
    expect(isUserToken({ active: true, username: "", user_id: null })).toBe(false);
  });

  it("rejects an inactive token, however it names a user", () => {
    expect(isUserToken({ active: false, username: "anna" })).toBe(false);
    expect(isUserToken({ active: "true", username: "anna" })).toBe(false);
  });

  it("rejects the site's anonymous session, whatever else it carries", () => {
    expect(
      isUserToken({
        active: true,
        scope: "app:prostore user:anon",
        user_id: { id: 5, name: "x" },
        username: "x",
        exp: null,
      }),
    ).toBe(false);
    expect(isUserToken({ active: true, scope: "user:anon", username: "x" })).toBe(false);
    expect(isUserToken({ active: true, scope: "user:anonymous", user_id: 3 })).toBe(false);
  });

  it("accepts an object user_id with a numeric id, and a real scope", () => {
    expect(isUserToken({ active: true, scope: "app:prostore user:dj", user_id: { id: 5 } })).toBe(true);
    expect(isUserToken({ active: true, user_id: { id: "x" } })).toBe(false);
    expect(isUserToken({ active: true, user_id: {} })).toBe(false);
  });

  it.each([null, undefined, "x", 3, [], [{ active: true, username: "a" }]])("rejects %s", (value) => {
    expect(isUserToken(value)).toBe(false);
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
  it("reads accessTokenExpires, access_token_expires and a relative expires_in", () => {
    expect(tokenFromSessionJson({ user: { accessToken: "a", accessTokenExpires: "2030-01-01T00:00:00Z" } })?.expiresAt).toBe(
      "2030-01-01T00:00:00.000Z",
    );
    expect(tokenFromSessionJson({ token: { access_token: "a", access_token_expires: 1_900_000_000 } })?.expiresAt).toBe(
      "2030-03-17T17:46:40.000Z",
    );
    expect(tokenFromSessionJson({ access_token: "a", expires_in: 60 }, 1_000_000)?.expiresAt).toBe(new Date(1_060_000).toISOString());
  });

  it("does not take the session's own top-level expires for a nested token", () => {
    expect(tokenFromSessionJson({ expires: "2030-01-01T00:00:00Z", user: { accessToken: "a" } })).toEqual({
      token: "a",
      expiresAt: null,
    });
  });

  it("finds access_token and accessToken at the top", () => {
    expect(tokenFromSessionJson({ access_token: "aaa" })).toEqual({ token: "aaa", expiresAt: null });
    expect(tokenFromSessionJson({ accessToken: "bbb", expires: "2030-01-01T00:00:00Z" })).toEqual({
      token: "bbb",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
  });

  it("finds it inside a nested token or user object", () => {
    expect(tokenFromSessionJson({ token: { access_token: "ccc", expires_at: 1_900_000_000 } })).toEqual({
      token: "ccc",
      expiresAt: "2030-03-17T17:46:40.000Z",
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
      signInUrl: "https://www.beatport.com/",
      apiBase: "https://api.beatport.com/v4",
      sessionUrl: "https://www.beatport.com/api/auth/session",
      extraOrigins: [],
    });
  });

  it("is overridden only in an end-to-end run of an unpackaged app", () => {
    expect(beatportEndpoints(env, { packaged: true, e2e: true }).apiBase).toBe("https://api.beatport.com/v4");
    expect(beatportEndpoints(env, { packaged: false, e2e: false }).signInUrl).toBe("https://www.beatport.com/");
    expect(beatportEndpoints(env, { packaged: false, e2e: true })).toEqual({
      signInUrl: "http://127.0.0.1:5001/login",
      apiBase: "http://127.0.0.1:5002/v4",
      sessionUrl: "http://127.0.0.1:5001/api/auth/session",
      extraOrigins: ["http://127.0.0.1:5001", "http://127.0.0.1:5002"],
    });
  });

  it("ignores an override that is not an http(s) URL", () => {
    const bad = { CUEPOINT_E2E_BEATPORT_SIGNIN_URL: "javascript:1", CUEPOINT_E2E_BEATPORT_API_URL: "nope" };
    expect(beatportEndpoints(bad, { packaged: false, e2e: true }).extraOrigins).toEqual([]);
  });
});

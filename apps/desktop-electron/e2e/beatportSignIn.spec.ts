/**
 * The Beatport sign-in, end to end (C12, C20).
 *
 * Beatport is stood in for by a local server that signs in like the real site: the sign-in URL
 * (`/login`) redirects to an authorize page with a "Sign in" button, which the test clicks as a
 * person would; the button leads to a callback that sets the session cookie and redirects home.
 * Before the click every page calls the v4 API with an anonymous `Bearer`, and the session JSON
 * holds the anonymous token; afterwards home uses the user's bearer and the session JSON holds a
 * user-scoped token, still carrying the stale anonymous top-level `introspect`. The stand-in
 * answers the token introspection in one of several shapes (`Stand.introspect`). The sign-in and API URLs are overridden through
 * `CUEPOINT_E2E_BEATPORT_SIGNIN_URL` and `CUEPOINT_E2E_BEATPORT_API_URL`, which main honours only
 * when `CUEPOINT_E2E_DISPLAY` is set and the app is unpackaged. A real Beatport page is never
 * opened.
 *
 * What is asserted: the page signs in (Settings says so, the engine sees a token), a guest token
 * is not a sign-in, signing out forgets it, and the token itself never appears in the renderer's
 * page, storage or any bridge answer.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const BEATPORT = path.join(REPO_ROOT, "src", "tests", "fixtures", "beatport", "discover", "fixture.json");

/** Long and distinctive, so finding it anywhere in the renderer is unmistakable. */
const TOKEN = "e2e-user-token-SECRETMARKER-7d41c0ab9";
const MASKED = `••••${TOKEN.slice(-4)}`;
/** What the stand-in's session endpoint rotates to, as the real site does about every 12 minutes. */
const TOKEN_2 = "e2e-user-token-ROTATED-SECRETMARKER-55e1f";
const MASKED_2 = `••••${TOKEN_2.slice(-4)}`;

type Mode = "user" | "guest";

/**
 * How the stand-in answers the introspection of the user's token:
 * - `real`: what Beatport appears to send (a user scope, ids, no `active`);
 * - `forbidden`: a 403 HTML page, as a WAF would;
 * - `html`: a 200 HTML page (a challenge), not JSON;
 * - `active`: the older, friendlier shape with `active: true`.
 */
type Introspect = "real" | "forbidden" | "html" | "active";

/** The anonymous token every page uses until the person has signed in. */
const ANON_TOKEN = "e2e-anon-token-GUEST-0c3a9";
const USERNAME = "e2e-dj";

interface Stand {
  server: Server;
  origin: string;
  /** `guest`: signing in on the page never yields a user token. */
  mode: Mode;
  introspect: Introspect;
  introspections: number;
  /** The session endpoint answers `{}` (the page is signed out) until this is set. */
  sessionOpen: boolean;
  /** The session endpoint now serves the rotated token. */
  rotated: boolean;
  sessionReads: number;
  /** Every session read waits this long before it answers. */
  sessionDelayMs: number;
  /** How many times the sign-in callback ran. */
  callbacks: number;
}

/** The stand-in: login, authorize, callback and home pages, the v4 API they call, and the website's NextAuth-shaped session JSON. */
async function startStandIn(): Promise<Stand> {
  const stand = {
    mode: "user" as Mode,
    introspect: "real" as Introspect,
    introspections: 0,
    sessionOpen: true,
    rotated: false,
    sessionReads: 0,
    sessionDelayMs: 0,
    callbacks: 0,
  } as Stand;
  const signedIn = (request: IncomingMessage) => (request.headers.cookie ?? "").includes("e2e_sid=1");
  const userToken = () => (stand.rotated ? TOKEN_2 : TOKEN);
  /** The bearer a page of the site sends: anonymous until the callback has set the cookie. */
  const pageBearer = (request: IncomingMessage) => (signedIn(request) && stand.mode === "user" ? TOKEN : ANON_TOKEN);
  const page = (title: string, body: string, bearer: string) =>
    `<!doctype html><title>${title}</title><p>${title}</p>${body}
<script>fetch("/v4/catalog/genres/", { headers: { Authorization: "Bearer ${bearer}" } });</script>`;
  const sessionJson = (request: IncomingMessage) => {
    const user = signedIn(request) && stand.mode === "user";
    return {
      user: { email: "e2e@example.com" },
      expires: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      // The site never drops the guest check it made first: it stays at the top after signing in.
      introspect: { scope: "app:prostore user:anon" },
      token: user
        ? {
            accessToken: userToken(),
            expiresIn: 70,
            tokenType: "Bearer",
            scope: "app:prostore user:dj",
            anon: false,
            // Short, so the app's first renewal falls at its 30 s floor.
            accessTokenExpires: Date.now() + (stand.rotated ? 600_000 : 70_000),
          }
        : {
            accessToken: ANON_TOKEN,
            expiresIn: 600,
            tokenType: "Bearer",
            scope: "app:prostore user:anon",
            anon: true,
            accessTokenExpires: Date.now() + 600_000,
          },
    };
  };
  stand.server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    if (url.pathname === "/login") {
      response.writeHead(302, { location: "/authorize?client_id=e2e-cuepoint&state=e2e-state-1" });
      response.end();
      return;
    }
    if (url.pathname === "/authorize") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(
        page(
          "Stand-in authorize",
          `<form method="get" action="/api/auth/callback/beatport">
<input type="hidden" name="code" value="e2e-code-1"><input type="hidden" name="state" value="${url.searchParams.get("state") ?? ""}">
<button type="submit">Sign in</button></form>`,
          pageBearer(request),
        ),
      );
      return;
    }
    if (url.pathname === "/api/auth/callback/beatport") {
      stand.callbacks += 1;
      // The cookie that the session endpoint wants, set as the site sets it on a completed sign-in.
      response.writeHead(302, { location: "/", "set-cookie": "e2e_sid=1; Path=/" });
      response.end();
      return;
    }
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      // A page that objects to being left: a close the page can cancel must still end the window.
      response.end(
        page(
          "Stand-in home",
          `<script>window.addEventListener("beforeunload", (event) => { event.preventDefault(); event.returnValue = ""; });</script>`,
          pageBearer(request),
        ),
      );
      return;
    }
    if (url.pathname === "/api/auth/session") {
      stand.sessionReads += 1;
      const answer = () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(stand.sessionOpen ? JSON.stringify(sessionJson(request)) : "{}");
      };
      if (stand.sessionDelayMs > 0) setTimeout(answer, stand.sessionDelayMs);
      else answer();
      return;
    }
    if (url.pathname === "/v4/auth/o/introspect/") {
      stand.introspections += 1;
      const bearer = request.headers.authorization ?? "";
      const json = (status: number, body: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      };
      if (bearer === `Bearer ${ANON_TOKEN}`) {
        json(200, { scope: "app:prostore user:anon", exp: null });
      } else if (![`Bearer ${TOKEN}`, `Bearer ${TOKEN_2}`].includes(bearer)) {
        json(401, { detail: "no" });
      } else if (stand.introspect === "forbidden") {
        response.writeHead(403, { "content-type": "text/html" });
        response.end("<!doctype html><title>Forbidden</title><p>Forbidden</p>");
      } else if (stand.introspect === "html") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<!doctype html><title>Checking your browser</title><p>Checking your browser</p>");
      } else if (stand.introspect === "active") {
        json(200, {
          active: true,
          scope: "user:dj",
          username: USERNAME,
          exp: Math.floor(Date.now() / 1000) + 36000,
        });
      } else {
        json(200, { scope: "app:prostore user:dj", user_id: 1, username: USERNAME, exp: null });
      }
      return;
    }
    if (url.pathname.startsWith("/v4/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("[]");
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>((resolve) => stand.server.listen(0, "127.0.0.1", resolve));
  stand.origin = `http://127.0.0.1:${(stand.server.address() as AddressInfo).port}`;
  return stand;
}

async function launch(userDataDir: string, cuepointHome: string, origin: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
    CUEPOINT_BEATPORT_FIXTURE: BEATPORT,
    CUEPOINT_E2E_BEATPORT_SIGNIN_URL: `${origin}/login`,
    CUEPOINT_E2E_BEATPORT_API_URL: `${origin}/v4`,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUEPOINT_SKIP_BEATPORT;
  delete env.BEATPORT_ACCESS_TOKEN;
  const app = await electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
  // The stand-in's home page objects to being left (beforeunload). Electron decides that itself, not
  // through a dialog, so Playwright must not try to answer one: a listener stops its automatic answer.
  app.on("window", (page) => page.on("dialog", () => undefined));
  return app;
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(
    () => (
      localStorage.setItem("cuepoint-onboarding-complete", "1"),
      localStorage.setItem("cuepoint-phase14-note-seen", "1")
    ),
  );
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

/** Everything the renderer holds that could carry a token: its page, storage and bridge answers. */
async function renderersHold(window: Page): Promise<string> {
  const html = await window.content();
  const held = await window.evaluate(async () => {
    const bridge = window.cuepoint!;
    return JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      auth: await bridge.getBeatportAuth(),
      status: await bridge.getBeatportTokenStatus(),
    });
  });
  return html + held;
}

/** Opens the sign-in window from Settings and returns it, parked on the stand-in's authorize page. */
async function openSignIn(app: ElectronApplication, window: Page, origin: string): Promise<Page> {
  await window.getByRole("link", { name: "Settings" }).click();
  await window.getByRole("button", { name: "Sign in to Beatport" }).click();
  await expect
    .poll(() => app.windows().some((candidate) => candidate.url().startsWith(`${origin}/authorize`)), {
      timeout: 30_000,
    })
    .toBe(true);
  const signInWindow = app.windows().find((candidate) => candidate.url().startsWith(origin))!;
  await expect(signInWindow.getByRole("button", { name: "Sign in" })).toBeVisible({ timeout: 15_000 });
  return signInWindow;
}

/** Clicks the page's Sign in button, as a person does. The window may close under the click, so do not wait on it. */
async function clickSignIn(signInWindow: Page): Promise<void> {
  await signInWindow
    .getByRole("button", { name: "Sign in" })
    .click({ noWaitAfter: true })
    .catch(() => undefined);
}

async function signInOnPage(app: ElectronApplication, window: Page, origin: string): Promise<void> {
  await clickSignIn(await openSignIn(app, window, origin));
}

const SIGNED_IN = (masked: string) => `Signed in to Beatport · ${masked} · renews by itself`;

test.describe("Beatport sign-in", () => {
  let userDataDir: string;
  let cuepointHome: string;
  let stand: Stand;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    stand = await startStandIn();
  });

  test.afterEach(async () => {
    stand.server.closeAllConnections?.();
    await new Promise<void>((resolve) => stand.server.close(() => resolve()));
    for (const dir of [userDataDir, cuepointHome]) rmSync(dir, { recursive: true, force: true });
  });

  test("signs in on the page, keeps the token out of the renderer, and signs out", async () => {
    stand.introspect = "active";
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Settings" }).click();
      await expect(window.getByText("Sign in to let Discover search Beatport.")).toBeVisible({ timeout: 15_000 });

      // The sign-in window opens on the authorize page; nothing is signed in until the person clicks Sign in.
      const signInWindow = await openSignIn(app, window, stand.origin);
      await expect(window.getByText("Finish signing in in the Beatport window.")).toBeVisible();
      expect(stand.callbacks).toBe(0);
      await clickSignIn(signInWindow);
      // The callback and home follow, and the window closes itself once the token checks out.
      await expect(window.getByText(SIGNED_IN(MASKED))).toBeVisible({ timeout: 30_000 });
      expect(stand.callbacks).toBe(1);
      expect(stand.introspections).toBeGreaterThan(0);
      await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBe(1);

      // The engine has a token to search with; the renderer never saw it.
      const status = await window.evaluate(() => window.cuepoint!.getBeatportTokenStatus());
      expect(status.configured).toBe(true);
      expect(await renderersHold(window)).not.toContain(TOKEN);

      // Discover no longer asks for a sign-in.
      await window.getByRole("link", { name: "Discover" }).click();
      await expect(window.getByRole("heading", { name: "Discover", level: 1 })).toBeVisible();
      // First a sign that Beatport is usable (its genres were read), then that no banner asks for a sign-in.
      await window.getByRole("tab", { name: "New search" }).click();
      await expect(
        window.getByRole("region", { name: "New search" }).getByRole("checkbox", { name: "House" }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(window.getByText("Sign in to Beatport to search its charts and releases.")).toHaveCount(0);
      await expect(window.getByRole("button", { name: "Sign in to Beatport" })).toHaveCount(0);

      await window.getByRole("link", { name: "Settings" }).click();
      await window.getByRole("button", { name: "Sign out" }).click();
      await expect(window.getByText("Sign in to let Discover search Beatport.")).toBeVisible({ timeout: 15_000 });
      expect((await window.evaluate(() => window.cuepoint!.getBeatportTokenStatus())).configured).toBe(false);
      expect(await renderersHold(window)).not.toContain(TOKEN);
    } finally {
      await app.close();
    }
  });

  test("renews the token by itself, by reading the session endpoint, with no window", async () => {
    stand.introspect = "active";
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      await signInOnPage(app, window, stand.origin);
      await expect(window.getByText(SIGNED_IN(MASKED))).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBe(1);

      // Beatport rotates the token; the app picks it up at its next read, without opening a window.
      stand.rotated = true;
      await expect(window.getByText(SIGNED_IN(MASKED_2))).toBeVisible({ timeout: 90_000 });
      expect(app.windows().length).toBe(1);
      expect(await renderersHold(window)).not.toContain(TOKEN_2);
    } finally {
      await app.close();
    }
  });

  test("signs in from the header when the session endpoint is still empty", async () => {
    stand.introspect = "active";
    stand.sessionOpen = false;
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      await signInOnPage(app, window, stand.origin);
      await expect(window.getByText(SIGNED_IN(MASKED))).toBeVisible({ timeout: 30_000 });
      expect(stand.sessionReads).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  test("a link that wants the token field lands on it, open and focused", async () => {
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      // The Library's first steps link to Settings at the token field (settingsFocusState).
      await window.getByRole("button", { name: "Add your Beatport token…" }).click();
      await expect(window.locator("#settings-beatport-token")).toBeFocused({ timeout: 15_000 });
      await expect(window.locator("#settings-beatport-token")).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("does not take a guest token for a sign-in", async () => {
    stand.mode = "guest";
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      // Even after the person clicks Sign in, the site only ever has its anonymous token.
      await signInOnPage(app, window, stand.origin);
      await expect.poll(() => stand.callbacks, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect.poll(() => stand.introspections, { timeout: 30_000 }).toBeGreaterThan(0);
      // The window stays open on the page, because nothing signed in; the person closes it.
      await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBe(2);
      const signInWindow = app.windows().find((page) => page.url().startsWith(stand.origin))!;
      await expect(window.getByText("Finish signing in in the Beatport window.")).toBeVisible();
      await signInWindow.close();
      await expect(window.getByText("Sign in to let Discover search Beatport.")).toBeVisible({ timeout: 15_000 });
      expect((await window.evaluate(() => window.cuepoint!.getBeatportTokenStatus())).configured).toBe(false);
    } finally {
      await app.close();
    }
  });

  test("regression: C20 signs in when introspection names a user scope but no `active`", async () => {
    stand.introspect = "real";
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      await signInOnPage(app, window, stand.origin);
      await expect(window.getByText(SIGNED_IN(MASKED))).toBeVisible({ timeout: 30_000 });
      // The page objects to being left (beforeunload), and the sign-in window still goes away.
      await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBe(1);
      expect((await window.evaluate(() => window.cuepoint!.getBeatportTokenStatus())).configured).toBe(true);
      expect(await renderersHold(window)).not.toContain(TOKEN);
    } finally {
      await app.close();
    }
  });

  for (const introspect of ["forbidden", "html"] as const) {
    test(`regression: C20 signs in through the session's scope when introspection answers ${introspect}, and renews`, async () => {
      stand.introspect = introspect;
      const app = await launch(userDataDir, cuepointHome, stand.origin);
      try {
        const window = await ready(app);
        await signInOnPage(app, window, stand.origin);
        await expect(window.getByText(SIGNED_IN(MASKED))).toBeVisible({ timeout: 45_000 });
        await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBe(1);
        expect(await renderersHold(window)).not.toContain(TOKEN);

        // Renewal reads the session endpoint again; introspection still cannot decide, the session's scope does.
        stand.rotated = true;
        await expect(window.getByText(SIGNED_IN(MASKED_2))).toBeVisible({ timeout: 90_000 });
        expect(app.windows().length).toBe(1);
        expect(await renderersHold(window)).not.toContain(TOKEN_2);
      } finally {
        await app.close();
      }
    });
  }

  test("regression: C20 signs in after the person closes the window, by reading the session once more", async () => {
    // Only the session can vouch for the token, and it answers too slowly for the window's own polling.
    stand.introspect = "forbidden";
    stand.sessionDelayMs = 3_000;
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      const signInWindow = await openSignIn(app, window, stand.origin);
      await clickSignIn(signInWindow);
      await expect.poll(() => stand.callbacks, { timeout: 30_000 }).toBe(1);
      await signInWindow.close().catch(() => undefined);
      await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBe(1);
      await expect(window.getByText(SIGNED_IN(MASKED))).toBeVisible({ timeout: 30_000 });
      expect((await window.evaluate(() => window.cuepoint!.getBeatportTokenStatus())).configured).toBe(true);
    } finally {
      await app.close();
    }
  });

  test("regression: C20 writes a sign-in log that holds no token, header, code or username", async () => {
    stand.introspect = "real";
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      // The engine's logs folder (next to cuepoint.log); it follows the platform's data folder, not
      // CUEPOINT_HOME, so earlier runs may have written to it: only what this run adds is read.
      const { logs_dir: logsDir } = (await window.evaluate(() => window.cuepoint!.getLogsDir())) as { logs_dir: string };
      const logFile = path.join(logsDir, "beatport-signin.log");
      const before = existsSync(logFile) ? readFileSync(logFile, "utf8").length : 0;
      await signInOnPage(app, window, stand.origin);
      await expect(window.getByText(SIGNED_IN(MASKED))).toBeVisible({ timeout: 30_000 });

      const read = () => (existsSync(logFile) ? readFileSync(logFile, "utf8").slice(before) : "");
      await expect.poll(() => read().includes("accepted"), { timeout: 15_000 }).toBe(true);
      const log = read();
      expect(log).toMatch(/^\S+\s+accepted\b/m);
      for (const secret of [
        TOKEN,
        TOKEN_2,
        ANON_TOKEN,
        "SECRETMARKER",
        "Bearer",
        "code=",
        USERNAME,
        "e2e@example.com",
      ]) {
        expect(log).not.toContain(secret);
      }
    } finally {
      await app.close();
    }
  });
});

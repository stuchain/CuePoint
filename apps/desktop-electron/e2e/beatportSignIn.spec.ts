/**
 * The Beatport sign-in, end to end (C12).
 *
 * Beatport is stood in for by a local server. Its "login" page makes the call the real site
 * makes — a request to the v4 API with a `Bearer` header — and the stand-in answers the token
 * introspection. The sign-in and API URLs are overridden through
 * `CUEPOINT_E2E_BEATPORT_SIGNIN_URL` and `CUEPOINT_E2E_BEATPORT_API_URL`, which main honours only
 * when `CUEPOINT_E2E_DISPLAY` is set and the app is unpackaged. A real Beatport page is never
 * opened.
 *
 * What is asserted: the page signs in (Settings says so, the engine sees a token), a guest token
 * is not a sign-in, signing out forgets it, and the token itself never appears in the renderer's
 * page, storage or any bridge answer.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
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

interface Stand {
  server: Server;
  origin: string;
  mode: Mode;
  introspections: number;
  /** The session endpoint answers `{}` (the page is signed out) until this is set. */
  sessionOpen: boolean;
  /** The session endpoint now serves the rotated token. */
  rotated: boolean;
  sessionReads: number;
}

/** The stand-in: the login page, the v4 API it calls, and the website's session JSON, shaped like NextAuth's (renewal reads it). */
async function startStandIn(): Promise<Stand> {
  const stand = { mode: "user" as Mode, introspections: 0, sessionOpen: true, rotated: false, sessionReads: 0 } as Stand;
  stand.server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    if (url.pathname === "/login") {
      // The login sets the cookie that the session endpoint wants, as signing in does on the site.
      response.writeHead(200, { "content-type": "text/html", "set-cookie": "e2e_sid=1; Path=/" });
      response.end(`<!doctype html><title>Stand-in login</title><p>Stand-in login</p>
<script>fetch("/v4/catalog/genres/", { headers: { Authorization: "Bearer ${TOKEN}" } });</script>`);
      return;
    }
    if (url.pathname === "/api/auth/session") {
      stand.sessionReads += 1;
      response.writeHead(200, { "content-type": "application/json" });
      if (!stand.sessionOpen || !(request.headers.cookie ?? "").includes("e2e_sid=1")) {
        response.end("{}");
        return;
      }
      response.end(
        JSON.stringify({
          user: { email: "e2e@example.com" },
          expires: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          token: {
            accessToken: stand.rotated ? TOKEN_2 : TOKEN,
            expiresIn: 70,
            tokenType: "Bearer",
            scope: stand.mode === "guest" ? "app:prostore user:anon" : "app:prostore user:dj",
            anon: stand.mode === "guest",
            // Short, so the app's first renewal falls at its 30 s floor.
            accessTokenExpires: Date.now() + (stand.rotated ? 600_000 : 70_000),
          },
        }),
      );
      return;
    }
    if (url.pathname === "/v4/auth/o/introspect/") {
      stand.introspections += 1;
      const ok = [`Bearer ${TOKEN}`, `Bearer ${TOKEN_2}`].includes(request.headers.authorization ?? "");
      response.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
      response.end(
        JSON.stringify(
          !ok
            ? { detail: "no" }
            : stand.mode === "guest"
              ? { active: true, scope: "user:anon", exp: Math.floor(Date.now() / 1000) + 36000 }
              : { active: true, scope: "user:dj", username: "e2e-dj", exp: Math.floor(Date.now() / 1000) + 36000 },
        ),
      );
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

function launch(userDataDir: string, cuepointHome: string, origin: string): Promise<ElectronApplication> {
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
  return electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
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
    await new Promise<void>((resolve) => stand.server.close(() => resolve()));
    for (const dir of [userDataDir, cuepointHome]) rmSync(dir, { recursive: true, force: true });
  });

  test("signs in on the page, keeps the token out of the renderer, and signs out", async () => {
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Settings" }).click();
      await expect(window.getByText("Sign in to let Discover search Beatport.")).toBeVisible({ timeout: 15_000 });

      await window.getByRole("button", { name: "Sign in to Beatport" }).click();
      // The sign-in window opens, shows the stand-in's page, and closes itself once the token checks out.
      await expect(window.getByText(`Signed in to Beatport · ${MASKED} · renews by itself`)).toBeVisible({
        timeout: 30_000,
      });
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
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Settings" }).click();
      await window.getByRole("button", { name: "Sign in to Beatport" }).click();
      await expect(window.getByText(`Signed in to Beatport · ${MASKED} · renews by itself`)).toBeVisible({
        timeout: 30_000,
      });
      await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBe(1);

      // Beatport rotates the token; the app picks it up at its next read, without opening a window.
      stand.rotated = true;
      await expect(window.getByText(`Signed in to Beatport · ${MASKED_2} · renews by itself`)).toBeVisible({
        timeout: 90_000,
      });
      expect(app.windows().length).toBe(1);
      expect(await renderersHold(window)).not.toContain(TOKEN_2);
    } finally {
      await app.close();
    }
  });

  test("signs in from the header when the session endpoint is still empty", async () => {
    stand.sessionOpen = false;
    const app = await launch(userDataDir, cuepointHome, stand.origin);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Settings" }).click();
      await window.getByRole("button", { name: "Sign in to Beatport" }).click();
      await expect(window.getByText(`Signed in to Beatport · ${MASKED} · renews by itself`)).toBeVisible({
        timeout: 30_000,
      });
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
      await window.getByRole("link", { name: "Settings" }).click();
      await window.getByRole("button", { name: "Sign in to Beatport" }).click();
      // The window stays open on the page, because nothing signed in; the person closes it.
      await expect.poll(() => stand.introspections, { timeout: 30_000 }).toBeGreaterThan(0);
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
});

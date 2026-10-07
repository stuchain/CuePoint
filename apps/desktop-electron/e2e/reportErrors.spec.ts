/**
 * Main reports its own failures, and an engine error keeps its code across the real
 * bridge (REPORT-04, DEC-126, DEC-127, DEC-128).
 *
 * The app is launched with `CUEPOINT_SENTRY_DSN` pointing at a server this spec runs, so
 * what would leave the machine is what arrives here. Nothing in a user's build has a DSN.
 * These are the checks that need a real Electron: the SDK's own integrations, its
 * transport, and `contextBridge`, which rebuilds an Error in the page from its message
 * alone (`status`, `code` and `reportId` do not survive it, hence `engineErrorFields`).
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

/** A fake Sentry: keeps the body of every envelope posted to it. */
async function collector(): Promise<{ dsn: string; bodies: string[]; close: () => Promise<void> }> {
  const bodies: string[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      bodies.push((req.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw).toString("utf-8"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    dsn: `http://publickey@127.0.0.1:${port}/1`,
    bodies,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** The events in the envelopes received: each is the JSON of an `event` item. */
function eventsIn(bodies: string[]): Array<Record<string, any>> {
  const events: Array<Record<string, any>> = [];
  for (const body of bodies) {
    const lines = body.split("\n").filter(Boolean);
    for (let i = 1; i + 1 < lines.length; i += 2) {
      const header = JSON.parse(lines[i]!) as { type?: string };
      if (header.type === "event") events.push(JSON.parse(lines[i + 1]!) as Record<string, any>);
    }
  }
  return events;
}

/** Every file below `dir`, as a path relative to it. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function launch(userDataDir: string, dsn: string | null): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production" } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUEPOINT_SENTRY_DSN;
  if (dsn !== null) env.CUEPOINT_SENTRY_DSN = dsn;
  return electron.launch({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
}

/** Call a bridge method that rejects, and answer what the page sees. */
async function failure(window: Page, call: string): Promise<{ message: string; own: Record<string, unknown> }> {
  return window.evaluate(async (source) => {
    try {
      // eslint-disable-next-line no-new-func
      await new Function("cuepoint", `return (${source})`)((window as never as { cuepoint: unknown }).cuepoint);
      return { message: "did not reject", own: {} };
    } catch (error) {
      const e = error as Error & Record<string, unknown>;
      return { message: e.message, own: { status: e.status, code: e.code, reportId: e.reportId } };
    }
  }, call);
}

test.describe("main reports (REPORT-04)", () => {
  let userDataDir: string;
  let fake: Awaited<ReturnType<typeof collector>>;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-report-"));
    fake = await collector();
  });

  test.afterEach(async () => {
    await fake.close();
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test("a throwing handler is one scrubbed event, and a refusal is none", async () => {
    const app = await launch(userDataDir, fake.dsn);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(window);

      // A handler that throws something that is not an engine answer.
      const thrown = await failure(window, "cuepoint.errorReporting.set('yes')");
      expect(thrown.message).toBe("errorReporting:set needs true or false");

      await expect.poll(() => eventsIn(fake.bodies).length, { timeout: 30_000 }).toBeGreaterThan(0);
      await new Promise((resolve) => setTimeout(resolve, 2_000));

      const events = eventsIn(fake.bodies);
      expect(events).toHaveLength(1);
      const [event] = events;
      expect(event!.tags["ipc.channel"]).toBe("errorReporting:set");
      const text = JSON.stringify(event);
      // Nothing personal: not the machine, not where the profile is, no request or user.
      expect(text).not.toContain(hostname());
      expect(text).not.toContain(userDataDir);
      expect(event!.server_name).toBeUndefined();
      expect(event!.user).toBeUndefined();
      // A trace id with tracing off: the one main also sends the engine (DEC-126).
      expect(event!.contexts.trace.trace_id).toMatch(/^[0-9a-f]{32}$/);
      // The steps before it: this call's channel and outcome, never arguments.
      const trail = JSON.stringify(event!.breadcrumbs);
      expect(trail).toContain("errorReporting:set");
      expect(trail).not.toContain('"yes"');
      // No native crash dump, and nothing queued on disk for later.
      expect(existsSync(path.join(userDataDir, "sentry"))).toBe(false);
      // (Chromium makes its own empty `Crashpad` folder at every launch; a dump would be a `.dmp`.)
      expect(filesUnder(userDataDir).filter((file) => /\.dmp$|sentry/i.test(file))).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("an engine refusal reaches the page with its code, and is not reported", async () => {
    const app = await launch(userDataDir, fake.dsn);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(window);

      // A track that is not in the library: the engine answers 404 with its code.
      const refused = await failure(window, "cuepoint.setTrackOverrides({ trackId: 1, bpm: 400 })");

      expect(refused.message).toBe("No track with id 1");
      // What the real contextBridge leaves of the fields the preload set on the Error:
      // nothing. They are read through the bridge by the error's words instead.
      const fields = await window.evaluate((message) => {
        const bridge = (window as never as { cuepoint: { engineErrorFields: (m: string) => unknown } }).cuepoint;
        return bridge.engineErrorFields(message);
      }, refused.message);
      expect(fields).toMatchObject({ status: expect.any(Number), code: expect.any(String), reportId: null });
      expect((fields as { status: number }).status).toBeLessThan(500);

      await new Promise((resolve) => setTimeout(resolve, 2_000));
      expect(eventsIn(fake.bodies)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("with the choice off nothing is sent, however the app fails", async () => {
    writeFileSync(path.join(userDataDir, "main-settings.json"), JSON.stringify({ errorReporting: false }));
    const app = await launch(userDataDir, fake.dsn);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(window);

      await failure(window, "cuepoint.errorReporting.set('yes')");
      await new Promise((resolve) => setTimeout(resolve, 3_000));

      expect(fake.bodies).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("with no DSN nothing is set up, and the app still works", async () => {
    const app = await launch(userDataDir, null);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(window);

      const thrown = await failure(window, "cuepoint.errorReporting.set('yes')");

      expect(thrown.message).toBe("errorReporting:set needs true or false");
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      expect(fake.bodies).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("a report that cannot be sent is lost, not queued for later (DEC-128)", async () => {
    await fake.close();
    const dead = fake.dsn; // the port is closed now
    const app = await launch(userDataDir, dead);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(window);

      await failure(window, "cuepoint.errorReporting.set('yes')");
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    } finally {
      await app.close();
    }

    expect(existsSync(path.join(userDataDir, "sentry"))).toBe(false);
    fake = await collector(); // for afterEach to close
  });
});

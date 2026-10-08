/**
 * The renderer reports, and shows an error screen (REPORT-06, DEC-126, DEC-152).
 *
 * The app is launched with `CUEPOINT_SENTRY_DSN` pointing at a server this spec runs, so what
 * would leave the machine is what arrives here. A test-only hook (main answers
 * `testHooks.enabled()` true only when the run sets the display variable) lets the spec make the
 * page it is on throw. What needs a real Electron: the narrow `__SENTRY_IPC__` bridge in the
 * preload, the renderer SDK's transport, and main's scrubber over what the page sends.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { chooseMenuItem } from "./appMenu";
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

/** The items of one type in the envelopes received: each is the JSON of an item's payload. */
function itemsOf(bodies: string[], type: string): Array<Record<string, any>> {
  const found: Array<Record<string, any>> = [];
  for (const body of bodies) {
    const lines = body.split("\n").filter(Boolean);
    for (let i = 1; i + 1 < lines.length; i += 2) {
      const header = JSON.parse(lines[i]!) as { type?: string };
      if (header.type === type) found.push(JSON.parse(lines[i + 1]!) as Record<string, any>);
    }
  }
  return found;
}

function launch(userDataDir: string, dsn: string | null): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production" } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUEPOINT_SENTRY_DSN;
  if (dsn !== null) env.CUEPOINT_SENTRY_DSN = dsn;
  return electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function ready(window: Page): Promise<void> {
  // Dismissing onboarding through storage keeps the dialog's backdrop out of the way.
  await window.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
}

/** Make the page throw, once the test hook has said this is a test run. */
async function crashPage(window: Page): Promise<void> {
  await expect
    .poll(async () => {
      await window.evaluate(() => window.dispatchEvent(new Event("cuepoint:e2e-crash")));
      return window.getByTestId("error-screen").count();
    }, { timeout: 15_000 })
    .toBeGreaterThan(0);
}

test.describe("the renderer reports (REPORT-06)", () => {
  let userDataDir: string;
  let fake: Awaited<ReturnType<typeof collector>>;

  test.beforeEach(async () => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-renderer-report-"));
    fake = await collector();
  });

  test.afterEach(async () => {
    await fake.close();
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test("a page that throws shows the error screen and is one scrubbed event; the shell keeps working", async () => {
    const app = await launch(userDataDir, fake.dsn);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(window);
      await ready(window);

      await crashPage(window);

      const screen = window.getByTestId("error-screen");
      await expect(screen.getByText("Something went wrong")).toBeVisible();
      // The sidebar still navigates, and leaving the page clears the screen.
      const nav = window.getByRole("navigation", { name: /main navigation/i });
      await expect(nav).toBeVisible();
      await nav.getByRole("link", { name: "Settings" }).click();
      await expect(window.getByTestId("error-screen")).toHaveCount(0);

      await expect.poll(() => itemsOf(fake.bodies, "event").length, { timeout: 15_000 }).toBe(1);
      const [event] = itemsOf(fake.bodies, "event");
      expect(event!.exception.values[0].value).toBe("End-to-end test crash");
      expect(event!.tags["event.process"]).toBe("renderer");
      expect(JSON.stringify(event!.contexts.react)).toContain("componentStack");
      expect(JSON.stringify(event)).not.toMatch(/"user"|"request"/);
      // Nothing but the error event left the page: no session, replay, logs or metrics.
      for (const type of ["session", "sessions", "replay_event", "log", "trace_metric", "client_report"]) {
        expect(itemsOf(fake.bodies, type)).toEqual([]);
      }
      // The steps before it are destination ids.
      const crumbs = (event!.breadcrumbs ?? []) as Array<{ category?: string; message?: string }>;
      for (const crumb of crumbs.filter((c) => c.category === "navigation")) {
        expect(["library", "clean", "settings", "discover", "prepare", "collections"]).toContain(crumb.message);
      }
    } finally {
      await app.close();
    }
  });

  test("the error screen shows the short report id", async () => {
    const app = await launch(userDataDir, fake.dsn);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(window);
      await ready(window);
      await crashPage(window);

      await expect.poll(() => itemsOf(fake.bodies, "event").length, { timeout: 15_000 }).toBe(1);
      const [event] = itemsOf(fake.bodies, "event");
      await expect(window.getByTestId("error-screen-report-id")).toHaveText(
        String(event!.event_id).slice(0, 8),
      );
    } finally {
      await app.close();
    }
  });

  test("Report a problem sends the note as written, with the version", async () => {
    const app = await launch(userDataDir, fake.dsn);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(window);
      await ready(window);

      await chooseMenuItem(app, "report-problem");
      const note = "I dragged a track onto /Users/me/Music/Secret Song.mp3 and it froze";
      await window.getByRole("textbox").fill(note);
      await window.getByRole("button", { name: "Send" }).click();
      await expect(window.getByText(/your note was sent/i)).toBeVisible();

      await expect.poll(() => itemsOf(fake.bodies, "feedback").length, { timeout: 15_000 }).toBe(1);
      const [feedback] = itemsOf(fake.bodies, "feedback");
      expect(feedback!.contexts.feedback.message).toBe(note);
      expect(feedback!.tags["app.version"]).toMatch(/\S/);
    } finally {
      await app.close();
    }
  });

  test("with reports off, Report a problem says so and nothing is sent", async () => {
    writeFileSync(path.join(userDataDir, "main-settings.json"), JSON.stringify({ errorReporting: false }));
    const app = await launch(userDataDir, fake.dsn);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(window);
      await ready(window);

      await crashPage(window);
      await chooseMenuItem(app, "report-problem");
      // The dialog says why it cannot send, and has nothing to send with.
      await expect(window.getByText(/Error reports are off in Settings/)).toBeVisible();
      await expect(window.getByRole("button", { name: "Send" })).toBeDisabled();
      // The error screen has no id: nothing was reported.
      await expect(window.getByTestId("error-screen-report-id")).toHaveCount(0);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(itemsOf(fake.bodies, "event")).toEqual([]);
      expect(itemsOf(fake.bodies, "feedback")).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

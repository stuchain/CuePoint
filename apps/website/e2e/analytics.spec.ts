import { expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { WEB3FORMS_ENDPOINT } from "../src/data/site";
import { distPages } from "./pages";

/**
 * SITE-12: the analytics (Umami Cloud, DEC-192) and the consent component (DEC-142).
 *
 * A preview build never loads Umami, so these tests give the page a stand-in `window.umami` and check
 * what the site hands it. Nothing here reaches the real account: any request to umami.is fails a test.
 */
const ROOT = join(import.meta.dirname, "..");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
};

function serve(dir: string): Promise<{ server: Server; url: string }> {
  const root = join(ROOT, dir);
  if (!existsSync(join(root, "download", "index.html"))) throw new Error(`${dir}/ is not built: run \`npm run build:fixture\``);
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")).replace(/^(\.\.[/\\])+/, "");
    let file = join(root, path);
    if (existsSync(file) && !extname(file)) file = join(file, "index.html");
    if (!existsSync(file) || !file.startsWith(root)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` }));
  });
}

type Call = [string, Record<string, string> | undefined];

/** A stand-in for Umami on the page, recording every event; a click on a link must not leave the page. */
async function withUmami(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __events: Call[]; umami: { track: (n: string, d?: Record<string, string>) => void } };
    w.__events = [];
    w.umami = { track: (n, d) => void w.__events.push([n, d]) };
    document.addEventListener("click", (e) => {
      if ((e.target as Element).closest?.("a[href^='http']")) e.preventDefault();
    });
  });
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Call[] }).__events);

/** Any request to Umami's hosts fails the test: nothing may reach the real account. */
function forbidUmami(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (r) => {
    if (/umami\.(is|dev)/.test(new URL(r.url()).hostname)) hits.push(r.url());
  });
  return hits;
}

test.describe("preview builds", () => {
  for (const path of distPages().filter((p) => p.endsWith("/") || p === "")) {
    test(`/${path} loads no analytics script and sets no cookie`, async ({ page, context }) => {
      const hits = forbidUmami(page);
      await page.goto(path);
      await page.waitForLoadState("load");
      expect(hits).toEqual([]);
      expect(await page.locator('script[src*="umami"], script[data-website-id]').count()).toBe(0);
      expect(await page.evaluate(() => document.cookie)).toBe("");
      expect(await context.cookies()).toEqual([]);
    });
  }
});

test.describe("events", () => {
  test("a click on a download sends one event with the system and chip", async ({ browser }) => {
    const served = await serve("dist-fixture");
    try {
      const context = await (browser as Browser).newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" });
      const page = await context.newPage();
      await withUmami(page);
      await page.goto(`${served.url}download/`);
      await page.locator("#all-downloads .files a", { hasText: "Download" }).nth(0).waitFor();
      await page.locator("#all-downloads .files a", { hasText: "Download" }).nth(0).click();
      const sent = (await events(page)).filter(([name]) => name === "download");
      expect(sent).toHaveLength(1);
      const data = sent[0]?.[1] ?? {};
      expect(Object.keys(data).sort()).toEqual(["chip", "system"]);
      expect(["windows", "macos", "linux"]).toContain(data["system"]);
      expect(["x64", "arm64"]).toContain(data["chip"]);
      await context.close();
    } finally {
      served.server.close();
    }
  });

  test("a form sent sends the form's name and none of what was typed", async ({ page }) => {
    await withUmami(page);
    await page.route(`${WEB3FORMS_ENDPOINT}**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) }));
    await page.goto("contact/");
    await page.getByLabel("Email", { exact: true }).fill("dj@example.test");
    await page.getByLabel("Subject").selectOption("Other");
    await page.getByLabel("Message").fill("A private message");
    await page.waitForTimeout(3100);
    await page.getByRole("button", { name: "Send message" }).click();
    await page.waitForURL(/thank-you\/$/);
    expect(JSON.stringify(await events(page))).not.toMatch(/dj@|private/);
  });

  test("the form's event is recorded before the thank-you page replaces the page", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { umami: { track: (n: string, d?: unknown) => void } };
      w.umami = { track: (n, d) => void sessionStorage.setItem("seen", JSON.stringify([n, d])) };
    });
    await page.route(`${WEB3FORMS_ENDPOINT}**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) }));
    await page.goto("report-a-bug/");
    await page.getByLabel("Email", { exact: true }).fill("dj@example.test");
    await page.getByLabel("App version").fill("1.0.0");
    await page.getByLabel("System").selectOption("linux");
    await page.getByLabel("Chip").selectOption("x64");
    await page.getByLabel("What happened").fill("a");
    await page.getByLabel("What you expected").fill("b");
    await page.getByLabel("Steps to reproduce").fill("c");
    await page.waitForTimeout(3100);
    await page.getByRole("button", { name: "Send report" }).click();
    await page.waitForURL(/thank-you\/$/);
    expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem("seen"))) ?? "null")).toEqual(["form-sent", { form: "bug" }]);
  });

  test("a failed send is not counted", async ({ page }) => {
    await withUmami(page);
    await page.route(`${WEB3FORMS_ENDPOINT}**`, (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("contact/");
    await page.getByLabel("Email", { exact: true }).fill("dj@example.test");
    await page.getByLabel("Subject").selectOption("Other");
    await page.getByLabel("Message").fill("hello");
    await page.waitForTimeout(3100);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator("[data-form-status]")).toContainText(/could not send/i);
    expect(await events(page)).toEqual([]);
  });

  test("with no Umami on the page nothing throws", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("");
    await page.getByRole("link", { name: "See how it works" }).click();
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
});

test.describe("the consent banner", () => {
  test("is off on every page when the site has set no cookie", async ({ page }) => {
    for (const path of ["", "download/", "contact/", "privacy/"]) {
      await page.goto(path);
      await expect(page.locator("[data-consent-banner]")).toBeHidden();
    }
  });

  test("appears when a cookie that is not on the allow list is planted, and lets the visitor choose", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "tracker", value: "1", url: baseURL! }]);
    await page.goto("");
    const banner = page.locator("[data-consent-banner]");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("tracker");
    await banner.getByRole("button", { name: "No thanks" }).click();
    await expect(banner).toBeHidden();
    // the choice is remembered in local storage, not a cookie
    await page.reload();
    await expect(banner).toBeHidden();
    expect(await page.evaluate(() => document.cookie)).toBe("tracker=1");
  });

  test("appears when a script sets a cookie after the site was loaded without one, on the next page", async ({ page }) => {
    await page.goto("");
    await page.evaluate(() => (document.cookie = "_ga=GA1.1.123; path=/"));
    await page.goto("faq/");
    await expect(page.locator("[data-consent-banner]")).toBeVisible();
  });

  test("keeps what is under it reachable: the page's bottom scroll padding is the banner's height while it shows", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "tracker", value: "1", url: baseURL! }]);
    await page.goto("");
    const banner = page.locator("[data-consent-banner]");
    await expect(banner).toBeVisible();
    const height = await banner.evaluate((el) => el.getBoundingClientRect().height);
    const padding = await page.evaluate(() => parseFloat(document.documentElement.style.scrollPaddingBottom));
    expect(Math.abs(padding - height)).toBeLessThan(1);
    await banner.getByRole("button", { name: "No thanks" }).click();
    expect(await page.evaluate(() => document.documentElement.style.scrollPaddingBottom)).toBe("");
  });

  test("shows its choices to the keyboard and is announced", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "tracker", value: "1", url: baseURL! }]);
    await page.goto("");
    const banner = page.locator("[data-consent-banner]");
    await expect(banner).toHaveAttribute("role", "region");
    await expect(banner).toHaveAccessibleName("Counting visits");
    await expect(banner.getByRole("heading", { level: 2, name: "Counting visits" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Allow counting" })).toBeVisible();
  });
});

test("a preview build's Content-Security-Policy names no Umami host and no wildcard", async ({ page }) => {
  await page.goto("");
  const csp = (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content")) ?? "";
  expect(csp).not.toContain("umami");
  expect(csp).toContain("https://api.web3forms.com");
  expect(csp).not.toMatch(/\*/);
});

test.describe("the public path (a preview page rewritten to public)", () => {
  const UMAMI_ID = "c1b7a806-c974-4e97-aed1-f94f53b6326c";

  /** Serves every page with data-public="true" and answers Umami's script itself, so nothing leaves the machine. */
  async function asPublic(page: Page) {
    await page.route("https://cloud.umami.is/**", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
    await page.route(/\/(?:[^/.]*\/)*$/, async (route) => {
      if (route.request().resourceType() !== "document") return route.fallback();
      const response = await route.fetch();
      const html = (await response.text()).replace('data-public="false"', 'data-public="true"');
      await route.fulfill({ response, body: html });
    });
  }
  const scripts = (page: Page) => page.locator("script[data-website-id]");

  test("with no foreign cookie there is exactly one deferred script, with the real id and only the site's domain", async ({ page }) => {
    await asPublic(page);
    await page.goto("");
    await expect(scripts(page)).toHaveCount(1);
    await expect(scripts(page)).toHaveAttribute("data-website-id", UMAMI_ID);
    await expect(scripts(page)).toHaveAttribute("src", "https://cloud.umami.is/script.js");
    await expect(scripts(page)).toHaveAttribute("data-domains", "usecuepoint.com");
    expect(await scripts(page).evaluate((el: HTMLScriptElement) => el.defer)).toBe(true);
  });

  test("with a foreign cookie none loads while the banner waits, one after Allow counting, none after No thanks", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "tracker", value: "1", url: baseURL! }]);
    await asPublic(page);
    await page.goto("");
    const banner = page.locator("[data-consent-banner]");
    await expect(banner).toBeVisible();
    await expect(scripts(page)).toHaveCount(0);
    await banner.getByRole("button", { name: "Allow counting" }).click();
    await expect(scripts(page)).toHaveCount(1);
    await expect(scripts(page)).toHaveAttribute("data-website-id", UMAMI_ID);
    // a second visit remembers the yes: still exactly one
    await page.reload();
    await expect(scripts(page)).toHaveCount(1);

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "No thanks" }).click();
    await expect(scripts(page)).toHaveCount(0);
    await page.reload();
    await expect(banner).toBeHidden();
    await expect(scripts(page)).toHaveCount(0);
  });
});

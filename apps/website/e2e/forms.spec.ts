import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import { WEB3FORMS_ACCESS_KEY, WEB3FORMS_ENDPOINT } from "../src/data/site";
import { canonicalFor } from "../src/lib/url";

/**
 * SITE-12: the contact and bug-report forms, against a stand-in for Web3Forms. Every test routes the
 * service's address, so nothing in this file can reach the real service; a request that is not
 * answered by the stand-in fails the test.
 */
const SERVICE = `${WEB3FORMS_ENDPOINT}**`;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface Standin {
  posts: { contentType: string; body: string }[];
}

/** Answers the service: success by default; pass a handler to fail, or to see the request. */
async function standIn(page: Page, answer?: (route: Route) => Promise<void> | void): Promise<Standin> {
  const seen: Standin = { posts: [] };
  await page.route(SERVICE, async (route) => {
    const request = route.request();
    seen.posts.push({ contentType: request.headers()["content-type"] ?? "", body: request.postData() ?? "" });
    if (answer) return answer(route);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "ok" }) });
  });
  return seen;
}

async function fillContact(page: Page, over: { email?: string; message?: string } = {}) {
  await page.getByLabel("Name (optional)").fill("Alex");
  await page.getByLabel("Email", { exact: true }).fill(over.email ?? "dj@example.test");
  await page.getByLabel("Subject").selectOption("Feedback");
  await page.getByLabel("Message").fill(over.message ?? "The Camelot wheel is great.");
}

async function fillBug(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill("dj@example.test");
  await page.getByLabel("App version").fill("1.0.0");
  await page.getByLabel("System").selectOption("macos");
  await page.getByLabel("Chip").selectOption("arm64");
  await page.getByLabel("What happened").fill("It stopped on a playlist.");
  await page.getByLabel("What you expected").fill("It should finish.");
  await page.getByLabel("Steps to reproduce").fill("Open a playlist and press Start.");
}

/** Let the minimum fill time pass, so a test of the send itself is not a test of the wait. */
const afterFillTime = (page: Page) => page.waitForTimeout(3100);

for (const form of [
  { name: "contact", path: "contact/", send: "Send message", thanks: "contact/thank-you/" },
  { name: "bug report", path: "report-a-bug/", send: "Send report", thanks: "report-a-bug/thank-you/" },
] as const) {
  test.describe(`the ${form.name} form`, () => {
    test("is a plain HTML form that posts to the service, with the key and a redirect, and works with scripts off", async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(form.path);
      const el = page.locator("form[data-form]");
      await expect(el).toHaveAttribute("method", /post/i);
      await expect(el).toHaveAttribute("action", WEB3FORMS_ENDPOINT);
      await expect(el.locator('input[name="access_key"]')).toHaveValue(WEB3FORMS_ACCESS_KEY);
      // absolute, because Web3Forms redirects the no-script post to it
      await expect(el.locator('input[name="redirect"]')).toHaveValue(canonicalFor(form.thanks));
      await expect(el.locator('input[name="subject"], select[name="subject"]')).toHaveCount(1);
      // no script, so the browser's own checks apply: required fields are marked
      await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("required", "");
      await context.close();
    });

    test("with scripts off, pressing send posts the fields to the service and follows its redirect", async ({ browser, baseURL }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      const seen = await standIn(page, (route) => route.fulfill({ status: 303, headers: { location: new URL(form.thanks, baseURL).href } }));
      await page.goto(form.path);
      if (form.name === "contact") await fillContact(page);
      else await fillBug(page);
      await page.getByRole("button", { name: form.send }).click();
      await expect(page).toHaveURL(new RegExp(`/${form.thanks}$`));
      expect(seen.posts).toHaveLength(1);
      expect(seen.posts[0]?.body).toContain(WEB3FORMS_ACCESS_KEY);
      expect(seen.posts[0]?.body).toContain("dj%40example.test");
    });

    test("shows each field's message under it, linked to the field, and focuses the first wrong one", async ({ page }) => {
      const seen = await standIn(page);
      await page.goto(form.path);
      await page.getByRole("button", { name: form.send }).click();
      const invalid = page.locator('[aria-invalid="true"]');
      expect(await invalid.count()).toBeGreaterThan(0);
      for (const field of await invalid.all()) {
        const id = await field.getAttribute("aria-describedby");
        expect(id, "an invalid field is described by its message").toBeTruthy();
        const message = page.locator(`#${id!.split(" ").find((i) => i.endsWith("-error"))}`);
        await expect(message).toBeVisible();
        await expect(message).not.toBeEmpty();
      }
      // the first invalid field in the page has the focus
      const firstId = await invalid.first().getAttribute("id");
      expect(await page.evaluate(() => document.activeElement?.id)).toBe(firstId);
      await expect(page.locator("#form-summary")).toContainText(/fix|check/i);
      expect(seen.posts).toHaveLength(0);
    });

    test("is accessible, in its empty and its error state", async ({ page }) => {
      await page.goto(form.path);
      let results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
      await page.getByRole("button", { name: form.send }).click();
      results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });

    test("a filled honeypot drops the send but still shows the thank-you page", async ({ page }) => {
      const seen = await standIn(page);
      await page.goto(form.path);
      if (form.name === "contact") await fillContact(page);
      else await fillBug(page);
      await afterFillTime(page);
      await page.locator('input[name="botcheck"]').evaluate((el: HTMLInputElement) => {
        el.checked = true;
        el.value = "on";
      });
      await page.getByRole("button", { name: form.send }).click();
      await expect(page).toHaveURL(new RegExp(`/${form.thanks}$`));
      expect(seen.posts).toHaveLength(0);
    });

    test("a send sooner than the minimum fill time is treated like a filled honeypot: the thank-you page, nothing sent", async ({ page }) => {
      const seen = await standIn(page);
      await page.goto(form.path);
      if (form.name === "contact") await fillContact(page);
      else await fillBug(page);
      await page.getByRole("button", { name: form.send }).click();
      await expect(page).toHaveURL(new RegExp(`/${form.thanks}$`));
      expect(seen.posts).toHaveLength(0);
    });

    test("a send that works reaches the thank-you page, which is noindex and has a way back", async ({ page }) => {
      const seen = await standIn(page);
      await page.goto(form.path);
      if (form.name === "contact") await fillContact(page);
      else await fillBug(page);
      await afterFillTime(page);
      await page.getByRole("button", { name: form.send }).click();
      await expect(page).toHaveURL(new RegExp(`/${form.thanks}$`));
      expect(seen.posts).toHaveLength(1);
      expect(seen.posts[0]?.body).toContain(WEB3FORMS_ACCESS_KEY);
      // `redirect` is for the no-script post; the script's send stays on the page and does not carry it
      expect(seen.posts[0]?.body).not.toContain('name="redirect"');
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    });

    test("a send that fails keeps what was typed and offers the repository's issues page", async ({ page }) => {
      await standIn(page, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "down" }) }));
      await page.goto(form.path);
      if (form.name === "contact") await fillContact(page, { message: "Please keep this text." });
      else await fillBug(page);
      await afterFillTime(page);
      await page.getByRole("button", { name: form.send }).click();
      const alert = page.locator('[data-form-status][role="alert"]');
      await expect(alert).toContainText(/could not send|couldn't send/i);
      await expect(alert.locator('a[href^="mailto:"]')).toHaveCount(0);
      await expect(alert.locator('a[href$="/issues"]')).toHaveCount(1);
      await expect(page).toHaveURL(new RegExp(`/${form.path}$`));
      await expect(page.getByLabel("Email", { exact: true })).toHaveValue("dj@example.test");
      if (form.name === "contact") await expect(page.getByLabel("Message")).toHaveValue("Please keep this text.");
      else await expect(page.getByLabel("What happened")).toHaveValue("It stopped on a playlist.");
      // and the button is back, so the visitor can try again
      await expect(page.getByRole("button", { name: form.send })).toBeEnabled();
    });

    test("a network failure is treated the same way", async ({ page }) => {
      await standIn(page, (route) => route.abort("failed"));
      await page.goto(form.path);
      if (form.name === "contact") await fillContact(page);
      else await fillBug(page);
      await afterFillTime(page);
      await page.getByRole("button", { name: form.send }).click();
      await expect(page.locator("[data-form-status]")).toContainText(/could not send|couldn't send/i);
    });
  });
}

test.describe("contact form fields", () => {
  test("an email that is not an email, and a message of spaces, are named", async ({ page }) => {
    await page.goto("contact/");
    await fillContact(page, { email: "not an email", message: "   " });
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator("#email-error")).toContainText(/email/i);
    await expect(page.locator("#message-error")).toContainText(/message/i);
    await expect(page.locator("#name-error")).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("email");
  });

  test("fixing a field clears its message as the visitor types", async ({ page }) => {
    await page.goto("contact/");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator("#email-error")).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("dj@example.test");
    await expect(page.locator("#email-error")).toBeHidden();
    await expect(page.getByLabel("Email", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("bug report fields", () => {
  test("says the app reports its own errors and where Report a problem is, above the fields", async ({ page }) => {
    await page.goto("report-a-bug/");
    const intro = page.locator("[data-form-intro]");
    await expect(intro).toContainText("Report a problem");
    await expect(intro).toContainText(/report their own errors/i);
    const before = await page.evaluate(() => {
      const intro = document.querySelector("[data-form-intro]")!;
      const form = document.querySelector("form[data-form]")!;
      return Boolean(intro.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(before).toBe(true);
  });

  test("names the version's format and where to find it", async ({ page }) => {
    await page.goto("report-a-bug/");
    await expect(page.locator("#version-hint")).toContainText("Settings › About & updates");
    await expect(page.locator("#version-hint")).toContainText("1.0.0");
    await expect(page.getByLabel("App version")).toHaveAttribute("aria-describedby", /version-hint/);
  });

  test("a version that is not X.Y.Z is refused with the format, and X.Y.Z-test.N is accepted", async ({ page }) => {
    await standIn(page);
    await page.goto("report-a-bug/");
    await fillBug(page);
    await page.getByLabel("App version").fill("one point oh");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.locator("#version-error")).toContainText("1.0.0");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("version");
    await page.getByLabel("App version").fill("1.0.0-test.2");
    await expect(page.locator("#version-error")).toBeHidden();
  });

  test("offers the three systems and two chips", async ({ page }) => {
    await page.goto("report-a-bug/");
    expect(await page.getByLabel("System").locator("option").allTextContents()).toEqual(expect.arrayContaining(["Windows", "macOS", "Linux"]));
    expect(await page.getByLabel("Chip").locator("option").allTextContents()).toEqual(expect.arrayContaining(["Intel or AMD (x64)", "Apple Silicon or Arm (arm64)"]));
  });
});

test("a preview build says that sending is real", async ({ page }) => {
  await page.goto("contact/");
  await expect(page.locator(".preview-note")).toContainText("Preview build: this sends a real message");
});

test("the version field carries the browser's own pattern too", async ({ page }) => {
  await page.goto("report-a-bug/");
  await expect(page.getByLabel("App version")).toHaveAttribute("pattern", "\\d+\\.\\d+\\.\\d+(-test\\.\\d+)?");
});

test("no page of the forms sets a cookie", async ({ page, context }) => {
  await standIn(page);
  for (const path of ["contact/", "report-a-bug/", "contact/thank-you/", "report-a-bug/thank-you/"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.cookie)).toBe("");
  }
  expect(await context.cookies()).toEqual([]);
});

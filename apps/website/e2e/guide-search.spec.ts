import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { SITE_URL, addressParts } from "../site.config";

/**
 * SITE-09: Pagefind finds a word from every guide page, through the real search box on the built site.
 * For each page the word is one that no other guide page contains, taken from the Markdown itself.
 */
const GUIDE = join(import.meta.dirname, "..", "..", "..", "docs", "user-guide");
const files = readdirSync(GUIDE).filter((f) => f.endsWith(".md")).sort();

const wordsOf = (markdown: string): string[] => markdown.toLowerCase().replace(/\(([^)]*\.md[^)]*)\)/g, " ").match(/[a-z]{6,}/g) ?? [];
const text = new Map(files.map((f) => [f, wordsOf(readFileSync(join(GUIDE, f), "utf8"))]));

function uniqueWord(file: string): string {
  const others = new Set(files.filter((f) => f !== file).flatMap((f) => text.get(f)!));
  const counts = new Map<string, number>();
  for (const w of text.get(file)!) if (!others.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))[0];
  if (!best) throw new Error(`${file} has no word that no other guide page contains`);
  return best[0];
}

test("the search code is not requested until the box is focused", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto("guide/");
  await page.waitForLoadState("networkidle");
  expect(requested.filter((p) => p.startsWith(`${addressParts(SITE_URL).base}pagefind/`))).toEqual([]);
  await page.getByLabel("Search the guide").focus();
  await expect.poll(() => requested.some((p) => p === `${addressParts(SITE_URL).base}pagefind/pagefind.js`)).toBe(true);
});

test("the search box works from the keyboard and announces its results", async ({ page }) => {
  await page.goto("guide/");
  await page.keyboard.press("Tab"); // skip link
  const box = page.getByRole("search").getByLabel("Search the guide");
  await box.focus();
  await box.fill("duplicates");
  const status = page.getByRole("status").first();
  await expect(status).toContainText(/pages? mention/);
  const first = page.getByRole("search").getByRole("link").first();
  await expect(first).toBeVisible();
  await box.press("ArrowDown");
  await expect(first).toBeFocused();
  await first.press("Escape");
  await expect(box).toBeFocused();
  await box.press("Escape");
  await expect(box).toHaveValue("");
  await expect(page.getByRole("search").getByRole("link")).toHaveCount(0);
});

test("a word that is nowhere in the guide says so", async ({ page }) => {
  await page.goto("guide/");
  await page.getByLabel("Search the guide").fill("zzqxjv");
  await expect(page.getByRole("status").first()).toContainText("No guide page mentions");
});

for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  test(`Pagefind finds a word from ${file}`, async ({ page }) => {
    const word = uniqueWord(file);
    await page.goto("guide/");
    await page.getByLabel("Search the guide").fill(word);
    const hit = page.getByRole("search").locator(`a[href$="/guide/${slug}/"]`);
    await expect(hit, `"${word}" should lead to /guide/${slug}/`).toBeVisible();
  });
}

test("only guide pages are indexed", async ({ page }) => {
  await page.goto("guide/");
  // "frequently" is on the FAQ page's heading and nowhere in the guide
  await page.getByLabel("Search the guide").fill("frequently");
  await expect(page.getByRole("status").first()).toContainText("No guide page mentions");
});

test("the build leaves out Pagefind's own UI and highlighter, which the site does not load", () => {
  const present = new Set(readdirSync(join(import.meta.dirname, "..", "dist", "pagefind")));
  for (const name of ["pagefind-ui.js", "pagefind-component-ui.js", "pagefind-modular-ui.js", "pagefind-highlight.js", "pagefind-ui.css", "pagefind-modular-ui.css", "pagefind-component-ui.css", "wasm.unknown.pagefind"]) {
    expect(present.has(name), name).toBe(false);
  }
  for (const name of ["pagefind.js", "pagefind-worker.js", "pagefind-entry.json"]) expect(present.has(name), name).toBe(true);
});

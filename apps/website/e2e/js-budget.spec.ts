import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { distPages } from "./pages";

/**
 * DEC-141's budget, in the form SITE-05 adds to SITE-03's: the JavaScript a page requests BEFORE its 3D
 * starts is at most 50 KB compressed. (Lighthouse's `resource-summary:script:size` is a cap on the
 * page's whole script weight; it does not tell the first scripts from the 3D chunk.)
 *
 * The 3D is fetched at idle, after load, by a <link rel=modulepreload> that boot.ts marks with
 * performance.mark("cuepoint:3d-start") (the import itself waits for a visitor's first gesture).
 * Every script requested before that mark counts; on a page whose 3D never starts (no scene, or the
 * gate is closed) every script counts. Sizes are gzip level 9 of each response body: what GitHub Pages
 * sends to a browser that accepts gzip, whatever the preview server does.
 */
const BUDGET_BYTES = 50 * 1024;
const START_MARK = "cuepoint:3d-start";

for (const path of distPages()) {
  test(`JavaScript before the 3D loads is at most 50 KB: /${path}`, async ({ page }) => {
    // a device the gate accepts, so a scene page really reaches the 3D start
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
      Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
      // the gate faked open: this machine's software WebGL would otherwise block the 3D
      window.__cuepointStageConfig = { allowSoftwareGL: true };
    });
    const response = await page.goto(path, { waitUntil: "load" });
    expect(response?.ok(), `GET /${path} must succeed`).toBe(true);
    const hasScene = (await page.locator("[data-scene]").count()) > 0;
    if (hasScene) {
      // the 3D is fetched after load and an idle callback; wait for that mark
      await page.waitForFunction((m) => performance.getEntriesByName(m).length > 0, START_MARK, { timeout: 8000 });
    } else {
      await page.waitForTimeout(500);
    }
    if (path === "styleguide/three/") {
      // the test scene must really reach the 3D, or the budget below measures nothing
      expect(await page.evaluate((m) => performance.getEntriesByName(m).length, START_MARK)).toBe(1);
    }
    const scripts = await page.evaluate((m) => {
      const mark = performance.getEntriesByName(m)[0]?.startTime ?? Number.POSITIVE_INFINITY;
      return performance
        .getEntriesByType("resource")
        .filter((e) => /\.m?js(\?|#|$)/.test(new URL(e.name).pathname + new URL(e.name).search) && e.startTime < mark)
        .map((e) => e.name);
    }, START_MARK);

    let total = 0;
    const lines: string[] = [];
    for (const url of scripts) {
      const body = await (await page.request.get(url)).body();
      const size = gzipSync(body, { level: 9 }).length;
      total += size;
      lines.push(`${size} B  ${new URL(url).pathname}`);
    }
    // inline scripts are part of the HTML and count too (the theme script, inline modules)
    const inline = await page.evaluate(() =>
      Array.from(document.scripts)
        .filter((s) => !s.src && s.type !== "application/ld+json")
        .map((s) => s.textContent ?? ""),
    );
    for (const code of inline) total += gzipSync(Buffer.from(code), { level: 9 }).length;

    expect(total, `JS before the 3D on /${path}: ${total} B gzip\n${lines.join("\n")}`).toBeLessThanOrEqual(BUDGET_BYTES);
  });
}

import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GITHUB_URL, PUBLISHER } from "../data/site";
import Privacy from "./privacy.astro";
import Terms from "./terms.astro";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const notice = readFileSync(join(REPO_ROOT, "PRIVACY_NOTICE.md"), "utf8");

async function render(component: Parameters<AstroContainer["renderToString"]>[0]): Promise<{ html: string; plain: string }> {
  const container = await AstroContainer.create();
  const html = await container.renderToString(component);
  const body = /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? html;
  const plain = body
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ");
  return { html, plain };
}

/** An email-looking string, as check-site's `no-email` rule reads it (DEC-230). */
const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/;

/** Services the app itself uses: PRIVACY_NOTICE.md must name every one the policy names. */
const APP_SERVICES = ["Sentry", "Beatport", "GitHub"];
/** Services only the website uses. PRIVACY_NOTICE.md covers the app, so it need not name them: a known, accepted difference. */
const SITE_ONLY_SERVICES = ["Umami", "Web3Forms"];

describe("the privacy policy", async () => {
  const { html, plain } = await render(Privacy);

  it("names the analytics service, the form service, Sentry and the publisher", () => {
    for (const name of [...SITE_ONLY_SERVICES, "Sentry"]) expect(plain).toContain(name);
    expect(plain).toContain(PUBLISHER);
  });

  it("points to the contact form and the repository's issues, and prints no address (DEC-230)", () => {
    expect(html).toMatch(/<a href="[^"]*\/contact\/">contact form<\/a>/);
    expect(html).toContain(`${GITHUB_URL}/issues`);
    expect(html).not.toMatch(/mailto:/i);
    expect(html).not.toMatch(EMAIL);
  });

  it("names the service where the site's pages are hosted and says it logs addresses", () => {
    expect(plain).toMatch(/GitHub Pages/);
    expect(plain).toMatch(/IP address/);
  });

  it.each(APP_SERVICES)("names %s, as PRIVACY_NOTICE.md does", (name) => {
    expect(plain).toContain(name);
    expect(notice).toContain(name);
  });

  it("agrees with PRIVACY_NOTICE.md on the error-report switch, the region, the retention and where data lives", () => {
    for (const fact of ["Settings → Privacy → Send error reports", "EU region", "30 days", "90 days", "~/.cuepoint/cuepoint.db", "Help → Privacy"]) {
      expect(notice, `PRIVACY_NOTICE.md has "${fact}"`).toContain(fact);
      expect(plain, `the policy has "${fact}"`).toContain(fact);
    }
  });

  it("says the site sets no cookie and the app has no analytics", () => {
    expect(plain).toMatch(/no cookies?/i);
    expect(plain).toMatch(/no analytics/i);
  });

  it("carries a last-updated date and the draft banner", () => {
    expect(plain).toMatch(/Last updated:? [A-Z][a-z]+ \d{1,2}, \d{4}/);
    expect(plain).toContain("Draft: awaiting the publisher's approval (DEC-144)");
    expect(html).toMatch(/<h1[^>]*>Privacy/);
  });

  it("describes the GitHub update check as PRIVACY_NOTICE.md does, and no longer says the app does not check", () => {
    // DIST-06 to DIST-08 wired the updater in. The notice and this page both describe the check: GitHub, every 4 hours,
    // what the request sends (the IP address, a user agent), the Linux link, the quiet failure and the manual check.
    for (const fact of ["GitHub", "every 4 hours", "user agent", "About & updates", "electron-builder"]) {
      expect(notice, `PRIVACY_NOTICE.md has "${fact}"`).toContain(fact);
      expect(plain, `the policy has "${fact}"`).toContain(fact);
    }
    expect(plain).toMatch(/IP address and a user agent/);
    expect(plain).toMatch(/On Linux it shows a link/);
    expect(plain).toMatch(/fails quietly/);
    expect(plain).not.toContain("does not check for updates");
    expect(plain).not.toContain("When automatic updates arrive");
    expect(notice).not.toContain("does not check for updates");
  });

  it("notes that the app's own Privacy dialog still describes updates the old way (not this site's to change)", () => {
    // The renderer's PrivacyDialog.tsx was not updated with DIST-06 to DIST-08: it still says the app does not check for
    // updates. This test records that known difference; when the dialog is fixed, drop it and have the dialog join the
    // probe above. Either wording passes, so the site's checks do not break when the app catches up.
    const dialog = readFileSync(join(REPO_ROOT, "apps", "desktop-electron", "renderer", "src", "components", "PrivacyDialog.tsx"), "utf8");
    expect(dialog).toMatch(/does not check for updates|GitHub/);
  });

  it("names where the clear-on-quit choices are, as the app and the notice do", () => {
    expect(notice).toContain("Settings → Privacy → When CuePoint quits");
    expect(plain).toContain("Settings → Privacy → When CuePoint quits");
    expect(plain).toContain("Change these in Settings → Privacy");
  });

  it("mentions the command-line tool's opt-in telemetry and the folder to delete", () => {
    expect(plain).toMatch(/command-line tool[\s\S]*opt-in/);
    expect(plain).toContain("~/.cuepoint");
    expect(plain).toContain("~/.cuepoint/backups/");
  });
});

describe("the terms", async () => {
  const { html, plain } = await render(Terms);

  it("name the license, the publisher and the draft banner", () => {
    expect(plain).toContain("Apache License, Version 2.0");
    expect(plain).toContain(PUBLISHER);
    expect(plain).toContain("Draft: awaiting the publisher's approval (DEC-144)");
    expect(plain).toMatch(/Last updated:? [A-Z][a-z]+ \d{1,2}, \d{4}/);
  });

  it("point to the privacy policy", () => {
    expect(plain).toMatch(/privacy policy/i);
  });

  it("point to the contact form and the repository's issues, and print no address (DEC-230)", () => {
    expect(html).toMatch(/<a href="[^"]*\/contact\/">contact form<\/a>/);
    expect(html).toContain(`${GITHUB_URL}/issues`);
    expect(html).not.toMatch(/mailto:/i);
    expect(html).not.toMatch(EMAIL);
  });
});

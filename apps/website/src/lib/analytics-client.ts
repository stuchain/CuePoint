import { EVENTS, shouldLoadAnalytics, trackEvent } from "./analytics";
import { CONSENT_STORAGE_KEY, unlistedCookies, type ConsentChoice } from "./consent";
import { THEME_EVENT, type ThemeEventDetail } from "./themes";

/**
 * The browser side of the analytics and the consent component (SITE-12; DEC-142, DEC-192), one small
 * script for every page, started by components/Analytics.astro.
 *
 * - It forwards the site's own events to Umami: `cuepoint:download` (SITE-07's download-client),
 *   `cuepoint:form-sent` (form-client) and the theme switch. The data is only what analytics.ts allows.
 * - It adds Umami's script (`defer`) only in a public build (data-public), so a preview build never sends
 *   an event to the real account.
 * - It lists the page's cookies. The site sets none; if one outside the allow list (consent.ts) is there,
 *   the banner turns on and Umami waits for the visitor's answer.
 *
 * The event names are repeated here as text on purpose, so this script does not pull in (and start)
 * download-client or form-client; analytics-client.test.ts reads their sources and fails if they drift.
 */
export const DOWNLOAD_EVENT_NAME = "cuepoint:download";
export const FORM_SENT_EVENT_NAME = "cuepoint:form-sent";

function readChoice(): ConsentChoice | null {
  try {
    const value = localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "yes" || value === "no" ? value : null;
  } catch {
    return null;
  }
}

function saveChoice(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    /* blocked storage: the choice lasts until the page is closed */
  }
}

function addUmami(config: DOMStringMap): void {
  const src = config["script"];
  const id = config["websiteId"];
  if (!src || !id || document.querySelector("script[data-website-id]")) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = src;
  script.dataset["websiteId"] = id;
  // Umami counts only this site's own address, so a copy of the page elsewhere is not counted
  if (config["domains"]) script.dataset["domains"] = config["domains"];
  document.head.append(script);
}

export function startAnalytics(root: HTMLElement): void {
  const config = root.dataset;
  const isPublic = config["public"] === "true";

  document.addEventListener(DOWNLOAD_EVENT_NAME, (event) => {
    const { system, chip } = (event as CustomEvent<{ system: string; chip: string }>).detail;
    trackEvent(EVENTS.download, { system, chip });
  });
  document.addEventListener(FORM_SENT_EVENT_NAME, (event) => {
    trackEvent(EVENTS.formSent, { form: (event as CustomEvent<{ form: string }>).detail.form });
  });
  document.addEventListener(THEME_EVENT, (event) => {
    trackEvent(EVENTS.themeChange, { theme: (event as CustomEvent<ThemeEventDetail>).detail.theme });
  });

  const unlisted = unlistedCookies(document.cookie);
  const consentNeeded = unlisted.length > 0;
  let choice = readChoice();
  const banner = root.querySelector<HTMLElement>("[data-consent-banner]");

  if (consentNeeded && choice === null && banner) {
    const names = banner.querySelector<HTMLElement>("[data-consent-names]");
    if (names) names.textContent = unlisted.join(", ");
    banner.hidden = false;
    // the fixed banner must not cover what a keyboard focus or an anchor scrolls to
    const page = document.documentElement;
    page.style.scrollPaddingBottom = `${banner.offsetHeight}px`;
    const answer = (value: ConsentChoice) => {
      choice = value;
      saveChoice(value);
      banner.hidden = true;
      page.style.scrollPaddingBottom = "";
      if (shouldLoadAnalytics({ isPublic, consentNeeded, choice })) addUmami(config);
    };
    banner.querySelector("[data-consent-yes]")?.addEventListener("click", () => answer("yes"));
    banner.querySelector("[data-consent-no]")?.addEventListener("click", () => answer("no"));
  }

  if (shouldLoadAnalytics({ isPublic, consentNeeded, choice })) addUmami(config);
}

// (guarded so a unit test can import the names above without a page)
const root = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("[data-analytics]");
if (root) startAnalytics(root);

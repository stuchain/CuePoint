/**
 * The consent component's rule (DEC-142). The site sets no cookie, so nothing needs consent today.
 * If a cookie that is not on this allow list ever appears (a new embed, a service), the banner turns
 * on and nothing non-essential runs until the visitor chooses. The allow list is empty on purpose.
 */
export const ALLOWED_COOKIES: readonly string[] = [];

/** The names in a `document.cookie` string. */
export function cookieNames(cookie: string): string[] {
  return cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name !== "");
}

/** The cookies in a `document.cookie` string that are not on the allow list. */
export function unlistedCookies(cookie: string, allowed: readonly string[] = ALLOWED_COOKIES): string[] {
  return cookieNames(cookie).filter((name) => !allowed.includes(name));
}

/** Where the visitor's choice is remembered: local storage, never a cookie. */
export const CONSENT_STORAGE_KEY = "cuepoint-site-consent";
export type ConsentChoice = "yes" | "no";

import { DEFAULT_HREFLANG } from "./locales";

/** What the sitemap integration hands `serialize`: an address and, for a translated page, its alternates. */
interface Item {
  url: string;
  links?: { url: string; lang: string }[] | undefined;
}

/**
 * Adds the `x-default` alternate to a translated page's sitemap entry (DEC-311): the integration lists one
 * alternate per language, and the pages themselves also name the English version as `x-default`. The sitemap and
 * the pages must give the same set, so the same address is added here. A page with no alternates is left alone.
 */
export function withXDefault<T extends Item>(item: T, defaultHreflang: string = DEFAULT_HREFLANG): T {
  const links = item.links;
  if (!links || links.length === 0 || links.some((l) => l.lang === "x-default")) return item;
  const english = links.find((l) => l.lang === defaultHreflang);
  return english ? { ...item, links: [...links, { url: english.url, lang: "x-default" }] } : item;
}

import { fmt } from "./format";

/**
 * Draws a UI string with its inline emphasis and links as HTML, for `set:html`. The only markup a string can
 * hold is `**bold**` and `[label](key)`; everything else is escaped, so a string can never inject HTML.
 * A link's key is looked up in `links` (a plain address, or an object with the attributes to add); a key that
 * is not there throws, so a translation cannot point a link at nothing.
 */
export interface RichLink {
  readonly href: string;
  /** An address that leaves the site gets `rel="noopener noreferrer"`. */
  readonly external?: boolean;
  /** The link's language, when it leaves the page's own (`hreflang="en"`). */
  readonly hreflang?: string | undefined;
  /** Marks the link `data-alt` (the download page's "Intel Mac?" link the script re-points). */
  readonly alt?: boolean;
}

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function rich(
  template: string,
  links: Readonly<Record<string, string | RichLink>> = {},
  values: Readonly<Record<string, string | number>> = {},
): string {
  const text = fmt(template, values);
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(([\w-]+)\)/g, (_m, label: string, key: string) => {
      const found = links[key];
      if (found === undefined) throw new Error(`rich: no link "${key}" for "${template}"`);
      const link: RichLink = typeof found === "string" ? { href: found } : found;
      const attrs = [
        link.alt ? " data-alt" : "",
        ` href="${escapeHtml(link.href)}"`,
        link.external ? ' rel="noopener noreferrer"' : "",
        link.hreflang ? ` hreflang="${escapeHtml(link.hreflang)}"` : "",
      ].join("");
      return `<a${attrs}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/** The text of a rich string with its markup taken off: what a reader (and a test) sees. */
export function plain(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return fmt(template, values)
    .replace(/\[([^\]]+)\]\([\w-]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

/**
 * The site's pages, in one list. The header and the footer both read it, and each later step
 * (features, download, guide, FAQ, changelog, blog, privacy, terms) adds its page here.
 * `path` is relative to the base, with no leading slash ("" is the home page).
 */
export interface NavItem {
  readonly label: string;
  readonly path: string;
  /** Whether the page is also listed in the header (the footer lists every page). */
  readonly header: boolean;
  /** The footer's group for the page; the home page has none (the footer's name links it). */
  readonly group?: FooterGroupId;
}

/** The footer's groups, in order: what CuePoint is, where to get help, the legal pages. */
export type FooterGroupId = "product" | "help" | "legal";
export const FOOTER_GROUPS: readonly { readonly id: FooterGroupId; readonly label: string }[] = [
  { id: "product", label: "Product" },
  { id: "help", label: "Help" },
  { id: "legal", label: "Legal" },
];

export const NAV: readonly NavItem[] = [
  { label: "Home", path: "", header: true },
  { label: "Features", path: "features/", header: true, group: "product" },
  { label: "Guide", path: "guide/", header: true, group: "help" },
  { label: "FAQ", path: "faq/", header: true, group: "help" },
  { label: "Download", path: "download/", header: true, group: "product" },
  { label: "Blog", path: "blog/", header: true, group: "product" },
  { label: "Compare", path: "compare/", header: false, group: "product" },
  { label: "Changelog", path: "changelog/", header: false, group: "product" },
  { label: "Contact", path: "contact/", header: false, group: "help" },
  { label: "Report a bug", path: "report-a-bug/", header: false, group: "help" },
  { label: "Privacy", path: "privacy/", header: false, group: "legal" },
  { label: "Terms", path: "terms/", header: false, group: "legal" },
];

/** Links that leave the site. */
export const EXTERNAL_NAV: readonly { readonly label: string; readonly href: string; readonly group: FooterGroupId }[] = [
  { label: "GitHub", href: "https://github.com/stuchain/CuePoint", group: "help" },
];

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
}

export const NAV: readonly NavItem[] = [
  { label: "Home", path: "", header: true },
  { label: "Guide", path: "guide/", header: true },
  { label: "FAQ", path: "faq/", header: true },
  { label: "Download", path: "download/", header: true },
  { label: "Blog", path: "blog/", header: true },
  { label: "Changelog", path: "changelog/", header: false },
  { label: "Contact", path: "contact/", header: false },
  { label: "Report a bug", path: "report-a-bug/", header: false },
  { label: "Privacy", path: "privacy/", header: false },
  { label: "Terms", path: "terms/", header: false },
];

/** Links that leave the site. */
export const EXTERNAL_NAV: readonly { readonly label: string; readonly href: string }[] = [
  { label: "GitHub", href: "https://github.com/stuchain/CuePoint" },
];

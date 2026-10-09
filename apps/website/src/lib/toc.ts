/** "On this page" for a guide page (SITE-09): its h2 and h3, in order, h3 nested under its h2. */

export interface Heading {
  readonly depth: number;
  readonly slug: string;
  readonly text: string;
}

export interface TocEntry {
  readonly slug: string;
  readonly text: string;
  readonly children: readonly { readonly slug: string; readonly text: string }[];
}

/** The page's sections and their parts. An h3 before any h2 stands as a section of its own. */
export function tocEntries(headings: readonly Heading[]): TocEntry[] {
  const out: { slug: string; text: string; children: { slug: string; text: string }[] }[] = [];
  for (const h of headings) {
    if (h.depth === 2 || (h.depth === 3 && out.length === 0)) out.push({ slug: h.slug, text: h.text, children: [] });
    else if (h.depth === 3) out[out.length - 1]!.children.push({ slug: h.slug, text: h.text });
  }
  return out;
}

/** A page gets the list only when it has at least two sections to jump between. */
export function needsToc(entries: readonly TocEntry[]): boolean {
  return entries.length >= 2;
}

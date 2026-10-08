/** Blog helpers (SITE-10): pure, so the tests can call them without a build. */

export interface PostSummary {
  slug: string;
  title: string;
  date: Date;
  tags: readonly string[];
  draft: boolean;
}

export interface RelatedLink {
  label: string;
  /** Relative to the base, with the trailing slash. */
  path: string;
}

const WORDS_PER_MINUTE = 200;

/** Whole minutes to read a Markdown body, at least one. Link addresses and code fences are not counted. */
export function readingMinutes(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\]\([^)]*\)/g, "] ")
    .replace(/<[^>]+>/g, " ");
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** The posts a build shows, newest first. Drafts appear only in a preview build. */
export function visiblePosts<T extends { date: Date; draft: boolean }>(posts: readonly T[], options: { preview: boolean }): T[] {
  return posts.filter((p) => options.preview || !p.draft).sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Share addresses: plain links to each service's own page, no script and no widget. */
export function shareLinks(url: string, title: string): { label: string; href: string }[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { label: "X", href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { label: "Bluesky", href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}` },
    { label: "Reddit", href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
  ];
}

/** Pages offered after a post when there are not enough other posts, in order of preference. */
const FALLBACK_PATHS = ["features/", "guide/", "download/", "changelog/"] as const;

/**
 * Two links for the end of a post: other posts first (those sharing a tag, then the newest), then
 * site pages that exist in the nav (features, guide, ...), so a link is never broken.
 */
export function relatedLinks(
  current: PostSummary,
  posts: readonly PostSummary[],
  nav: readonly { label: string; path: string }[],
  count = 2,
): RelatedLink[] {
  const shared = (p: PostSummary) => p.tags.filter((t) => current.tags.includes(t)).length;
  const others = posts
    .filter((p) => p.slug !== current.slug)
    .sort((a, b) => shared(b) - shared(a) || b.date.getTime() - a.date.getTime())
    .map((p) => ({ label: p.title, path: `blog/${p.slug}/` }));
  const pages = FALLBACK_PATHS.flatMap((path) => nav.filter((n) => n.path === path)).map((n) => ({ label: n.label, path: n.path }));
  return [...others, ...pages].slice(0, count);
}

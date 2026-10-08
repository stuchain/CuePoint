import { getCollection, type CollectionEntry } from "astro:content";
import { PUBLIC } from "../../site.config";
import { visiblePosts } from "./blog";

export type BlogEntry = CollectionEntry<"blog">;

/** The posts this build shows, newest first. Drafts are in preview builds (PUBLIC false) only. */
export async function getPosts(): Promise<BlogEntry[]> {
  const all = await getCollection("blog");
  return visiblePosts(
    all.map((entry) => ({ entry, date: entry.data.date, draft: entry.data.draft })),
    { preview: !PUBLIC },
  ).map((p) => p.entry);
}

export const summaryOf = (entry: BlogEntry) => ({
  slug: entry.id,
  title: entry.data.title,
  date: entry.data.date,
  tags: entry.data.tags,
  draft: entry.data.draft,
});

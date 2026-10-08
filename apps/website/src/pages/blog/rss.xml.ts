import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { SITE_NAME } from "../../data/site";
import { canonicalFor } from "../../lib/url";
import { getPosts } from "../../lib/posts";

/** The blog's RSS 2.0 feed (SITE-10). Drafts are in it only in preview builds, like the blog itself. */
export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const feedUrl = canonicalFor("blog/rss.xml");
  const feedSite = canonicalFor("blog/");
  return rss({
    title: `${SITE_NAME} blog`,
    description: "News and notes about CuePoint, the free desktop app that cleans up a Rekordbox library.",
    // the channel link: the blog, not the site root
    site: feedSite,
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<language>en-us</language><atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>`,
    items: posts.map((post) => {
      const link = canonicalFor(`blog/${post.id}/`);
      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        link,
        categories: [...post.data.tags],
      };
    }),
  });
};

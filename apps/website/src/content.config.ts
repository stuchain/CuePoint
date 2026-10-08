import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { PUBLISHER } from "./data/site";

/**
 * The blog (SITE-10): one Markdown file per post in src/content/blog/. A missing or malformed field
 * fails the build. Title and description limits are the ones check-site enforces on the page
 * (title 60 characters at most, description 70 to 160), so a post that would fail the check fails here first.
 *
 * Each collection is its own exported const so sibling steps (the guide, SITE-09) add theirs to
 * `collections` below without touching this one.
 */
export const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1).max(60),
      description: z.string().min(70).max(160),
      date: z.coerce.date(),
      /** The publisher (DEC-144) unless the post names someone else. */
      author: z.string().min(1).default(PUBLISHER),
      /** Set when a post is changed after publishing; it becomes dateModified. */
      updated: z.coerce.date().optional(),
      /** A file under src/assets, relative to the post. It is the post's social card until SITE-11's generator makes its own. */
      image: image(),
      imageAlt: z.string().min(1),
      tags: z.array(z.string().min(1)).min(1),
      /** A draft shows only in preview builds (PUBLIC false); it is left out of the public site and the feed. */
      draft: z.boolean().default(false),
    }),
});

export const collections = { blog };

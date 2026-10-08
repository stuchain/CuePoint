import { defineCollection } from "astro:content";
import { file, glob, type Loader } from "astro/loaders";
import { z } from "astro/zod";
import { PUBLISHER } from "./data/site";
import { assertGuideTable } from "./content/guide";
import { guideLinkConfig } from "./lib/guide-config";
import { guideFiles, validateGuideLinks } from "./lib/guide-links";


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

/**
 * The guide: docs/user-guide/*.md where they are (DEC-139). The wrapper checks the table and every link
 * before the glob loader renders, because the glob loader only logs a render error and carries on:
 * a broken link must fail the build, not make an empty page.
 */
function guideLoader(): Loader {
  const inner = glob({ pattern: "*.md", base: "../../docs/user-guide" });
  return {
    name: "guide-loader",
    async load(context) {
      const cfg = guideLinkConfig();
      assertGuideTable(guideFiles(cfg.guideDir));
      await validateGuideLinks(cfg);
      await inner.load(context);
      for (const entry of context.store.values()) {
        if (!entry.rendered?.html) throw new Error(`The guide page ${entry.id} did not render; see the error above.`);
      }
    },
  };
}

export const guide = defineCollection({ loader: guideLoader() });

/** The FAQ: src/content/faq.yaml. Each answer links the guide by page and heading, checked at build. */
export const faq = defineCollection({
  loader: file("src/content/faq.yaml"),
  schema: z.object({
    /** The order on the page. */
    order: z.number().int(),
    question: z.string().min(8),
    answer: z.string().min(20),
    links: z
      .array(
        z.object({
          /** The guide page: its file name without .md. */
          page: z.string(),
          /** A heading on that page, as its id. */
          heading: z.string().optional(),
          label: z.string(),
        }),
      )
      .min(1),
  }),
});

export const collections = { blog, guide, faq };

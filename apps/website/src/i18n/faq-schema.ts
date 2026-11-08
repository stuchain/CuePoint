import { z } from "astro/zod";

/**
 * The shape of one FAQ entry's data, written once: the English `faq` collection (src/content.config.ts) and the
 * other languages' files (src/i18n/faq-load.ts) are checked with it. Each answer links the guide by page and heading.
 */
export const faqFields = {
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
};

/** One entry of a language's file, which carries its id. */
export const faqEntrySchema = z.object({ id: z.string(), ...faqFields });

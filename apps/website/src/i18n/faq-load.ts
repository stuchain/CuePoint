import { getCollection } from "astro:content";
import { z } from "astro/zod";
import yaml from "js-yaml";
import { DEFAULT_LOCALE, type LocaleCode } from "./locales";

/**
 * The FAQ entries of a language (DEC-311): English is the `faq` collection (src/content/faq.yaml); another
 * language is `src/content/faq.<code>.yaml`, found by name and checked with the same schema.
 */
export interface FaqEntry {
  id: string;
  order: number;
  question: string;
  answer: string;
  links: { page: string; heading?: string | undefined; label: string }[];
}

const schema = z.array(
  z.object({
    id: z.string(),
    order: z.number().int(),
    question: z.string().min(8),
    answer: z.string().min(20),
    links: z.array(z.object({ page: z.string(), heading: z.string().optional(), label: z.string() })).min(1),
  }),
);

const files = import.meta.glob<string>("../content/faq.*.yaml", { query: "?raw", import: "default", eager: true });

export async function faqEntries(locale: LocaleCode): Promise<FaqEntry[]> {
  if (locale === DEFAULT_LOCALE) {
    return (await getCollection("faq")).map((e) => ({ id: e.id, ...e.data })).sort((a, b) => a.order - b.order);
  }
  const file = Object.entries(files).find(([name]) => name.endsWith(`/faq.${locale}.yaml`));
  if (!file) throw new Error(`No FAQ for "${locale}": add src/content/faq.${locale}.yaml (docs/translation.md)`);
  return schema.parse(yaml.load(file[1])).sort((a, b) => a.order - b.order);
}

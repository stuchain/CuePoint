import type { ImageMetadata } from "astro";
import type { Crumb } from "../components/Breadcrumbs.types";
import type { LocaleCode } from "../i18n/locales";

/**
 * The only pages allowed to be `noindex` on purpose, and why. A string, not a boolean, so a
 * page cannot be hidden from search by accident (DEC-141).
 */
export type NoindexReason = "404" | "thank-you";

/** A JSON-LD object, as it will be written into the page. */
export type JsonLd = Readonly<Record<string, unknown>>;

export interface PageProps {
  /**
   * The page's language (DEC-311): `<html lang>`, the canonical address, og:locale. Left out, it is read from the
   * address (English at the root). A language other than English is only for a translated page, and `path` is
   * then still the ENGLISH path: the layout adds the language's folder.
   */
  locale?: LocaleCode;
  /** The page's `<title>` and its Open Graph title. */
  title: string;
  /** The meta description and its Open Graph description. */
  description: string;
  /** The page's path relative to the base, no leading slash: "" is home, "download/" is /download/ (in English, whatever its language). */
  path: string;
  /** A ready-made social card; leave it out and the page's card is drawn at build from its title. */
  ogImage?: ImageMetadata;
  /** An app picture drawn on the generated card (SITE-11); ignored when `ogImage` is given. */
  ogPicture?: ImageMetadata;
  /** JSON-LD objects, one `<script>` each. */
  schema?: readonly JsonLd[];
  /** The trail shown above the page; the layout also writes it as a BreadcrumbList. */
  breadcrumbs?: readonly Crumb[];
  noindex?: NoindexReason;
  /** Open Graph type: "website" (the default) or "article" for a blog post. */
  ogType?: "website" | "article";
  /** For an article: its publication time, written as article:published_time (ISO 8601). */
  publishedTime?: string;
  /** For an article: its tags, one article:tag each. */
  tags?: readonly string[];
}

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { GITHUB_BRANCH, GITHUB_URL } from "../data/site";
import { answerText, faqSchema, paragraphs } from "../lib/faq";
import { rewriteLink, type GuideLinkConfig } from "../lib/guide-links";

interface Entry {
  id: string;
  order: number;
  question: string;
  answer: string;
  links: { page: string; heading?: string; label: string }[];
}

const REPO = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const CFG: GuideLinkConfig = { guideDir: join(REPO, "docs", "user-guide"), repoRoot: REPO, base: "/", githubUrl: GITHUB_URL, branch: GITHUB_BRANCH };
const entries = load(readFileSync(new URL("./faq.yaml", import.meta.url), "utf8")) as Entry[];

describe("faq.yaml", () => {
  it("answers what a new visitor asks", () => {
    const text = entries.map((e) => `${e.question} ${e.answer}`).join("\n");
    for (const topic of [/free/i, /Rekordbox library/i, /need to run/i, /Apple Silicon/, /Intel/, /Sentry/, /Send error reports/, /update/i, /where is my data/i, /Report a problem/]) {
      expect(text).toMatch(topic);
    }
  });

  it("has unique ids and questions, and every answer links the guide", () => {
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    expect(new Set(entries.map((e) => e.question)).size).toBe(entries.length);
    for (const e of entries) expect(e.links.length, e.id).toBeGreaterThan(0);
  });

  it("is written in the order it is shown", () => {
    expect(entries.map((e) => e.order)).toEqual(entries.map((_, i) => i + 1));
  });

  it("keeps each answer short", () => {
    for (const e of entries) expect(answerText(e.answer).split(/\s+/).length, e.id).toBeLessThanOrEqual(110);
  });

  it("links only to guide pages and headings that exist", async () => {
    for (const e of entries) {
      for (const l of e.links) {
        const href = await rewriteLink(`${l.page}.md${l.heading ? `#${l.heading}` : ""}`, join(CFG.guideDir, "faq.md"), CFG);
        expect(href, `${e.id}: ${l.label}`).toMatch(/^\/guide\/[a-z-]+\/(#[a-z0-9-]+)?$/);
      }
    }
  });

  it("fails a link to a heading that is not there", async () => {
    await expect(rewriteLink("clean.md#no-such-heading", join(CFG.guideDir, "faq.md"), CFG)).rejects.toThrow();
    await expect(rewriteLink("no-such-page.md", join(CFG.guideDir, "faq.md"), CFG)).rejects.toThrow();
  });

  it("uses none of the words the copy avoids", () => {
    const text = JSON.stringify(entries);
    expect(text).not.toMatch(/\bengine\b|\bjobs?\b/i);
  });
});

describe("faqSchema", () => {
  it("builds a FAQPage from the same entries", () => {
    const schema = faqSchema(entries);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(entries.length);
    expect(schema.mainEntity[0]).toEqual({
      "@type": "Question",
      name: entries[0]!.question,
      acceptedAnswer: { "@type": "Answer", text: answerText(entries[0]!.answer) },
    });
  });

  it("splits paragraphs on blank lines and joins them for the schema", () => {
    expect(paragraphs("One.\n\nTwo.\n")).toEqual(["One.", "Two."]);
    expect(answerText("One.\n\nTwo.")).toBe("One. Two.");
  });
});

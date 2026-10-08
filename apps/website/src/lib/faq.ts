/** The FAQ's data helpers (SITE-09): the page and the FAQPage JSON-LD both read the same entries. */

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

/** An answer's paragraphs: blank lines in the YAML separate them. */
export function paragraphs(answer: string): string[] {
  return answer
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** The text of an answer as one string, for the JSON-LD (paragraphs joined by a space). */
export function answerText(answer: string): string {
  return paragraphs(answer).join(" ");
}

/** The FAQPage structured data (https://developers.google.com/search/docs/appearance/structured-data/faqpage). */
export function faqSchema(items: readonly FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: answerText(item.answer) },
    })),
  };
}

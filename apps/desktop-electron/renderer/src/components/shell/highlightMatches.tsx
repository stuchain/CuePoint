import { Fragment } from "react";

/** A stretch of a title, and whether the search words matched it. */
export interface TextPart {
  text: string;
  match: boolean;
}

const SPECIAL = /[.*+?^${}()|[\]\\]/g;

/**
 * Splits `text` where any word of `query` occurs, ignoring case. Words are the query cut at its
 * spaces; the text is returned whole and in order, so the parts always join back into it.
 */
export function splitMatches(text: string, query: string): TextPart[] {
  const words = query
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(SPECIAL, "\\$&"));
  if (words.length === 0 || text === "") return [{ text, match: false }];
  const pattern = new RegExp(`(${words.join("|")})`, "gi");
  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, match: new RegExp(`^(?:${words.join("|")})$`, "i").test(part) }));
}

/** The text with the part the search matched in a `<mark>` (C135); marked text is drawn, not bold. */
export function Highlighted({ text, query, className }: { text: string; query: string; className?: string }) {
  return (
    <>
      {splitMatches(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className={className}>
            {part.text}
          </mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * A credit with each name in it a link to its page (DISCOVER-11).
 *
 * Buttons that read as text, because they sit inside a sentence: the name is
 * the label, and the hint says which page it opens and how CuePoint knows who
 * it is (DEC-095).
 */
import type { EntityKind, TrackCreditLink } from "../../api/cuepointBridge.types";
import { creditSegments } from "./creditSegments";
import "./CreditLinks.css";

interface CreditLinksProps {
  credit: string;
  links: readonly TrackCreditLink[];
  onOpen: (kind: EntityKind, ref: string) => void;
}

function hint(link: TrackCreditLink): string {
  const page = link.kind === "label" ? "label page" : "artist page";
  return link.identity === "beatport"
    ? `Open the ${page} (Beatport ${link.kind})`
    : `Open the ${page} (grouped by name)`;
}

export function CreditLinks({ credit, links, onOpen }: CreditLinksProps) {
  return (
    <>
      {creditSegments(credit, links).map(({ text, link }, index) =>
        link ? (
          <button
            // The split keeps each name once, so a ref is unique in a credit;
            // the index keeps the key stable all the same.
            key={`${link.ref}-${index}`}
            type="button"
            className="cp-credit-link"
            title={hint(link)}
            onClick={() => onOpen(link.kind, link.ref)}
          >
            {text}
          </button>
        ) : (
          <span key={`text-${index}`}>{text}</span>
        ),
      )}
    </>
  );
}

import { useState, type ReactNode } from "react";
import { Disclosure } from "./Disclosure";
import "./MoreAbout.css";

interface MoreAboutProps {
  children: ReactNode;
  /** Button text while collapsed. */
  label?: string;
  /** The id of the line this belongs to, so the button is told apart from its siblings. */
  describedBy?: string;
  /** Open on first render, for a link that must land on something inside. Not remembered. */
  defaultOpen?: boolean;
}

/**
 * The detail behind a one-line explanation: the shared `Disclosure` (title on the edge, arrow at
 * the row end) with "More about this" / "Less about this"; nothing is remembered, so it is collapsed
 * on load unless `defaultOpen` says otherwise.
 */
export function MoreAbout({ children, label = "More about this", describedBy, defaultOpen = false }: MoreAboutProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Disclosure
      className="cp-more-about"
      title={open ? "Less about this" : label}
      open={open}
      onOpenChange={setOpen}
      describedBy={describedBy}
    >
      <div className="cp-more-about__body">{children}</div>
    </Disclosure>
  );
}

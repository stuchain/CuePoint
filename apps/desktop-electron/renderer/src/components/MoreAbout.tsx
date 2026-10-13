import { useId, useState, type ReactNode } from "react";
import { Button } from "./Button";
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
 * The detail behind a one-line explanation. A visible secondary button opens
 * it; nothing is remembered, so it is collapsed on load unless `defaultOpen` says otherwise.
 */
export function MoreAbout({ children, label = "More about this", describedBy, defaultOpen = false }: MoreAboutProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <div className="cp-more-about">
      <Button
        variant="secondary"
        className="cp-more-about__toggle"
        aria-expanded={open}
        aria-controls={regionId}
        aria-describedby={describedBy}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Less about this" : label}
      </Button>
      <div id={regionId} className="cp-more-about__body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

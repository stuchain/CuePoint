import { useId, useState, type ReactNode } from "react";
import { Button } from "./Button";
import "./MoreAbout.css";

interface MoreAboutProps {
  children: ReactNode;
  /** Button text while collapsed. */
  label?: string;
  /** The id of the line this belongs to, so the button is told apart from its siblings. */
  describedBy?: string;
}

/**
 * The detail behind a one-line explanation. A visible secondary button opens
 * it; nothing is remembered, so it is always collapsed on load.
 */
export function MoreAbout({ children, label = "More about this", describedBy }: MoreAboutProps) {
  const [open, setOpen] = useState(false);
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
        {open ? "Less" : label}
      </Button>
      <div id={regionId} className="cp-more-about__body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

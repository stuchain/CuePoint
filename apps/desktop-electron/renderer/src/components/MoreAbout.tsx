import { useId, useState, type ReactNode } from "react";
import "./MoreAbout.css";

interface MoreAboutProps {
  children: ReactNode;
  /** Button text while collapsed. */
  label?: string;
}

/**
 * The detail behind a one-line explanation. A visible secondary button opens
 * it; nothing is remembered, so it is always collapsed on load.
 */
export function MoreAbout({ children, label = "More about this" }: MoreAboutProps) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <div className="cp-more-about">
      <button
        type="button"
        className="cp-btn cp-btn--secondary cp-more-about__toggle"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Less" : label}
      </button>
      <div id={regionId} className="cp-more-about__body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

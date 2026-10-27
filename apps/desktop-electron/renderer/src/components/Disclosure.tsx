import { useId, useState, type ReactNode } from "react";
import { DisclosureArrow } from "./DisclosureArrow";
import "./Disclosure.css";

interface DisclosureProps {
  /** The head's words, in the pixel face on the content edge. */
  title: ReactNode;
  /** Said at the right of the head, before the arrow, so a folded part still tells its news. */
  summary?: ReactNode;
  children: ReactNode;
  /** Open on first render. Not remembered here: a caller that remembers passes `open`. */
  defaultOpen?: boolean;
  /** Controlled open state; with it, `onOpenChange` is called instead of the component keeping its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The id of a line this belongs to, so the head is told apart from its siblings. */
  describedBy?: string;
  /** `h3` / `h4` wraps the head in a heading of that level; none (the default) is a bare button. */
  level?: 3 | 4;
  className?: string;
}

/**
 * The one disclosure (M60): a head that folds what is under it. One control-height target, the title
 * in the pixel face on the content edge (never inset by a button's padding), the answer if there is
 * one at the right, and the arrow at the row end (W4). Dialogs, Settings and Track details all use it;
 * `MoreAbout` is this with the "More about this" words.
 */
export function Disclosure({
  title,
  summary,
  children,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  describedBy,
  level,
  className = "",
}: DisclosureProps) {
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const bodyId = useId();
  const toggle = () => {
    if (controlled === undefined) setOwn(!open);
    onOpenChange?.(!open);
  };
  const head = (
    <button
      type="button"
      className="cp-fold__head"
      aria-expanded={open}
      aria-controls={bodyId}
      aria-describedby={describedBy}
      onClick={toggle}
    >
      <span className="cp-fold__title">{title}</span>
      {summary ? <span className="cp-fold__summary">{summary}</span> : null}
      <span aria-hidden className="cp-fold__arrow">
        <DisclosureArrow open={open} />
      </span>
    </button>
  );
  const Heading = level === 3 ? "h3" : level === 4 ? "h4" : null;
  return (
    <div className={`cp-fold ${className}`.trim()}>
      {Heading ? <Heading className="cp-fold__heading">{head}</Heading> : head}
      <div id={bodyId} className="cp-fold__body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

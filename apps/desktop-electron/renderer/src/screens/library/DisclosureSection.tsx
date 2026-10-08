/**
 * A heading that folds what is under it (INS-3).
 *
 * Track details has many sections and a reader wants a few of them at a time,
 * so every heading is a button, and the panel remembers which ones were folded
 * in one key. What is folded stays in the page (`hidden`), so a note being
 * typed or a read in flight is not thrown away by a click.
 *
 * Storage is a convenience: it can be blocked or full, and then folds last as
 * long as the section does.
 */
import { useCallback, useId, useState, type ReactNode } from "react";

export const TRACK_DETAILS_SECTIONS_KEY = "cuepoint-ui-track-details-sections";

type Folds = Record<string, boolean>;

function readFolds(): Folds {
  try {
    const raw = localStorage.getItem(TRACK_DETAILS_SECTIONS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const folds: Folds = {};
    for (const [id, open] of Object.entries(parsed)) {
      if (typeof open === "boolean") folds[id] = open;
    }
    return folds;
  } catch {
    return {};
  }
}

function rememberFold(id: string, open: boolean): void {
  try {
    localStorage.setItem(TRACK_DETAILS_SECTIONS_KEY, JSON.stringify({ ...readFolds(), [id]: open }));
  } catch {
    // Blocked or full: the fold still works for as long as the page is open.
  }
}

interface DisclosureSectionProps {
  /** The key it is remembered under. */
  id: string;
  title: string;
  /** Said beside the title, so a folded section still tells its news: "Accepted", "4 changes". */
  summary?: string | null;
  /** What the heading explains on hover. */
  hint?: string;
  /** Open until the person folds it. */
  defaultOpen: boolean;
  /**
   * False for a section that opens itself from what the track holds (an edited
   * value): that is the track's news, not the person's choice.
   */
  remember?: boolean;
  /** `h3` for a section of the panel, `h4` for one inside another. */
  level?: 3 | 4;
  className?: string;
  children: ReactNode;
}

export function DisclosureSection({
  id,
  title,
  summary,
  hint,
  defaultOpen,
  remember = true,
  level = 3,
  className,
  children,
}: DisclosureSectionProps) {
  const [open, setOpen] = useState(() => (remember ? (readFolds()[id] ?? defaultOpen) : defaultOpen));
  const bodyId = useId();
  // The body steps open once the person has used the toggle, never as the panel loads
  // (Changing state, PAGES-12).
  const [used, setUsed] = useState(false);

  const toggle = useCallback(() => {
    setUsed(true);
    setOpen(!open);
    if (remember) rememberFold(id, !open);
  }, [id, open, remember]);

  const Heading = level === 3 ? "h3" : "h4";
  return (
    <section
      className={`cp-track-section${className ? ` ${className}` : ""}`}
      aria-label={title}
    >
      <Heading className="cp-track-detail__subtitle cp-track-section__heading">
        <button
          type="button"
          className="cp-track-section__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          title={hint}
          onClick={toggle}
        >
          <span aria-hidden className="cp-track-section__chevron">
            {open ? "▾" : "▸"}
          </span>
          <span>{summary ? `${title} · ${summary}` : title}</span>
        </button>
      </Heading>
      <div
        id={bodyId}
        className={`cp-track-section__body${used ? " cp-track-section__body--used" : ""}`}
        hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}

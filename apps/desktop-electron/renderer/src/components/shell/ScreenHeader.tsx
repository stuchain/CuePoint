import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./ScreenHeader.css";

export interface ScreenHeaderProps {
  /** The page name. Always the text of the one `<h1>`. */
  title: string;
  /**
   * What the title slot draws instead of `title` (a playlist's name, say). The `<h1>` then
   * still holds the page name, visually hidden, so a screen reader hears the page.
   * drawn `aria-hidden`, so it must hold no interactive content (no buttons, links or fields).
   */
  display?: ReactNode;
  /** Where this is inside the page, drawn above the title. */
  crumb?: ReactNode;
  /** Beside the title on the left (Prepare's Set picker). */
  beside?: ReactNode;
  /** One muted line under the title; ellipsized. */
  summary?: ReactNode;
  /** The page's buttons, at the right. */
  actions?: ReactNode;
  /** The page's tab strip, in its own row below. */
  tabs?: ReactNode;
  /** A Badge. */
  status?: ReactNode;
  /** Pad the sides, for a page whose own box has no padding. */
  inset?: boolean;
}

/**
 * The one header every page uses (G6 T4): a grid of `title + beside | actions`, a summary
 * line, a tabs row and a single divider under all of it. It sticks to the top of a
 * scrolling screen, so the title and the actions never scroll away.
 */
export function ScreenHeader({
  title,
  display,
  crumb,
  beside,
  summary,
  actions,
  tabs,
  status,
  inset = false,
}: ScreenHeaderProps) {
  const root = useRef<HTMLElement>(null);
  // The header sticks, so what sticks or scrolls under it needs its height: the page gets it as
  // `--screen-header-height`.
  useLayoutEffect(() => {
    const header = root.current;
    const host = header?.parentElement;
    if (!header || !host) return;
    const measure = () => host.style.setProperty("--screen-header-height", `${header.offsetHeight}px`);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(header);
    return () => {
      observer?.disconnect();
      host.style.removeProperty("--screen-header-height");
    };
  }, []);
  const hasDisplay = display !== undefined && display !== null && display !== false && display !== "";
  return (
    <header ref={root} className={inset ? "cp-screen-header cp-screen-header--inset" : "cp-screen-header"}>
      {crumb && <div className="cp-screen-header__crumb">{crumb}</div>}
      <div className="cp-screen-header__main">
        <div className="cp-screen-header__title-row">
          <h1 className={`cp-screen-header__title ${hasDisplay ? "cp-screen-header__title--hidden cp-visually-hidden" : ""}`.trim()}>
            {title}
          </h1>
          {hasDisplay && (
            <div className="cp-screen-header__display" aria-hidden="true">
              {display}
            </div>
          )}
          {status && <div className="cp-screen-header__status">{status}</div>}
          {beside && <div className="cp-screen-header__beside">{beside}</div>}
        </div>
        {actions && <div className="cp-screen-header__actions">{actions}</div>}
      </div>
      {summary && <p className="cp-screen-header__summary">{summary}</p>}
      {tabs && <div className="cp-screen-header__tabs">{tabs}</div>}
    </header>
  );
}

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { countNoun } from "../../format/counts";
import { DetailsToggle } from "./detailsToggle";
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
  /**
   * The title (or `display`) is the page's data, a name the person gave or Beatport did (an artist,
   * a label, a playlist): it may be long, so it shrinks with an ellipsis and carries its whole
   * value in the hint rather than push the status and actions out of the header (M190).
   */
  dataTitle?: boolean;
  /** Where this is inside the page, drawn above the title. */
  crumb?: ReactNode;
  /**
   * Beside the title, aligned to the title row (Prepare's Set picker, Statistics' scope picker):
   * whatever its height, it never moves the title, which sits at the same place on every page.
   * `beside` is the older name for the same slot.
   */
  extras?: ReactNode;
  beside?: ReactNode;
  /** The facts line: one muted line under the title; ellipsized. */
  summary?: ReactNode;
  /**
   * The facts line, typed (C233): a count and its noun, then each fact, as
   * "1,234 tracks · 3 playlists". Use this rather than writing the line by hand; `summary` is for
   * a line that is not a count.
   */
  facts?: HeaderFacts;
  /**
   * The page's buttons, at the right. The header adds the Details toggle after them, behind a
   * small divider (no page passes it); a page without actions gets it alone on the title row.
   */
  actions?: ReactNode;
  /**
   * The page-wide actions (D7), right-aligned, 8 left of the Details toggle. Selection actions
   * live in the bar above the list, never here.
   */
  pageActions?: ReactNode;
  /** The page's tab strip, in its own row below. */
  tabs?: ReactNode;
  /** A Badge. */
  status?: ReactNode;
  /** Pad the sides, for a page whose own box has no padding. */
  inset?: boolean;
  /**
   * The content is a strip attached to the header (a table or a toolbar that starts straight
   * under the divider): no gap below it. Otherwise the header leaves 12 between its divider
   * and the first content, and a page adds none of its own.
   */
  attached?: boolean;
}

/** The typed facts line of a header: "<count> <noun> · <fact> · <fact>". */
export interface HeaderFacts {
  count: number;
  /** The singular noun ("track", "Set"); `many` is the plural when it is not "<noun>s". */
  noun: string;
  many?: string;
  facts?: readonly string[];
}

/** The facts as one line: the grouped count with its noun, then each fact, a middle dot apart. */
export function factsLine({ count, noun, many, facts = [] }: HeaderFacts): string {
  return [countNoun(count, noun, many), ...facts].join(" · ");
}

/** What the page reserves for its sticky header, in px: its height and the gap above it (NaN reads as none). */
export function headerHeightPx(offsetHeight: number, top: number): number {
  return Math.round(offsetHeight + (Number.isFinite(top) ? top : 0));
}

/**
 * The one header every page uses (G6 T4): a grid of `title + beside | actions`, a summary
 * line, a tabs row and a single divider under all of it. It sticks to the top of a
 * scrolling screen, so the title and the actions never scroll away.
 */
export function ScreenHeader({
  title,
  display,
  dataTitle = false,
  crumb,
  extras,
  beside,
  summary,
  facts,
  actions,
  pageActions,
  tabs,
  status,
  inset = false,
  attached = false,
}: ScreenHeaderProps) {
  const root = useRef<HTMLElement>(null);
  // The header sticks, so what sticks or scrolls under it needs its height: the page gets it as
  // `--screen-header-height`. The panels beside the page take the same height as `--side-head-height`
  // on the root, so their title bars meet this header's line (M50, D9).
  useLayoutEffect(() => {
    const header = root.current;
    const host = header?.parentElement;
    if (!header || !host) return;
    const rootStyle = document.documentElement.style;
    let written: string | null = null;
    // A plain pixel number, so a script can read it (`useSectionInView`): the header's height
    // plus the gap it keeps above itself when it sticks.
    const measure = () => {
      const top = Number.parseFloat(getComputedStyle(header).top);
      const height = `${headerHeightPx(header.offsetHeight, top)}px`;
      host.style.setProperty("--screen-header-height", height);
      // A header of a page kept hidden measures 0: it leaves the shown page's value alone.
      if (header.offsetHeight > 0) {
        rootStyle.setProperty("--side-head-height", height);
        written = height;
      }
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(header);
    return () => {
      observer?.disconnect();
      host.style.removeProperty("--screen-header-height");
      if (written !== null && rootStyle.getPropertyValue("--side-head-height") === written) {
        rootStyle.removeProperty("--side-head-height");
      }
    };
  }, []);
  const hasDisplay = display !== undefined && display !== null && display !== false && display !== "";
  return (
    <header
      ref={root}
      className={`cp-screen-header${inset ? " cp-screen-header--inset" : ""}${attached ? " cp-screen-header--attached" : ""}`}
    >
      {crumb && <div className="cp-screen-header__crumb">{crumb}</div>}
      <div className="cp-screen-header__main">
        <div className="cp-screen-header__title-row">
          <h1
            className={`cp-screen-header__title ${hasDisplay ? "cp-screen-header__title--hidden cp-visually-hidden" : ""}${dataTitle && !hasDisplay ? " cp-screen-header__title--data" : ""}`.trim()}
            data-cut-hint={dataTitle && !hasDisplay ? "" : undefined}
          >
            {title}
          </h1>
          {hasDisplay && (
            <div
              className={`cp-screen-header__display${dataTitle ? " cp-screen-header__display--data" : ""}`}
              aria-hidden="true"
              data-cut-hint={dataTitle ? "" : undefined}
            >
              {display}
            </div>
          )}
          {status && <div className="cp-screen-header__status">{status}</div>}
          {(extras || beside) && (
            <div className="cp-screen-header__beside">
              {beside}
              {extras}
            </div>
          )}
        </div>
        <div className="cp-screen-header__actions">
          {actions}
          {pageActions}
          <DetailsToggle divided={Boolean(actions || pageActions)} />
        </div>
      </div>
      {(facts || summary) && <p className="cp-screen-header__summary">{facts ? factsLine(facts) : summary}</p>}
      {tabs && <div className="cp-screen-header__tabs">{tabs}</div>}
    </header>
  );
}

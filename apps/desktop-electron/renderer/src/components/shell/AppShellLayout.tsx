import { useEffect, useRef, type ReactNode } from "react";
import "./AppShellLayout.css";

interface AppShellLayoutProps {
  /** Shell header: the search, and PAGES-10's wheel button. */
  header?: ReactNode;
  /** Primary navigation. The sidebar moves in here in SHELL-02. */
  sidebar?: ReactNode;
  /** Track Inspector, docked right. SHELL-05. */
  inspector?: ReactNode;
  /** Player transport. Stays empty until Phase 5, per DEC-025. */
  player?: ReactNode;
  /** Engine and job status strip. SHELL-07. */
  statusBar?: ReactNode;
  /**
   * One row directly above the page, between the header and the content, not
   * spanning the sidebar or Inspector: the offline banner.
   */
  banner?: ReactNode;
  /**
   * The background process is not there: the page is dimmed and its controls
   * stop answering clicks. Reading, scrolling and selecting text still work.
   */
  offline?: boolean;
  /** A click on the offline page was stopped; the banner is told to draw the eye. */
  onBlockedClick?: () => void;
  /** The routed page. */
  children: ReactNode;
  /** Alternates a/b each time the page changes; CSS names a different step-in for each (PAGES-12). */
  pagePhase?: "a" | "b";
}

/** What a click can press: a click inside one of these is stopped while offline. */
const PRESSABLE = 'button, [role="menuitem"], [role="button"], a[href], input[type="checkbox"]';

/** Dialogs rendered inside the page (the modal is not portaled) stay usable offline. */
const DIALOGS = '[role="dialog"], [role="alertdialog"]';

/**
 * The application frame: a grid of named regions that later Phase 2 steps fill.
 *
 * Every region except the content area is optional, and an absent region is not
 * rendered at all rather than rendered empty. That is what lets the grid tracks
 * collapse to zero: an empty `auto` track takes no space, but an empty *element*
 * still carries whatever border and padding its class gives it. DEC-025's
 * "occupies no space until Phase 5" player slot depends on this property, so the
 * conditionals are load-bearing, not tidiness.
 *
 * Landmarks (SHELL-10). `main` here and `contentinfo` on the status strip;
 * `search` is the search field's own container (PAGES-03B: the header row also
 * holds the Camelot wheel's button, which is not part of the search), and
 * `navigation` and `complementary` come from the sidebar and Inspector, which
 * own those elements. There is no `banner`: the in-window menu bar is gone, the
 * one menu bar being the native one. Nothing declares a landmark twice.
 *
 * The status role lives on the region wrapper rather than inside the
 * component: the wrapper is the landmark, and a component that later ends up
 * somewhere else should not carry the shell's semantics with it.
 *
 * The banner follows the same rule: no banner, no element, no height.
 *
 * Offline, a veil is laid over the page in the same grid cell (not opacity on the page: that
 * would make it a stacking context and trap its dialogs under the banner), and a capture-phase listener on the content element stops presses
 * before the page sees them. It sits on `main` only, so the header, sidebar,
 * Inspector, player and status strip (all outside it) keep working.
 *
 * The content element keeps its historical `app-main` class alongside the grid
 * class, because screen styling in `App.css` and `screens.css` is written
 * against `.app-main .screen`. Renaming it would be a much larger change than
 * this step.
 */
export function AppShellLayout({
  header,
  sidebar,
  inspector,
  player,
  statusBar,
  banner,
  offline,
  onBlockedClick,
  children,
  pagePhase,
}: AppShellLayoutProps) {
  const content = useRef<HTMLElement | null>(null);
  const blocked = useRef(onBlockedClick);
  blocked.current = onBlockedClick;

  useEffect(() => {
    const element = content.current;
    if (!offline || !element) return;
    const stop = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(PRESSABLE)) return;
      // A dialog opened from the page keeps working: it is how the person closes it.
      if (target.closest(DIALOGS)) return;
      event.preventDefault();
      event.stopPropagation();
      blocked.current?.();
    };
    element.addEventListener("click", stop, true);
    return () => element.removeEventListener("click", stop, true);
  }, [offline]);

  return (
    <div className="app-shell">
      {header ? <div className="app-shell__header">{header}</div> : null}
      {sidebar ? <div className="app-shell__sidebar">{sidebar}</div> : null}
      {banner ? <div className="app-shell__banner">{banner}</div> : null}
      <main
        className="app-shell__content app-main"
        data-page-phase={pagePhase}
        data-offline={offline ? "" : undefined}
        ref={content}
      >
        {children}
      </main>
      {offline ? <div className="app-shell__veil" aria-hidden="true" /> : null}
      {inspector ? <div className="app-shell__inspector">{inspector}</div> : null}
      {player ? <div className="app-shell__player">{player}</div> : null}
      {statusBar ? (
        <footer className="app-shell__status">{statusBar}</footer>
      ) : null}
    </div>
  );
}

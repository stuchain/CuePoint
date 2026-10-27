import { useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { UNSAFE_LocationContext as LocationContext } from "react-router-dom";
import { OverflowHintHost } from "../OverflowHintHost";
import { findOwningDestination } from "./navRegistry";
import { DIALOGS, keepInert } from "./offlineInert";
import { installPaneKeys } from "./shellKeyboard";
import { queryShown } from "./pageActive";
import "./AppShellLayout.css";

interface AppShellLayoutProps {
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

/**
 * What a click can press: a click inside one of these is stopped while offline. The page is also
 * `inert` then (offlineInert.ts), which is what keeps radios, selects, sliders and fields from
 * changing; this is the net under it for a press that reaches the page before the attribute is
 * set (a page that has only just drawn).
 */
const PRESSABLE = 'button, [role="menuitem"], [role="button"], a[href], input[type="checkbox"]';

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
 * `navigation` and `complementary` come from the sidebar and Inspector, which
 * own those elements, and `search` is the search dialog's own form, present only
 * while it is open (K8, DEC-282). There is no `banner` landmark: the header band is gone
 * with the in-window menu bar (the offline banner row is not one). Nothing declares a landmark twice.
 *
 * The status role lives on the region wrapper rather than inside the
 * component: the wrapper is the landmark, and a component that later ends up
 * somewhere else should not carry the shell's semantics with it.
 *
 * The banner follows the same rule: no banner, no element, no height.
 *
 * Offline, a veil is laid over the page in the same grid cell (not opacity on the page: that
 * would make it a stacking context and trap its dialogs under the banner), and the page's content
 * is made `inert` (offlineInert.ts, D31): no hover, no hand cursor, nothing to focus, whatever the
 * control. Dialogs drawn inside it stay usable. Track details' body is inert too, so stars, tags
 * and notes cannot be edited into a failure (M364). It sits on `main` and the Inspector only, so
 * the sidebar, the banner, the player and the status strip keep working.
 *
 * F6 and Shift+F6 cycle the panes (`data-pane`, shellKeyboard.ts); the shell marks its own.
 *
 * The content element keeps its historical `app-main` class alongside the grid
 * class, because screen styling in `App.css` and `screens.css` is written
 * against `.app-main .screen`. Renaming it would be a much larger change than
 * this step.
 */
export function AppShellLayout({
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
  const playerRegion = useRef<HTMLDivElement | null>(null);
  const statusRegion = useRef<HTMLElement | null>(null);
  const sidebarRegion = useRef<HTMLDivElement | null>(null);
  const inspectorRegion = useRef<HTMLDivElement | null>(null);
  const blocked = useRef(onBlockedClick);
  blocked.current = onBlockedClick;

  // F6 and Shift+F6 between the panes (M459).
  useEffect(() => installPaneKeys(), []);

  const hasInspector = Boolean(inspector);

  // Offline the page's content, and Track details' body, stop answering (M363, M364).
  useEffect(() => {
    if (!offline) return;
    const stops: Array<() => void> = [];
    if (content.current) stops.push(keepInert(content.current));
    if (inspectorRegion.current) stops.push(keepInert(inspectorRegion.current, ".cp-inspector__body"));
    return () => stops.forEach((stop) => stop());
  }, [offline, hasInspector]);

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

  // A page opened by a menu, a shortcut or a link inside a page leaves focus where it was. On the rail
  // (its Search button, an entry for another page) or on nothing, that is wrong (item 14, M484): the
  // old control is still the focused element, so Chromium lights its :focus-visible ring once any key
  // is pressed, and Tab would start from it. Focus moves to the new page's heading instead, which
  // draws no ring and from which Tab goes to the page's first control. The heading is focusable only
  // while it holds focus. The entry that was pressed to open the page is the lit one now, and keeps
  // focus; focus inside a dialog or the page itself is left alone.
  const shownPhase = useRef(pagePhase);
  useEffect(() => {
    if (shownPhase.current === pagePhase) return;
    shownPhase.current = pagePhase;
    const page = content.current;
    const rail = sidebarRegion.current;
    const focused = document.activeElement;
    if (!page) return;
    const lost = focused === null || focused === document.body || focused === document.documentElement;
    const onRail = rail !== null && focused instanceof HTMLElement && rail.contains(focused);
    if (!lost && !onRail) return;
    if (onRail && focused instanceof HTMLElement && focused.getAttribute("aria-current") === "page") return;
    const heading = queryShown(".app-main h1");
    const target = heading instanceof HTMLElement ? heading : page;
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    target.focus({ preventScroll: true });
  }, [pagePhase]);

  // A page already seen comes back as it was left: its entrance motion is not played again (M381).
  // The destinations seen so far are remembered here; a first visit gets the phase as before.
  const location = useContext(LocationContext)?.location;
  const owner = location ? (findOwningDestination(location.pathname)?.id ?? null) : null;
  const seenPages = useRef(new Set<string>());
  const returning = useRef(false);
  if (owner !== null) {
    returning.current = seenPages.current.has(owner);
  }

  // A new page is held at its first look ("hold") for the frame that draws it, and its phase is
  // written on the frame after: the page's motion then starts once it is on the screen, rather
  // than spending itself on a long first frame (DEC-134 as amended). Written on the element, not
  // rendered, so the two frames cost no render.
  useLayoutEffect(() => {
    const page = content.current;
    if (!page || pagePhase === undefined) return undefined;
    if (owner !== null) seenPages.current.add(owner);
    if (returning.current) {
      // Returning: no entrance, so nothing names a step-in for it (motion.css keys on "hold", "a", "b").
      page.setAttribute("data-page-phase", "return");
      return undefined;
    }
    page.setAttribute("data-page-phase", "hold");
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => page.setAttribute("data-page-phase", pagePhase));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [pagePhase, owner]);

  // The toast stack is rendered outside the shell, so the room the player and status strip take
  // goes on the root element, where it can lift the stack clear of them.
  const hasPlayer = Boolean(player);
  const hasStatus = Boolean(statusBar);
  useEffect(() => {
    const root = document.documentElement;
    const regions = [playerRegion.current, statusRegion.current].filter((el): el is HTMLElement => el !== null);
    const measure = () => {
      const total = regions.reduce((sum, el) => sum + el.offsetHeight, 0);
      root.style.setProperty("--shell-bottom-inset", `${total}px`);
    };
    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      for (const el of regions) observer.observe(el, { box: "border-box" });
    }
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--shell-bottom-inset");
    };
  }, [hasPlayer, hasStatus]);


  return (
    <div className="app-shell">
      {sidebar ? (
        <div className="app-shell__sidebar" ref={sidebarRegion} data-pane="navigation">
          {sidebar}
        </div>
      ) : null}
      {banner ? <div className="app-shell__banner">{banner}</div> : null}
      <main
        className="app-shell__content app-main"
        data-pane="page"
        data-offline={offline ? "" : undefined}
        ref={content}
      >
        {children}
      </main>
      {offline ? <div className="app-shell__veil" aria-hidden="true" /> : null}
      {inspector ? (
        <div className="app-shell__inspector" ref={inspectorRegion} data-pane="details">
          {inspector}
        </div>
      ) : null}
      {player ? (
        <div className="app-shell__player" ref={playerRegion} data-pane="player">
          {player}
        </div>
      ) : null}
      {statusBar ? (
        <footer className="app-shell__status" ref={statusRegion}>{statusBar}</footer>
      ) : null}
      {/* The whole value of anything cut short with "…" (data-cut-hint), in the app hint. */}
      <OverflowHintHost />
    </div>
  );
}

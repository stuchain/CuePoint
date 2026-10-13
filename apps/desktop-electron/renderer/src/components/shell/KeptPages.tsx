import {
  Activity,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  UNSAFE_LocationContext as LocationContext,
  matchPath,
  NavigationType,
  Routes,
  useLocation,
  useNavigationType,
  type Location,
} from "react-router-dom";

import { E2eCrashProbe, ErrorBoundary } from "../../reporting";
import { PageActiveContext } from "./pageActive";

/** One destination's pages: every path it owns and the `<Route>`s that draw them. */
export interface KeptSlot {
  id: string;
  /** Route patterns (`/discover/artist/:ref`), the destination's own path included. */
  paths: readonly string[];
  /** The slot's `<Route>`s; given the slot's own location, so a page reads its own opening. */
  routes: (location: Location) => ReactNode;
}

interface KeptPagesProps {
  slots: readonly KeptSlot[];
  /** `<Route>`s for a path no slot owns: the retired redirects and the way home. */
  unowned: ReactNode;
}

/** The slot a pathname belongs to, matched the way `<Routes>` would, or null. */
function ownerOf(pathname: string, slots: readonly KeptSlot[]): string | null {
  const slot = slots.find((candidate) =>
    candidate.paths.some((path) => matchPath({ path, end: true }, pathname) !== null),
  );
  return slot?.id ?? null;
}

interface PageSlotProps {
  active: boolean;
  location: Location;
  routes: ReactNode;
}

/**
 * One destination's page, alive whether or not it is shown.
 *
 * The comparator is the point of the memo: a hidden page must not be drawn again because
 * the shell was. The shown page always is, so the callbacks it holds stay fresh.
 */
const PageSlot = memo(
  function PageSlot({ active, location, routes }: PageSlotProps) {
    // Each time the page is hidden or shown again: a page that threw is given a fresh try
    // when it is reopened, as it was when leaving unmounted it, and its error screen does
    // not linger in the document behind the page now shown (REPORT-06).
    const [turn, setTurn] = useState({ active, count: 0 });
    if (turn.active !== active) setTurn({ active, count: turn.count + 1 });
    return (
      <Activity mode={active ? "visible" : "hidden"}>
        <PageActiveContext.Provider value={active}>
          {/* The page reads this slot's last location, not the app's: useLocation inside a
              hidden page keeps what it had. */}
          <LocationContext.Provider value={{ location, navigationType: NavigationType.Pop }}>
            {/* Inside the slot, so a hidden page that throws does not blank the shown one,
                and it clears when this page's own path changes or it is shown again. */}
            <ErrorBoundary scope="page" resetKey={`${location.pathname}#${turn.count}`}>
              <Routes location={location}>{routes}</Routes>
              <E2eCrashProbe />
            </ErrorBoundary>
          </LocationContext.Provider>
        </PageActiveContext.Provider>
      </Activity>
    );
  },
  (before, after) => !before.active && !after.active && before.location === after.location,
);

/**
 * Keeps every destination the user has opened alive, so coming back finds the page as it
 * was left (its state, its filters, its selection) instead of rebuilding and re-reading it.
 *
 * Each destination gets a slot the first time it is shown, hidden by Activity from then on.
 * A slot holds the last location seen while it was shown, so Discover's Artist page is still
 * on its artist when the user returns from Clean. Activity runs a hidden page's effect
 * cleanups, so its polls and Inspector content stop until it is shown again (`usePageActive`).
 *
 * The scroll belongs here because the one `.app-main` is shared: the shown slot's position
 * is recorded, per page of the slot, as it scrolls and put back when that page is shown
 * again. A page's first visit and a navigation that carries state (an opening from another
 * page, but not Back or Forward to one) start at the top.
 */
export function KeptPages({ slots, unowned }: KeptPagesProps) {
  const location = useLocation();
  const owner = ownerOf(location.pathname, slots);

  // The last location each visited slot was shown at. Worked out while rendering, as the
  // shell's page phase is, so the new slot is drawn in the same pass and never a frame late.
  const [seen, setSeen] = useState<Readonly<Record<string, Location>>>({});
  if (owner !== null && seen[owner]?.key !== location.key) {
    setSeen({ ...seen, [owner]: location });
  }

  const navigationType = useNavigationType();
  // Where each page of each slot was scrolled to, by pathname: Prepare's `/prepare` hands on
  // to `/prepare/<last Set>`, and going back to that Set finds its place again.
  const shown = useRef<{ id: string | null; pathname: string; scroll: Map<string, Map<string, number>> }>({
    id: null,
    pathname: "",
    scroll: new Map(),
  });

  useEffect(() => {
    const main = document.querySelector(".app-main");
    if (!main) return;
    const onScroll = () => {
      const { id, pathname, scroll } = shown.current;
      if (id !== null) scroll.get(id)?.set(pathname, main.scrollTop);
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const main = document.querySelector(".app-main");
    const before = shown.current;
    const samePage = before.id === owner && before.pathname === location.pathname;
    shown.current = { ...before, id: owner, pathname: location.pathname };
    if (owner === null) return;
    let pages = before.scroll.get(owner);
    if (!pages) {
      pages = new Map();
      before.scroll.set(owner, pages);
    }
    // An opening from another page starts at the top; Back and Forward to one do not.
    const opening = location.state != null && navigationType !== NavigationType.Pop;
    // A replace that only spends an opening (state cleared) moves nothing.
    if (samePage && !opening) return;
    const top = pages.get(location.pathname);
    if (top !== undefined && !opening) {
      if (main) main.scrollTop = top;
      return;
    }
    pages.set(location.pathname, 0);
    window.scrollTo(0, 0);
    main?.scrollTo(0, 0);
  }, [owner, location.key, location.pathname, location.state, navigationType]);

  return (
    <>
      {slots.map((slot) => {
        const slotLocation = slot.id === owner ? location : seen[slot.id];
        if (!slotLocation) return null;
        return (
          <PageSlot
            key={slot.id}
            active={slot.id === owner}
            location={slotLocation}
            routes={slot.routes(slotLocation)}
          />
        );
      })}
      {owner === null && <Routes>{unowned}</Routes>}
    </>
  );
}

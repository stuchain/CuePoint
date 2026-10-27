import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  INSPECTOR_DEFAULT_WIDTH,
  inspectorVisible,
  inspectorWidthFromPx,
  inspectorWidthPx,
  loadInspectorState,
  saveInspectorState,
  withInspectorChoice,
  type InspectorState,
} from "./inspectorState";
import { useInspectorAutoOpen, useInspectorHasContent } from "./inspectorSlot";
import { DETAILS_PANEL_ID, focusDetailsToggle, publishDetails } from "./detailsToggle";
import { CloseButton } from "../CloseButton";
import { findOwningDestination } from "./navRegistry";
import { useMotion } from "../../tokens/MotionContext";
import { useScaleFactor } from "../../tokens/ScaleContext";
import { leaveAsGhost } from "../../tokens/useLeaveGhost";
import { useSelectedTrack, type SelectedTrack } from "./selectedTrack";
import { escapeClosesPanel, isDialogOpen } from "./shellKeyboard";
import { useShellCommand } from "./shellCommands";
import { reportViewState } from "../../api/menuViewState";
import "./TrackInspector.css";

interface TrackInspectorProps {
  /**
   * What to show for the current selection.
   *
   * The slot later phases fill: Phase 4 renders library track details here,
   * Phase 7 the Beatport comparison, and so on. Empty in Phase 2 by DEC-024,
   * so the container and its persistence can be finished and trusted before
   * anything depends on them.
   */
  children?: ReactNode;
}

/**
 * The Track details container (DEC-018, DEC-024).
 *
 * Persists across navigation — it lives in the shell, not in any screen, so
 * moving between destinations never unmounts it. Width is remembered, and so is whether the
 * user opened or closed it, page by page.
 *
 * Whether it shows is the page's stored choice, else whether a track is selected there on
 * a page that lets a selection open it (K1, DEC-280, amending DEC-018 and DEC-024).
 * Hidden, it renders nothing and takes no column, so the page uses the full width; the
 * Details toggle is the last button of the page header (detailsToggle.tsx).
 *
 * It holds no track data of its own: each page puts its content in the slot
 * (LIBUI-10). Wiring it to the old Results screen's selection was rejected in
 * DEC-024, because it would have built a panel against a match-result shape
 * that Phase 7 retired.
 */
/** How long a selection waits before it opens Track details: the double-click window (K1). */
export const INSPECTOR_AUTO_OPEN_DELAY_MS = 500;

/** One arrow press on the resize handle, in pixels at the current size. */
const INSPECTOR_NUDGE = 16;

export function TrackInspector({ children }: TrackInspectorProps) {
  // The width is kept in 1× units and drawn times the scale, so a bigger text size
  // widens the panel with it (R2-4, DEC-273).
  const scale = useScaleFactor();
  const [state, setState] = useState<InspectorState>(() => loadInspectorState(scale));
  const [dragging, setDragging] = useState(false);
  const selected = useSelectedTrack();
  // The page is the destination the location belongs to (K1); Discover's sub-pages share it.
  const page = findOwningDestination(useLocation().pathname)?.id ?? "other";
  const autoOpen = useInspectorAutoOpen();
  // A page with no track list puts nothing in the slot: no panel, and no Details toggle (M490).
  const hasContent = useInspectorHasContent();
  // Which page a selection was first seen on. On a page change the new page still reads the
  // old page's selection (and its slot) for a commit, until that page's cleanup runs; a
  // selection only opens the panel on the page it came from, so the panel never flashes open.
  const [seen, setSeen] = useState<{ selection: SelectedTrack | null; page: string }>({
    selection: selected,
    page,
  });
  if (seen.selection !== selected) setSeen({ selection: selected, page });
  const selectionHere = selected !== null && seen.page === page;
  // A selection that would open the panel by itself waits out the double-click window, so the
  // page does not reflow between the two clicks of a double-click on an unselected row. A
  // cleared selection or a page change cancels the wait; folding is immediate.
  const autoOpening = !state.choice[page] && selectionHere && autoOpen;
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!autoOpening) {
      setArmed(false);
      return;
    }
    const timer = setTimeout(() => setArmed(true), INSPECTOR_AUTO_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoOpening]);
  const visible =
    hasContent &&
    (state.choice[page] ? inspectorVisible(state, page, selectionHere, autoOpen) : autoOpening && armed);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const panelRef = useRef<HTMLElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  // Only move focus when the user toggled, never on the initial render nor when the
  // selection opens or folds the panel by itself: an app that steals focus on launch is
  // worse than one that never moves it.
  const toggled = useRef(false);
  // Showing and hiding the panel move (Opening and closing panels and dialogs): it enters on
  // a toggle, never on launch, and leaves as a still copy that fades.
  const moves = useMotion("entrance");
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    saveInspectorState(state);
  }, [state]);

  // A stored width can outlive the window it was chosen in — a panel sized on a
  // wide monitor, reopened on a laptop. Clamp on mount and on resize, but never
  // write the clamped value back: the user's choice returns when there is room.
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const width = inspectorWidthPx(state.width, scale, windowWidth);

  // A button asks for focus to follow (the panel's close hands it to the Details toggle). The
  // shortcut and the menu leave it where it was (M472), unless it was inside the panel that closes.
  const toggle = useCallback(
    (moveFocus = true) => {
      const panel = panelRef.current;
      toggled.current =
        moveFocus || Boolean(panel && document.activeElement && panel.contains(document.activeElement));
      if (panel && moves) leaveAsGhost(panel);
      setEntering(!panel);
      setState((prev) => withInspectorChoice(prev, page, !visibleRef.current));
    },
    [moves, page],
  );
  const toggleByButton = useCallback(() => toggle(true), [toggle]);
  const toggleByKey = useCallback(() => toggle(false), [toggle]);

  // Hiding removes the panel's own close button: focus goes to the header's Details toggle,
  // which opens it again. Opening moves focus to the panel's close button, as before.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    if (visible) hideRef.current?.focus();
    else focusDetailsToggle();
  }, [visible]);

  // Only a toggle plays the entrance: a panel the selection opens just appears (K1).
  useEffect(() => {
    if (!visible) setEntering(false);
  }, [visible]);

  // The page header draws the Details toggle (detailsToggle.tsx); this tells it the state.
  useEffect(() => {
    publishDetails(hasContent ? { open: visible, toggle: toggleByButton } : null);
  }, [visible, toggleByButton, hasContent]);
  useEffect(() => () => publishDetails(null), []);

  // View → Track details in the menu, which carries a tick while the panel shows.
  useShellCommand("toggle-inspector", toggleByKey);
  useEffect(() => reportViewState({ inspector: visible }), [visible]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "i") {
        // Not behind an open dialog (C201).
        if (isDialogOpen()) return;
        event.preventDefault();
        toggleByKey();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleByKey]);

  const startResize = useCallback(
    (startX: number) => {
      const startWidth = width;
      // Dragging the left edge leftwards widens the panel, so the delta is
      // inverted compared with the results frame's bottom-right grip.
      const onMove = (event: MouseEvent) => {
        setState((prev) => ({
          ...prev,
          width: inspectorWidthFromPx(
            inspectorWidthPx(
              inspectorWidthFromPx(startWidth + (startX - event.clientX), scale),
              scale,
              window.innerWidth,
            ),
            scale,
          ),
        }));
      };
      const onUp = () => {
        setDragging(false);
        document.body.classList.remove("cp-inspector-resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      setDragging(true);
      document.body.classList.add("cp-inspector-resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, scale],
  );

  const nudge = useCallback(
    (delta: number) => {
      setState((prev) => ({
        ...prev,
        width: inspectorWidthFromPx(
          inspectorWidthPx(
            inspectorWidthFromPx(inspectorWidthPx(prev.width, scale, window.innerWidth) + delta, scale),
            scale,
            window.innerWidth,
          ),
          scale,
        ),
      }));
    },
    [scale],
  );

  if (!visible) return null;

  return (
    <aside
      ref={panelRef}
      id={DETAILS_PANEL_ID}
      className="cp-inspector"
      data-entering={entering ? "" : undefined}
      style={{ width: `${width}px` }}
      // Escape closes the panel that has focus (C29).
      onKeyDown={(event) => {
        if (escapeClosesPanel(event)) {
          event.preventDefault();
          toggleByButton();
        }
      }}
      aria-label="Track details"
      data-width={width}
    >
      <header className="cp-panel-header cp-side-head cp-inspector__header">
        <h2 className="cp-panel-header__title">Track details</h2>
        <CloseButton
          ref={hideRef}
          className="cp-inspector__hide"
          onClick={toggleByButton}
          aria-expanded
          aria-label="Hide track details"
          shortcut="Mod+I"
        />
      </header>

      <div className="cp-inspector__body">
        {children ?? (
          <p className="cp-inspector__empty">
            Nothing selected on this page.
          </p>
        )}
      </div>

      {/*
        A separator role rather than a button: this is a resize handle, and
        making it focusable with arrow-key support is what keeps the panel
        resizable without a mouse. Last in the panel, so it is not the first tab stop (M359); it
        is drawn on the left edge by its own position. Enter puts the width back.
      */}
      <div
        className={`cp-inspector__handle ${dragging ? "cp-inspector__handle--active" : ""}`.trim()}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize track details"
        aria-valuenow={width}
        tabIndex={0}
        onMouseDown={(event) => {
          event.preventDefault();
          startResize(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            nudge(INSPECTOR_NUDGE);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            nudge(-INSPECTOR_NUDGE);
          }
          if (event.key === "Enter") {
            event.preventDefault();
            setState((prev) => ({ ...prev, width: INSPECTOR_DEFAULT_WIDTH }));
          }
        }}
      />
    </aside>
  );
}

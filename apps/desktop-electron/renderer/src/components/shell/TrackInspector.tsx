import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  clampInspectorWidth,
  loadInspectorState,
  saveInspectorState,
  type InspectorState,
} from "./inspectorState";
import "./TrackInspector.css";

export interface TrackInspectorProps {
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
 * The Track Inspector container (DEC-018, DEC-024).
 *
 * Persists across navigation — it lives in the shell, not in any screen, so
 * moving between destinations never unmounts it. Width and visibility are
 * remembered.
 *
 * It holds no track data yet. Wiring it to the current `ResultsScreen`
 * selection was considered and rejected in DEC-024: that would build a panel
 * against the legacy `TrackResult` shape Phase 4 reworks, and duplicate
 * `CandidateDialog` in the meantime.
 */
export function TrackInspector({ children }: TrackInspectorProps) {
  const [state, setState] = useState<InspectorState>(loadInspectorState);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  const revealRef = useRef<HTMLButtonElement>(null);
  // Only move focus when the user toggled, never on the initial render: an app
  // that steals focus on launch is worse than one that never moves it.
  const toggled = useRef(false);

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

  const width = clampInspectorWidth(state.width, windowWidth);

  const toggle = useCallback(() => {
    toggled.current = true;
    setState((prev) => ({ ...prev, visible: !prev.visible }));
  }, []);

  // The control the user pressed disappears when the panel toggles, and focus
  // would land on <body> — a keyboard user would be back at the top of the tab
  // order with no idea where they are. Move it to the control that replaced it.
  useEffect(() => {
    if (!toggled.current) return;
    const next = state.visible ? hideRef.current : revealRef.current;
    next?.focus();
  }, [state.visible]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const startResize = useCallback(
    (startX: number) => {
      const startWidth = width;
      // Dragging the left edge leftwards widens the panel, so the delta is
      // inverted compared with the results frame's bottom-right grip.
      const onMove = (event: MouseEvent) => {
        setState((prev) => ({
          ...prev,
          width: clampInspectorWidth(startWidth + (startX - event.clientX), window.innerWidth),
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
    [width],
  );

  const nudge = useCallback(
    (delta: number) => {
      setState((prev) => ({
        ...prev,
        width: clampInspectorWidth(clampInspectorWidth(prev.width, window.innerWidth) + delta, window.innerWidth),
      }));
    },
    [],
  );

  if (!state.visible) {
    return (
      <div className="cp-inspector cp-inspector--hidden">
        <button
          ref={revealRef}
          type="button"
          className="cp-inspector__reveal"
          onClick={toggle}
          aria-expanded={false}
          aria-label="Show track inspector"
          title="Show track inspector (Ctrl+I)"
        >
          <span aria-hidden>‹</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      ref={panelRef}
      className="cp-inspector"
      style={{ width: `${width}px` }}
      aria-label="Track inspector"
      data-width={width}
    >
      {/*
        A separator role rather than a button: this is a resize handle, and
        making it focusable with arrow-key support is what keeps the panel
        resizable without a mouse.
      */}
      <div
        className={`cp-inspector__handle ${dragging ? "cp-inspector__handle--active" : ""}`.trim()}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize track inspector"
        aria-valuenow={width}
        tabIndex={0}
        onMouseDown={(event) => {
          event.preventDefault();
          startResize(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            nudge(16);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            nudge(-16);
          }
        }}
      />

      <header className="cp-inspector__header">
        <h2 className="cp-inspector__title">Inspector</h2>
        <button
          ref={hideRef}
          type="button"
          className="cp-inspector__hide"
          onClick={toggle}
          aria-expanded
          aria-label="Hide track inspector"
          title="Hide track inspector (Ctrl+I)"
        >
          <span aria-hidden>›</span>
        </button>
      </header>

      <div className="cp-inspector__body">
        {children ?? (
          <p className="cp-inspector__empty">
            Select a track to see its details here.
          </p>
        )}
      </div>
    </aside>
  );
}

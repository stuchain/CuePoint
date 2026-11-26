import { useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { UNSAFE_LocationContext as LocationContext } from "react-router-dom";

import { useLayerStack } from "../../hooks/useLayerStack";
import { Button } from "../Button";
import { CloseButton } from "../CloseButton";
import { Hint } from "../Hint";
import { CrowdScene } from "../crowd/CrowdScene";
import { useCrowdSetting } from "./crowdSetting";
import { PARTY_VIEW_ID, closePartyView, usePartyViewShown } from "./partyViewState";
import { partyScale } from "./partyViewScale";
import "./party-view.css";

/** What takes typed characters: Escape there belongs to the field. */
const TEXT_FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select, [contenteditable="true"]';

/** A resize settles for this long before the club is made again for its new width (ms). */
const RESIZE_SETTLE_MS = 120;

interface SceneBox {
  style: CSSProperties;
  /** The club's size in logical pixels, for the scene. */
  logicalWidth: number;
  logicalHeight: number;
}

/**
 * The club's box, measured on the stage: a whole-device-pixel scale and a logical size from the stage's
 * size (see `partyScale`), so the club fills the stage with no bars. Null:
 * not measured. The first size is taken at once; a resize is taken once it settles, so dragging the
 * window does not make a new crowd on every pixel.
 */
function useSceneBox(shown: boolean) {
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<SceneBox | null>(null);
  // The box goes to the stylesheet as two custom properties on the stage, which the scene reads.
  // Layout effect: the first size is known before the first paint, so nothing is drawn large and then fitted.
  useLayoutEffect(() => {
    const element = stage.current;
    if (!shown || !element) return undefined;
    const measure = () => {
      const style = getComputedStyle(element);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const rect = element.getBoundingClientRect();
      const scale = partyScale(rect.width - (padX || 0), rect.height - (padY || 0), window.devicePixelRatio || 1);
      setBox(
        scale
          ? {
              style: { "--party-w": `${scale.width}px`, "--party-h": `${scale.height}px` } as CSSProperties,
              logicalWidth: scale.logicalWidth,
              logicalHeight: scale.logicalHeight,
            }
          : null,
      );
    };
    measure();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, RESIZE_SETTLE_MS);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(settle);
    observer?.observe(element);
    // A zoom changes the device pixel ratio without resizing the stage in every case.
    window.addEventListener("resize", settle);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", settle);
    };
  }, [shown]);
  return { stage, box };
}

/** An Escape this soon after full screen ended is the one that ended it (ms). */
const ESCAPE_LEFT_MS = 150;

/**
 * Full screen for the view's own element (`requestFullscreen`; in Electron's renderer it fills the
 * window's screen). Unavailable where the document cannot (`fullscreenEnabled` is not true): the
 * button is then not shown. Left too when the view closes or unmounts, and when focus moves outside
 * the view (a search, a dialog or a toast opened over it is drawn outside the full screen element, so
 * it could not be seen). `justLeft()` says whether full screen ended a moment ago, for the Escape
 * that ended it.
 */
function useFullScreen(shown: boolean, element: RefObject<HTMLElement | null>) {
  const [full, setFull] = useState(false);
  const was = useRef(false);
  const leftAt = useRef(-Infinity);
  const available = typeof document !== "undefined" && document.fullscreenEnabled === true;
  useEffect(() => {
    if (!shown) return undefined;
    const sync = () => {
      const now = element.current !== null && document.fullscreenElement === element.current;
      if (was.current && !now) leftAt.current = performance.now();
      was.current = now;
      setFull(now);
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!document.fullscreenElement || !(target instanceof Node) || element.current?.contains(target)) return;
      void document.exitFullscreen?.()?.catch?.(() => undefined);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("focusin", onFocus);
    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("focusin", onFocus);
      // The view is closing (or the page changed): leave full screen first.
      if (document.fullscreenElement) void document.exitFullscreen?.()?.catch?.(() => undefined);
      was.current = false;
      setFull(false);
    };
  }, [shown, element]);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.()?.catch?.(() => undefined);
    else void element.current?.requestFullscreen?.()?.catch?.(() => undefined);
  };
  const justLeft = () => performance.now() - leftAt.current < ESCAPE_LEFT_MS;
  return { available, full, toggle, justLeft };
}

/**
 * The Party view: the dancing crowd, large, over the page area (not the sidebar, not the player
 * bar, so the player stays usable). Mounted by the shell in the page's own grid cell
 * (`AppShellLayout`'s `overlay`), which makes the page behind it inert while it is shown. Not
 * modal (`aria-modal="false"`): the player's keys, Space included, still work. The crowd is
 * mounted only while the view is open, so the levels are only subscribed to while someone is
 * looking. The club fills the stage (no bars): its scale is whole device pixels and
 * its size is the stage's, both ways. A full screen button sits by the close button; Escape
 * in full screen leaves full screen only, and the next Escape closes. Focus moves to the close button
 * on opening. Escape closes it when it is the newest layer and no field has the key; a route change
 * and turning the setting off close it too.
 */
export function PartyView() {
  const shown = usePartyViewShown();
  const [enabled] = useCrowdSetting();
  const isTop = useLayerStack(shown);
  // Read through a ref: the listener is registered once per opening, not once per render.
  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;
  const close = useRef<HTMLButtonElement>(null);
  const { stage, box } = useSceneBox(shown);
  const root = useRef<HTMLDivElement>(null);
  const fullScreen = useFullScreen(shown, root);
  const fullScreenRef = useRef(fullScreen);
  fullScreenRef.current = fullScreen;

  useEffect(() => {
    if (!enabled) closePartyView();
  }, [enabled]);

  // A new page is a new place: the view does not follow the person there.
  const pathname = useContext(LocationContext)?.location.pathname;
  useEffect(() => {
    closePartyView();
  }, [pathname]);

  useEffect(() => {
    if (shown) close.current?.focus();
  }, [shown]);

  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest(TEXT_FIELD) !== null) return;
      // The newest layer's key: a menu or dialog opened over the view answers it first (M469).
      if (!isTopRef.current()) return;
      event.preventDefault();
      // The first Escape in full screen only leaves it: this one, or the one the browser just used for it.
      if (document.fullscreenElement) {
        void document.exitFullscreen?.()?.catch?.(() => undefined);
        return;
      }
      if (fullScreenRef.current.justLeft()) return;
      closePartyView();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown]);

  if (!shown) return null;
  return (
    <div ref={root} className="cp-party" id={PARTY_VIEW_ID} data-pane="party" role="dialog" aria-modal="false" aria-label="Party view">
      <div className="cp-party__corner">
        {fullScreen.available && (
          <Hint text={fullScreen.full ? "Leave full screen" : "Full screen"}>
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              icon="fullscreen"
              aria-label="Full screen"
              aria-pressed={fullScreen.full}
              onClick={fullScreen.toggle}
            />
          </Hint>
        )}
        <CloseButton ref={close} aria-label="Close party view" onClick={closePartyView} />
      </div>
      <div className="cp-party__stage" ref={stage} style={box?.style}>
        <CrowdScene className="cp-party__scene" width={box?.logicalWidth} height={box?.logicalHeight} />
      </div>
    </div>
  );
}

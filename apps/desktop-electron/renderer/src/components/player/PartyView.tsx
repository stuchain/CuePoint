import { useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { UNSAFE_LocationContext as LocationContext } from "react-router-dom";

import { useLayerStack } from "../../hooks/useLayerStack";
import { CloseButton } from "../CloseButton";
import { CrowdScene } from "../crowd/CrowdScene";
import { useCrowdSetting } from "./crowdSetting";
import { PARTY_VIEW_ID, closePartyView, usePartyViewShown } from "./partyViewState";
import { partyScale } from "./partyViewScale";
import "./party-view.css";

/** What takes typed characters: Escape there belongs to the field. */
const TEXT_FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select, [contenteditable="true"]';

/** The scene's box, as whole device pixels of art allow, measured on the stage. Null: not measured. */
function useSceneBox(shown: boolean) {
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<CSSProperties | null>(null);
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
      setBox(scale ? ({ "--party-w": `${scale.width}px`, "--party-h": `${scale.height}px` } as CSSProperties) : null);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    // A zoom changes the device pixel ratio without resizing the stage in every case.
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [shown]);
  return { stage, box };
}

/**
 * The Party view: the dancing crowd, large, over the page area (not the sidebar, not the player
 * bar, so the player stays usable). Mounted by the shell in the page's own grid cell
 * (`AppShellLayout`'s `overlay`), which makes the page behind it inert while it is shown. Not
 * modal (`aria-modal="false"`): the player's keys, Space included, still work. The crowd is
 * mounted only while the view is open, so the levels are only subscribed to while someone is
 * looking. Focus moves to the close button on opening. Escape closes it when it is the newest
 * layer and no field has the key; a route change and turning the setting off close it too.
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
      closePartyView();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="cp-party" id={PARTY_VIEW_ID} data-pane="party" role="dialog" aria-modal="false" aria-label="Party view">
      <CloseButton ref={close} className="cp-party__close" aria-label="Close party view" onClick={closePartyView} />
      <div className="cp-party__stage" ref={stage} style={box ?? undefined}>
        <CrowdScene className="cp-party__scene" />
      </div>
    </div>
  );
}

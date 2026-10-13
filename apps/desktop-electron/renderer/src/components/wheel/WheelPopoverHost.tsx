import { useEffect } from "react";
import { createPortal } from "react-dom";

import { usePresence } from "../../tokens/usePresence";
import { WheelPopover } from "./WheelPopover";
import { closeWheel, useWheelState } from "./wheelStore";

/**
 * The one Camelot wheel popover, always mounted by the shell (K8, DEC-282), so either opener
 * works: Track details' button, or the player bar's key when Track details has nothing to show.
 * It is drawn in the body, fixed under whichever opener was used, so no scrolling panel clips it.
 *
 * Escape, a press outside and the opener itself close it. A press on an opener is not
 * "outside": the opener's own click decides.
 */
export function WheelPopoverHost() {
  const { open, source, anchor } = useWheelState();
  // Closing plays an exit while the popover is kept as an inert copy (PAGES-12).
  const pop = usePresence<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-wheel-opener], .cp-wheel-pop")) return;
      closeWheel({ restoreFocus: false });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWheel();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!pop.present) return null;
  return createPortal(
    <WheelPopover source={source} anchor={anchor} leaving={pop.leaving} presenceRef={pop.ref} />,
    document.body,
  );
}

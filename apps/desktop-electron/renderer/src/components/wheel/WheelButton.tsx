import { useEffect, useRef } from "react";

import { PixelIcon } from "../PixelIcon";
import { WheelPopover } from "./WheelPopover";
import { closeWheel, toggleWheel, useWheelState } from "./wheelStore";
import "./WheelButton.css";

/**
 * The Camelot wheel's button, in the header beside search (HDR-4, DEC-133), and the
 * popover it opens. The player bar's key opens the same popover (BAR-5).
 *
 * Escape, a press outside and the button itself close it. A press on either opener
 * is not "outside": the opener's own click decides.
 */
export function WheelButton() {
  const { open, source } = useWheelState();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (rootRef.current?.contains(target) || target?.closest?.("[data-wheel-opener]")) return;
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

  return (
    <div ref={rootRef} className="cp-wheel-button">
      <button
        type="button"
        className="cp-wheel-button__button"
        data-wheel-opener=""
        aria-label="Camelot wheel"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Camelot wheel: see which keys mix with a track"
        onClick={() => toggleWheel("header")}
      >
        <PixelIcon name="wheel" />
      </button>
      {open && <WheelPopover source={source} />}
    </div>
  );
}

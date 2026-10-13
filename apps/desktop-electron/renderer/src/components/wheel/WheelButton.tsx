import { PixelIcon } from "../PixelIcon";
import { toggleWheel, useWheelState } from "./wheelStore";
import "./WheelButton.css";

/**
 * The Camelot wheel's button, on Track details' key line (K8, DEC-282; it sat in the
 * header beside search under HDR-4, DEC-133). It is only a button: the popover it opens is
 * the one `WheelPopoverHost` mounts, which the player bar's key opens too (BAR-5).
 */
export function WheelButton() {
  const { open } = useWheelState();
  return (
    <div className="cp-wheel-button">
      <button
        type="button"
        className="cp-wheel-button__button"
        data-wheel-opener=""
        aria-label="Camelot wheel"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Camelot wheel: see which keys mix with a track"
        onClick={() => toggleWheel("details")}
      >
        <PixelIcon name="wheel" />
      </button>
    </div>
  );
}

import { toggleWheel, useWheelState } from "./wheelStore";
import "./WheelButton.css";

const SEGMENTS = Array.from({ length: 12 }, (_, index) => index + 1);
const CENTRE = 12;
const RADIUS = 8;

/** One 30-degree arc of the ring, number 1 at the top and the rest clockwise, as the wheel is drawn. */
function arc(number: number): string {
  const point = (turn: number) => {
    const angle = (turn / 12) * 2 * Math.PI - Math.PI / 2;
    return `${(CENTRE + RADIUS * Math.cos(angle)).toFixed(2)} ${(CENTRE + RADIUS * Math.sin(angle)).toFixed(2)}`;
  };
  return `M ${point(number - 1)} A ${RADIUS} ${RADIUS} 0 0 1 ${point(number)}`;
}

/** A mini Camelot ring in the twelve key colours (the same tokens the key chips use). */
function MiniWheel() {
  return (
    <svg className="cp-wheel-button__ring" viewBox="0 0 24 24" aria-hidden focusable="false">
      {SEGMENTS.map((number) => (
        <path key={number} d={arc(number)} style={{ stroke: `var(--key-${number}A)` }} />
      ))}
    </svg>
  );
}

/**
 * The Camelot wheel's button, on Track details' key line after the key's name (K8, DEC-282;
 * it sat in the header beside search under HDR-4, DEC-133): a small bordered button with a
 * mini coloured ring and the word "Wheel". It is only a button: the popover it opens is the
 * one `WheelPopoverHost` mounts, which the player bar's key opens too (BAR-5).
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
        <MiniWheel />
        <span className="cp-wheel-button__word" aria-hidden>
          Wheel
        </span>
      </button>
    </div>
  );
}

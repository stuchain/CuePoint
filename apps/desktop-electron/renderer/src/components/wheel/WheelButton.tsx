import { Hint } from "../Hint";
import { keyLabel } from "./camelot";
import { camelotOf } from "./keyColour";
import { useKeyNotation } from "./keyNotationSetting";
import { toggleWheel, useWheelState } from "./wheelStore";
import "./KeyChip.css";
import "./WheelButton.css";

/**
 * The Camelot wheel's button is the coloured key chip itself (Track details' key, the key in the
 * player bar's facts line): pressing the key opens the wheel. There is no separate ring or
 * "Wheel" button. It is only a button: the popover it opens is the one `WheelPopoverHost`
 * mounts, which both places open (BAR-5). A track with no key shows a muted dash in the same
 * button, so the wheel (and its "Match on Beatport") is still one press away.
 */
export function WheelButton({
  source = "details",
  keyName,
}: {
  /** Which surface opened the wheel; the popover lays itself out by it. */
  source?: "details" | "player";
  /** The track's key, as written (Camelot or classic): drawn as its Camelot chip, and named in the button. */
  keyName?: string | null;
} = {}) {
  const { open } = useWheelState();
  const notation = useKeyNotation();
  const text = (keyName ?? "").trim();
  const code = camelotOf(text);
  const name = text ? `Show ${code ?? text} on the Camelot wheel` : "Camelot wheel";
  return (
    <span className="cp-wheel-button">
      <Hint text={name} inline>
        <button
          type="button"
          className={`key-chip ${code ? `key-chip--${code} ` : ""}key-chip--button cp-data`}
          data-wheel-opener=""
          aria-label={name}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => toggleWheel(source)}
        >
          {code ? keyLabel(code, notation) : text || "—"}
        </button>
      </Hint>
    </span>
  );
}
